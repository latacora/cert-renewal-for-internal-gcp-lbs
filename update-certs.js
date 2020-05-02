require("dotenv").config();

const { v4 } = require("uuid")
const uuid4 = v4;

const {google} = require('googleapis');
const compute = google.compute('v1');
// Imports the Google Cloud client library
const { Storage } = require("@google-cloud/storage");

// Creates a client
const storage = new Storage();

// Helper function to generate unique names. 
// must satify this regex [a-z]([-a-z0-9]*[a-z0-9])?
function uuidRandom(){
	const randomLetter = Math.floor(Math.random() * (122 - 97 + 1)) + 97
	return String.fromCharCode(randomLetter) + uuid4(); 
}

async function insertRegionSslCertificate(certChain, privateKey, authClient, projectId, region) {
	console.log("inserting new region ssl certificate");
	const regionSslCertificateName = uuidRandom();	
	const result = await compute.regionSslCertificates.insert({
                auth: authClient,
                project: projectId,
                region: region,
		requestBody: {
			name: regionSslCertificateName,
			certificate: certChain,
			privateKey: privateKey

		}
        });
	// wait for completion wait 3 seconds or something? try/catch? is there a way to check status?
	const getCert = await compute.regionSslCertificates.get({
		auth: authClient,
                project: projectId,
                region: region,
		sslCertificate: regionSslCertificateName

	})
	console.log("returning region ssl certificate url");
	return getCert.data.selfLink;

}

async function getFile(bucket, filename) {
	let file = bucket.file(filename);

        let fileResponse = await file.download();
        let fileData = fileResponse[0].toString();
        return fileData;
}

async function updateDnsRecord(projectId, dnsPrivateZonename, dnsName, IPAddress, ttl) {
	console.log("updating dns record for " + dnsName);
	const {DNS} = require('@google-cloud/dns');	

        // Creates a client
        const dns = new DNS({
                projectId
        });
        //Update Cloud DNS Zone Entry
        const zone = dns.zone(dnsPrivateZonename);

        const record = zone.record('a', {
                name: dnsName,
                ttl: ttl,
                data: IPAddress
        });
	const replaceRecordsResponse = await zone.replaceRecords('a', [record])
	console.log("done adding record update request for " + dnsName);
	return replaceRecordsResponse;
}
async function insertNewForwardingRule(authClient, regionalHttpsProxy, network, subnetwork, project, region) {
	console.log("inserting new regional forwarding rule");
	const newRegionalForwardingRuleName = uuidRandom();
        const newForwardingRuleResponse = await compute.forwardingRules.insert({
                auth: authClient,
                project:project,
                region:region,
                requestBody: {
                        name: newRegionalForwardingRuleName,
                        target: regionalHttpsProxy,
                        loadBalancingScheme: "INTERNAL_MANAGED",
                        portRange: ["443"],
                        IPProtocol: "TCP",
			network,
			subnetwork
                }

        });
	// getting the ip address now
	//
	// TODO: Set timeout for this
	let getForwardingRuleResponse = await compute.forwardingRules.get({
		auth: authClient,
		project:project,
		region:region,
		forwardingRule: newRegionalForwardingRuleName
	})
	while (!getForwardingRuleResponse.data.IPAddress) {
		console.log("waiting three seconds for forwarding rule ip...");
		await new Promise((r) => setTimeout(r, 3000)); 
		getForwardingRuleResponse = await compute.forwardingRules.get({
                	auth: authClient,
                	project:project,
                	region:region,
                	forwardingRule: newRegionalForwardingRuleName
        	})

	}
	console.log("returning ip address of forwarding rule");
	return {IPAddress: getForwardingRuleResponse.data.IPAddress};
}

async function insertRegionTargetHttpsProxy(authClient, projectId, region, urlMap, certs){
	console.log("inserting new region target https proxy");
	const regionTargetHttpsProxyName = uuidRandom();
        const regionHttpsProxiesResponse = await compute.regionTargetHttpsProxies.insert({
                auth: authClient,
                project: projectId,
                region: region,
                requestBody: {
                        urlMap: urlMap,
                        sslCertificates: certs,
                        name: regionTargetHttpsProxyName
                }
        });

        // Need to wait until the httpsProxy is ready? I'm not sure how to check for creation status
        // waiting 3 seconds
	console.log("waiting 3 seconds after insert region target https proxy");
        await new Promise((r) => setTimeout(r, 3000));
        ////////////////////////////////////////////////////

        const getHttpsProxyResponse = await compute.regionTargetHttpsProxies.get({
                auth: authClient,
                project: projectId,
                region: region,
                targetHttpsProxy: regionTargetHttpsProxyName

        })
	console.log("returning new region target https proxy");
	return {name: regionTargetHttpsProxyName, url: getHttpsProxyResponse.data.selfLink}

}

async function updateLoadBalancerCerts() {
	
	const serverPrivateKeyPemFile = process.env.SERVER_PRIV_KEY_PEM_FILE ? process.env.SERVER_PRIV_KEY_PEM_FILE : "serverPrivateKey.pem";
	const certChainFile = process.env.CERT_CHAIN_FILE ? process.env.CERT_CHAIN_FILE : "certChain.pem";

	const authClient = await google.auth.getClient({
                scopes: [ 'https://www.googleapis.com/auth/compute' ]
        });
        const projectId = process.env.PROJECT_ID;
	const region = process.env.REGION;
	
	const bucket = storage.bucket(process.env.GCP_BUCKET);
	// Get cert/keys files from google storage bucket
	
	// Get server private key from google storage bucket
	const serverPrivateKey = await getFile(bucket, serverPrivateKeyPemFile);

	// Get cert chain from google storage bucket
	const certChain = await getFile(bucket, certChainFile);

	// Get network url
	const network = await compute.networks.get({
		auth: authClient,
                project:projectId,
                network:process.env.NETWORK 

	})
	const networkUrl = network.data.selfLink
	// Get subnet url
	const subnetwork = await compute.subnetworks.get({
                auth: authClient,
                project:projectId,
		region: region,
                subnetwork:process.env.SUBNETWORK

        })
        const subnetworkUrl = subnetwork.data.selfLink
	/////////////////////////////////////////////////////////////////////////////////////
	
	// Add new region cert
	const regionSslCert = await insertRegionSslCertificate(certChain, serverPrivateKey, authClient, projectId, region);
	const newCerts = [regionSslCert];
	
	/// Get all the certs if you want to use multiple certs or want to delete old certs
	/*
	const result = await compute.regionSslCertificates.list({
                auth: authClient,
                project: projectId,
                region: region
        });

        const certs = result.data

	// You can have up to 15 certs on a httpsTargetProxy. May need implement some logic to drop older certs
        const certUrls = certs.items.map(x => x.selfLink)
        console.log(certUrls);
	*/

	///////////////////////////////////////////////////////////////////////////////////////
	
	// check httpsproxies
	/*
	const httpsProxiesResponse = await compute.regionTargetHttpsProxies.list({
		auth: authClient,
		project: projectId,
		region: region
	});
	console.log(httpsProxiesResponse.data.items)
	*/
	////////////////////////////////////////////////////////////////////////////
	// urlMap
	// not really sure how to pick the correct urlMap at this time - might something that you have defined and set as an env var
	const urlMapResponse = await compute.regionUrlMaps.list({
		auth: authClient,
		project: projectId,
		region: region
	})
	const urlMap = urlMapResponse.data.items[0].selfLink

	////////////////////////////////////////////////////////////////////////	
	
	const regionTargetHttpsProxy = await insertRegionTargetHttpsProxy(authClient, projectId, region, urlMap, newCerts)
	
	// Is it worth deleting the old regionHttpsProxy?
	///////////////////////////////////////////////////////////////////////////////////////////////////
	
	// Not in use
	/*
	let forwardingRulesResponse = await compute.forwardingRules.list({
		auth: authClient,
                project: projectId,
                region: region
        });
	console.log(forwardingRulesResponse.data.items[0]);
	*/

	/* Opted to go for a different strategy since I kept getting the following error: wrong collection: expected [compute.targetHttpsProxies], got [compute.regionTargetHttpsProxies]. or 400 `Invalid target type TARGET_HTTPS_PROXY for forwarding rule in scope REGION` when trying to setTarget for forwarding rule. I guess it thinks that either the httpsProxy or the forwardingRule is global, but I'm using the regional methods. But works (200 response) when you setTarget to the targetHttpsProxy that is already set. Also, the setSslCertificates function is only available on global targetHttpsProxies
        const forwardingRulesPatchResponse = await compute.forwardingRules.setTarget({
                auth: authClient,
                project: projectId,
                region: region,
                forwardingRule: forwardingRulesResponse.data.items[0].name,
                //resourceId: forwardingRulesResponse.data.items[0].selfLink,
                requestBody: {
                        target: regionHttpsProxiesResponse.data.targetLink
                }
        });
        */
	/////////////////////////////////////////////////////////////////////////////////////////

	// We previously picked 10.1.2.99 for the terraform. You could change the insertNewForwardingRule function to take an IP address.
	const newForwardingRuleResponse = await insertNewForwardingRule(authClient, regionTargetHttpsProxy.url, networkUrl, subnetworkUrl, projectId, region)
	//TODO: Delete the old forwarding rule if unable to update in place
	

	// We previously picked 10.1.2.99 for the terraform. If you pick something different, you'll need to update the Cloud DNS Private Zone as well
        // In this demonstration we are auto-assigned a new Ephemeral IP address which is returned to us so we can update the DNS Zone
	const dnsResponse = await updateDnsRecord(projectId, process.env.DNS_PRIVATE_ZONENAME, process.env.BACKEND_DNS_NAME, newForwardingRuleResponse.IPAddress, ttl=60);

	return "Success";
}

exports.handler = updateLoadBalancerCerts;

if (require.main === module) {
	updateLoadBalancerCerts().then((res) => {
		console.log(res);
	})
	.catch((err) => {
		console.error(err);
	})
}
