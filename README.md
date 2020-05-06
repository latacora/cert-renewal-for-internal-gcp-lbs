## Automatically renewing and rotating certificates on Google Internal Load-balances with Let's Encrypt
Problem: Google does not offer managed certificates for its internal load-balancers

This repository primarily exists to demonstrate that it is possible to automate certificate rotation on Google internal load-balancers with minimal infratructure setup and without requiring your own CA. The code is this repository was originally intended for demostration purposes only and should not be put into your production environemnts without appropriate review.

---------------

Certificate management consists of two primary responsibilities: Renewal and Rotation

The two scripts or primary importance are `index.js` and `update-certs.js`.
There are two independent things happening in this demo.
Renewal of the certs (index.js)
Rotation of the certs on target devices (update-certs.js)

You can use a [.env](https://www.npmjs.com/package/dotenv) file to set environment variables for local use.

-----------------

### Certificate Renewal

1. Renewal - Using [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin to create and renew certificates. This relies on Google Cloud DNS, Google Storage. 

----------------------------------------------------------------------------
`index.js`  
The purpose of the `index.js` is to create a certificate signing request and get a signed certificate from Let's Encrypt using Google Cloud DNS.  

Based on this [walkthrough](https://git.rootprojects.org/root/acme.js/src/branch/master/examples/README.md)
`index.js` looks for files in a GCP_BUCKET. Specfically the files defined by ACCOUNT_PRIV_KEY_PEM_FILE, SERVER_PRIV_KEY_PEM_FILE, LETS_ENCRYPT_ACCOUNT_INFO_FILE, with the defaults of 'accountPrivateKey.pem', 'serverPrivateKey.pem', and  'letsEncryptAccountInfo.json', respectively if the environment variables are not set.
The default  expectation is that you will be  running `index.js` in a Cloud Function. The `Deployment` section at the bottom outlines a strategy to deploy using Google Functions. If you wish that read files from the local filesystem, you'll need to modify the code yourself. 
The script takes the account key and Let's Encrypt account info, initialzes the ACME client, then creates a certificate signing request (CSR) using the ACME client and the server private key. The ACME client then requests DNS valdation from Let's Encrypt using the `acme-dns-01-gcp` plugin, which uses the Google Cloud DNS service in project defined by PROJECT_ID and ZONENAME env vars, and writes the signed ssl certificate (SSL_CERT_FILE) and certificate chain (CERT_CHAIN_FILE) to the GCP_BUCKET bucket. 
There is a slight dependency between that domain names that you request on your signed certificate and the infrastructure deployed from `demo-terraform`. `demo-terraform` creates DNS records for `frontend.<fqdn>` and `backend.<fqdn>`. If you don't need the infrastructure from `demo-terraform`, then you set the domain names to whatever you want. 

Note:
This specific method that you choose for renewing certificates does not create dependencies for rotation since they happen independently, however, renewing certificates usually implies that you are also interested in rotating certificates. I don't think I need to go into further detail here since you probably already know this if you're reading this demo. If you wish to choose another method for certificate renewal, you can review the [clients](https://letsencrypt.org/docs/client-options/) available on the Let's Encrypt website or write something yourself.
Parts: Google Storage for account key, server key, let's encrypt account info, signed cert and cert chain. A single bucket was used, however, you are free to use more.

---------------------------

### Certificate Rotation

2. Rotation - Rotate certificates on the Google load-balancers using the Google Compute API.

The `update-certs.py` script uses Goole Cloud's API for rotating certificates on your internal load-balancers. You need to create a bucket to hold your certs.
You can really use anything you want to hold certs or whatnot. The update-certs.py code should not be inserted into a production environment without proper review. This code was originally intended for demonstration purposes only and there exists many improvements upon the code.

High-level overview of the process for rotating certs for internal load-balancers:
1. Create a new SSL certificate resource
2. Create a new Region Target HTTPs Proxy
3. Create a new Region Forwarding Rule
4. Update the DNS record to point to the new Forwarding Rule.

Notes:
[API](https://cloud.google.com/compute/docs/reference/rest/v1/forwardingRules/setTarget) for forwardingRules seems to indicate that a setTarget method exists, I kept getting the following error: 400 `Invalid target type TARGET_HTTPS_PROXY for forwarding rule in scope REGION` when trying to setTarget for forwarding rule. I guess it thinks that either the httpsProxy or the forwardingRule is global, but I'm using the regional methods. But works (200 response) when you setTarget to the targetHttpsProxy that is already set. 
Also, the setSslCertificates function is only available on global targetHttpsProxies

#### Service infrastructure
This demo also includes `demo-terraform/` if you wish to deploy a mock environment to play around with. This is further described in the walkthrough portion.

-----------------

### Demo walkthrough:

We are going to assume you have some familiarity with Google Cloud, NodeJS, DNS, and Terraform

Prerequisites:
* A Google Cloud account (Recommended to create a new project for this demo)
* A domain that you own
* Node10 <=
* Terraform0.12

If starting with nothing:
`cd init-terraform/` -> `terraform init` -> `terraform apply`
The `variables.tf` file will describe the required variables.

*Resources created:*
* Google Storage bucket (Used for holding Let's Encrypt account info, private keys, and certs)
* Google Cloud DNS (Public, used for DNS validation)

If you already have a Let's Encrypt account and your server private key, skip to 'Request new signed certificate'. 

If you don't have an existing Let's Encrypt account, included in this repo is `create-new.js` which can create an account key (EC) and a server key (RSA). The account key is used to create a Let's Encrypt account and the account metadata from this step is returned as JSON. Set environment variable GCP_BUCKET to have the `create-new.js` script write the generated files to your bucket (can be the bucket made in the init-terraform or another bucket), else they will only be written to your local machine. It's recommended that you set CERT_ENV to "development" so that you'll use the staging directory URL for Let's Encrypt while setting everything up. You will also get to see requests to the backend internal load-balancer fail initially due to having an "invalid" certificate. 

Environment variables:[Some of these values are better described here](https://git.coolaj86.com/coolaj86/acme.js#user-content-api-overview)
MAINTAINER_EMAIL - author of the code  
SUBSCRIBER_EMAIL - contact of the service provider to recieve renewal failure notices and manage the ACME account.  
CUSTOMER_EMAIL - Not used  
CERT_ENV - set to "production" to use the production Let's Encrypt domain url, else the staging domain url will be used  
GCP_BUCKET - bucket that you created using terraform in the previous step  
PACKAGE_AGENT_PREFIX - Optional should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1)  
ACCOUNT_PRIV_KEY_PEM_FILE - Optional - accountPrivateKey.pem  
SERVER_PRIV_KEY_PEM_FILE - Optional - serverPrivateKey.pem  
LETS_ENCRYPT_ACCOUNT_INFO_FILE - Optional letsEncryptAccountInfo.json  

Resources created:
ACCOUNT_PRIV_KEY_PEM_FILE  
SERVER_PRIV_KEY_PEM_FILE  
LETS_ENCRYPT_ACCOUNT_INFO_FILE  

### Requesting new signed certificate

`index.js` is the script resposible for requesting certificate renewals. It uses [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin to create and renew certificates. The private keys and Let's Encrypt account information are pulled from the GCP_BUCKET and the signed certificate and certificate chain are uploaded back to the same bucket. You can adjust this if you wish. It's recommended to set LOCAL_MACHINE=1 if you're going to use the `demo-terraform/` for the mock environment so that you'll have local copies for the certificate chain for initial deployment.

Environment variables [Some of these values are better described here](https://git.coolaj86.com/coolaj86/acme.js#user-content-api-overview)
* MAINTAINER_EMAIL - author of the code  
* SUBSCRIBER_EMAIL - concat of the service provider to revieve renewal failure notices and manage the ACME account.  
* CUSTOMER_EMAIL - Not used  
* PROJECT_ID - GCP project id  
* ZONENAME - GCP DNS Zonename  
* GCP_BUCKET - GCP Storage bucket name  
* DOMAIN_NAMES - example: '["placeholder.example.com", "backend.placeholder.example.com", "frontend.placeholder.example.com", "\*.backend.placeholder.example.com"]'  
* CERT_ENV - set to "production" to use the production Let's Encrypt domain url, else the staging domain url will be used  
* PACKAGE_AGENT_PREFIX - Optional should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1)  
* ACCOUNT_PRIV_KEY_PEM_FILE - Default - accountPrivateKey.pem  
* SERVER_PRIV_KEY_PEM_FILE - Default - serverPrivateKey.pem  
* LETS_ENCRYPT_ACCOUNT_INFO_FILE - Default letsEncryptAccountInfo.json  
* SSL_CERT_FILE - Default sslCert.pem  
* CERT_CHAIN_FILE - Default certChain.pem  
* LOCAL_MACHINE - set to 1 to have the certificate chain and signed certificate written to the local filesystem.  
---------------------------

#### Mock infrastructure
Deploy the infrasructure in `demo-terraform/`, if you do not already have existing infrastructure. This sets up a backend service with an internal load-balancer and a Cloud DNS Private zone. You can access the "frontend" instance via SSH from the Google console, or hit the public webserver instance. This terraform is going to look locally for the server private key and the certificate chain. If you've been using the "staging" directory URL for Let's Encrypt, you should expect the `frontend.<fqdn>` endpoint to success, but the `frontend.<fqdn>/protected` endpoint to fail due ot a bad certificate. This can also be confirmed by SSHing into the frontend instance and `curLing` the backend load-balancer from there.

----------------------------------------------------------------------------  

### Rotating certificates 

`update-certs.js` makes use of the Google Cloud API and assumes that new certs are available for it in the GCP_BUCKET by the 
SERVER_PRIV_KEY_PEM_FILE and CERT_CHAIN_FILE names. If you deployed using the `demo-terraform/` and the "staging" URL for Let's Encrypt initially, you can now switch to using the CERT_ENV=production to obtain a real certificiate. If you run `node update-certs.js` after receiving the real certificates, you should be able to hit the `frontend.<fqdn>/protected` and get a response.

Environment variables:
* PROJECT_ID - GCP project id
* REGION - region of the services
* NETWORK - network name (could make this the url) 
* SUBNETWORK - subnetwork name (could make this url as well)  
* DNS_PRIVATE_ZONENAME  - used to update the DNS record
* BACKEND_DNS_NAME - DNS name of backend load-balancer  
* SERVER_PRIV_KEY_PEM_FILE - Default serverPrivateKey.pem  
* CERT_CHAIN_FILE - Default certChain.pem  

-------------------------------

#### Deployment Strategies:

Use a Google Function to rotate certificates for Forwarding Rules on the internal load-balancers.
Takes about 5 minutes in the demo on my machine. Need to try it in a Google Function. Most of the time spent should be DNS validation time.  
AWS Lambda has a limit of 15 minutes
Google Functions has a limit of 9 minutes

You could pass in env vars or pass in a payload to the google function that would be parsed  
This example is using ENV VARs  
