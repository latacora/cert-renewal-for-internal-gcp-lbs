"use strict";
const googleDns = require("acme-dns-01-gcp");
require("dotenv").config();

var fs = require("fs");
async function get_cert(event, context) {
  const start = Date.now();
  // Let's encrypt contact config
  const maintainerEmail = process.env.MAINTAINER_EMAIL;
  const subscriberEmail = process.env.SUBSCRIBER_EMAIL;
  const customerEmail = process.env.CUSTOMER_EMAIL ? process.env.CUSTOMER_EMAIL : "";
  // Existing files  // All these files are assumed to already have been created
  const accountPrivateKeyPemFile = process.env.ACCOUNT_PRIV_KEY_PEM_FILE ? process.env.ACCOUNT_PRIV_KEY_PEM_FILE : "accountPrivateKey.pem";
  const serverPrivateKeyPemFile = process.env.SERVER_PRIV_KEY_PEM_FILE ? process.env.SERVER_PRIV_KEY_PEM_FILE : "serverPrivateKey.pem";
  const letsEncryptAccountInfoFile = process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE ? process.env.LETS_ENCRYPT_ACCOUNT_INFO_FILE : "letsEncryptAccountInfo.json";
  // Files to create
  const sslCertFile = process.env.SSL_CERT_FILE ? process.env.SSL_CERT_FILE : "sslCert.pem";
  const certChainFile = process.env.CERT_CHAIN_FILE ? process.env.CERT_CHAIN_FILE : "certChain.pem";
  // prefix not required, if added should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1) 
  const packageAgentPrefix = process.env.PACKAGE_AGENT_PREFIX ? process.env.PACKAGE_AGENT_PREFIX : "";

  const pkg = require("./package.json");
  const packageAgent = packageAgentPrefix + pkg.name + "/" + pkg.version;
  const errors = [];
  function notify(ev, msg) { //Probably need to do something here if remove step doesn't succeed. Send warnings to notification service
    if ("error" === ev || "warning" === ev) {
      errors.push(ev.toUpperCase() + " " + msg.message);
      return;
    }
    // be brief on all others
    console.log(ev, msg.altname || "", msg.status || "");
  }

  //var ACME = require("acme");
  // This is using a local modified version so that create certificates doesn't return until the dns record remove returns
  const ACME = require("./@root/acme/acme.js");
  const acme = ACME.create({ maintainerEmail, packageAgent, notify });

  const directoryUrl =
    process.env.CERT_ENV === "production"
      ? "https://acme-v02.api.letsencrypt.org/directory"
      : "https://acme-staging-v02.api.letsencrypt.org/directory";

  await acme.init(directoryUrl);

  const Keypairs = require("@root/keypairs");

  /////////////////////////// All these files are assumed to already have been created
  // Use the storage of choice, we're using google storage here and assuming that account private key, account info, and server private key have all been loaded to the same bucket
  // Imports the Google Cloud client library
  const { Storage } = require("@google-cloud/storage");

  // Creates a client
  const storage = new Storage();
  const bucket = storage.bucket(process.env.GCP_BUCKET);

  const gcpAccountPrivateKeyPemFile = bucket.file(accountPrivateKeyPemFile);
  const accountPrivateKeyPemFileResponse = await gcpAccountPrivateKeyPemFile.download();
  const accountPrivateKeyPem = accountPrivateKeyPemFileResponse[0].toString();
  
  //Pull down your Let's Encrypt account data that's json
  const accountInfoFile = bucket.file(letsEncryptAccountInfoFile);
  const letsEncryptAccountInfoResponse = await accountInfoFile.download();
  const account = JSON.parse(letsEncryptAccountInfoResponse[0].toString());
  
  // accountKey and account will be used in the certificate options

  // Get server private key
  const gcpServerPrivateKeyPemFile = bucket.file(serverPrivateKeyPemFile);
  const gcpServerPrivateKeyDataResponse = await gcpServerPrivateKeyPemFile.download();
  const serverPrivateKeyPem = gcpServerPrivateKeyDataResponse[0].toString();

  /////////////////
  // Convert serverKey and accountKey to keypairs
  const serverKey = await Keypairs.import({ pem: serverPrivateKeyPem });
  const accountKey = await Keypairs.import({ pem: accountPrivateKeyPem });
  ////////////////////////////////////////
  // Create domains with punycode encoding
  const punycode = require("punycode");
  // since it's a google function, you could also pass in a payload that would be the domains list
  let domains = JSON.parse(process.env.DOMAIN_NAMES);
  domains = domains.map(function (name) {
    return punycode.toASCII(name);
  });
  /////////////////////////////////////////
  /// Create certificate signing request
  const CSR = require("@root/csr");
  const PEM = require("@root/pem");

  const encoding = "der";
  const typ = "CERTIFICATE REQUEST";

  const csrDer = await CSR.csr({ jwk: serverKey, domains, encoding });
  const csr = PEM.packBlock({ type: typ, bytes: csrDer });

  console.log("csr created");
  //await fs.promises.writeFile("/tmp/csr.crt", csr, "ascii");

  /////////////////////////////////////////////////////////////////
  // project id and zonename are the google cloud services where dns domain validation will take place. make sure the service account you are using has access to these resources
  const projectId = process.env.PROJECT_ID;
  const zonename = process.env.ZONENAME;
  // propagationDelay could probably be changed
  const challenges = {
    "dns-01": {
      ...googleDns.create({ projectId, zonename }),
      propagationDelay: 120000,
    },
  };

  // Validate Domains
  const certificateOptions = { account, accountKey, csr, domains, challenges };
  const pems = await acme.certificates.create(certificateOptions);

  // Get SSL Certificate
  // If you want each of them separately then this is where you'd modify that
  const fullchain = pems.cert + "\n" + pems.chain;

  ///////////////////////////
   // Control how to upload or write files
   // Use the storage of choice, we're using google storage here  
  const uploadBucket = storage.bucket(process.env.GCP_BUCKET);
  const gcpSslCertFile = uploadBucket.file(sslCertFile);
  console.log(`writing ${sslCertFile} to cloudstorage`);
  await gcpSslCertFile.save(pems.cert);

  const fullchainFile = uploadBucket.file(certChainFile);
  console.log(`writing ${certChainFile} to cloudstorage`);
  await fullchainFile.save(fullchain);
	
	// write to local fs
	// Don't do this if you're on Google Functions. I suppose you could write to /tmp
	// but, why?
  if (process.env.LOCAL_MACHINE) {	
  	console.log(`writing ssl public cert to ${sslCertFile}`);
  	await fs.promises.writeFile(`./${sslCertFile}`, pems.cert, "ascii");

  	console.log(`writing full chain to ${certChainFile} to local`);
  	await fs.promises.writeFile(`./${certChainFile}`, fullchain, "ascii"); 
  }
  /////////////////////////////////////////////////

  const end = Date.now();

  // just wait an extra 30 seconds to allow for dns stuff to complete. Maybe the acme.certificates.create() function isn't properly accounting for promise resolution
  console.log(
    "sleeping to wait acme dns validation stuff to complete 30sec..."
  );
  await new Promise((r) => setTimeout(r, 30000));

  console.log(`total elapsed time: ${millisToMinutesAndSeconds(end - start)}`);
  return "Completed!";
}
function millisToMinutesAndSeconds(millis) {
  const minutes = Math.floor(millis / 60000);
  const seconds = ((millis % 60000) / 1000).toFixed(0);
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

module.exports.handler = get_cert;

if (require.main === module) {
    get_cert()
        .then((message) => {
            console.log(message);
        })
        .catch((err) => {
            console.log(err);
        });
}
