## Automatically renewing and rotating certificates on Google Internal Load-balances with Let's Encrypt
##### Problem: Google does not offer managed certificates for its internal load-balancers

This repository exists primarily to demonstrate that it is possible to automate certificate rotation on Google internal load-balancers with minimal infratructure setup and without requiring your own CA. The code is this repository was originally intended for demostration purposes only and should not be put into your production environments without appropriate review.

Certificate management consists of two primary responsibilities: Renewal and Rotation

The two scripts of importance are `index.js` and `update-certs.js`.
Variables that are all UPPERCASE and snake_case are likely environment variables. These variables are described in the demo walkthrough section.

-----------------

### Certificate Renewal `index.js`

* Renewal - Uses [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin to create and renew certificates. This relies on Google Cloud DNS and Google Storage. 

The purpose of `index.js` is to create a certificate signing request and get a signed certificate from Let's Encrypt using Google Cloud DNS. Based on this [walkthrough](https://git.rootprojects.org/root/acme.js/src/branch/master/examples/README.md).

`index.js` looks for files in a GCP_BUCKET. Specfically the files defined by ACCOUNT_PRIV_KEY_PEM_FILE, SERVER_PRIV_KEY_PEM_FILE, LETS_ENCRYPT_ACCOUNT_INFO_FILE, with defaults of `accountPrivateKey.pem`, `serverPrivateKey.pem`, and  `letsEncryptAccountInfo.json`, respectively if the environment variables are not set.

The expectation is that you would run `index.js` in a Cloud Function. The `Deployment` section at the bottom outlines a basic strategy to deploy using Google Functions. If you wish to read files from the local filesystem in `index.js`, you'll need to modify the code yourself.

High-level overview of the process for renewing certs using Let's Encrypt and an ACME compliant client:
1. Initialze the ACME client using the account private key and Let's Encrypt account info.
1. Create a certificate signing request (CSR) using the ACME client and the server private key.
1. Request DNS valdation from Let's Encrypt using the `acme-dns-01-gcp` plugin.
    * Uses the Google Cloud DNS service in the Google project defined by PROJECT_ID and ZONENAME env vars.
1. Writes the signed ssl certificate (SSL_CERT_FILE) and certificate chain (CERT_CHAIN_FILE) to the GCP_BUCKET bucket. 

There is a slight dependency between that domain names that you request on your signed certificate and the infrastructure deployed from `demo-terraform/` (if you choose to use the demo infrastructure). `demo-terraform/` creates DNS records for `frontend.<fqdn>` and `backend.<fqdn>`. If you don't need the infrastructure from `demo-terraform/`, then you'll set the domain names to whatever you're using to point to your existing internal load-balancers. 

*Note:*  
You can pick any method that you wish for renewing certificates. This demo is using [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin so that everything can be deployed and managed within GCP. Even though renewal and rotation are independent, renewing certificates usually implies that you are also interested in rotating certificates. I don't think I need to go into further detail here since you probably already know this if you're reading this demo. If you wish to choose another method for certificate renewal, you can review the [clients](https://letsencrypt.org/docs/client-options/) available on the Let's Encrypt website or write something yourself.


### Certificate Rotation `update-certs.js`

* Rotation - Rotate certificates on the Google load-balancers using the Google Compute API.

The `update-certs.js` script uses Google Cloud's API for rotating certificates on your internal load-balancers. `update-certs.js` expects the relevant certificates and server private key to live in an external data storage. You should have created a bucket in one of the previous steps or can choose to use another type of data store. The demo uses the same GCP_BUCKET used in the previous steps for this purpose.

You can really use anything you want to hold certificates. Provided there are sufficient security mechanisms available for you to protect these resources. As a reminder, the `update-certs.py` code should not be inserted into a production environment without proper review. This code was originally intended for demonstration purposes only and requires serveral improvements before it is ready for production.

High-level overview of the process for rotating certs for internal load-balancers:
1. Create a new Region SSL certificate resource
2. Create a new Region Target HTTPs Proxy
3. Create a new Region Forwarding Rule
4. Update the DNS record to point to the new Forwarding Rule.

*Notes:*
The Google Cloud [API](https://cloud.google.com/compute/docs/reference/rest/v1/forwardingRules/setTarget) for `forwardingRules` seems to indicate that a `setTarget` method exists. However, I kept getting the following error: 400 `Invalid target type TARGET_HTTPS_PROXY for forwarding rule in scope REGION` when trying to `setTarget` on a regional forwarding rule. My guess is that Google thinks that either the `httpsProxy` or the `forwardingRule` is global. I have confirmed several times that I am using the regional methods. The `setTarget` method works (200 response) when you `setTarget` to the `targetHttpsProxy` that is already set on the forwarding rule. 
Also, the `setSslCertificates` function is only available on global targetHttpsProxies.

#### Service infrastructure
This demo also includes `demo-terraform/` if you wish to deploy a mock environment to play around with. This is further described in the walkthrough portion.

-----------------

### Demo walkthrough:

We are going to assume you have some familiarity with Google Cloud, NodeJS, DNS, and Terraform.  
You can use a [.env](https://www.npmjs.com/package/dotenv) file to set environment variables for local use.

*Prerequisites:*
* A Google Cloud account (Recommended to create a new project for this demo)
* A domain that you own
* Node10 <=
* Terraform0.12

__If starting with nothing:__  
`cd init-terraform/` -> `terraform init` -> `terraform apply`  
The `variables.tf` file will describe the required variables.

*Resources (infrastructure) created:*
* Google Storage bucket (Used for holding Let's Encrypt account info, private keys, and certs)
* Google Cloud DNS (Public, used for DNS validation)

If you already have a Let's Encrypt account and your server private key, skip to **'Request new signed certificate'**. 

If you don't have an existing Let's Encrypt account, included in this repo is `create-new.js` which can create an account key (EC) and a server key (RSA). The account key is used to create a Let's Encrypt account and the account metadata from this step is returned as JSON. Setting the environment variable GCP_BUCKET will result in `create-new.js` writing the generated files to your GCP_BUCKET bucket (This can be the bucket made by `init-terraform/` or another bucket), else these files will only be written to your local machine. It's also recommended that you set CERT_ENV to "development" so that you'll use the staging directory URL for Let's Encrypt while setting everything up. You should see requests to the backend internal load-balancer fail initially due to having an "invalid" certificate.  

Resources created:
* account private key (EC)  
* server private key (RSA)
* Let's Encrypt account information (JSON)  
The names of these files can be controlled using the ACCOUNT_PRIV_KEY_PEM_FILE, SERVER_PRIV_KEY_PEM_FILE, and LETS_ENCRYPT_ACCOUNT_INFO_FILE environment variables.

__Environment variables: [Some of these values are better described here](https://git.coolaj86.com/coolaj86/acme.js#user-content-api-overview)__  
* MAINTAINER_EMAIL - author of the code  
* SUBSCRIBER_EMAIL - contact of the service provider to recieve renewal failure notices and manage the ACME account.  
* CUSTOMER_EMAIL - Not used  
* CERT_ENV - set to "production" to use the production Let's Encrypt domain url, else the staging domain url will be used  
* GCP_BUCKET - bucket that you created using terraform in the previous step  
* PACKAGE_AGENT_PREFIX - Optional should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1)  
* ACCOUNT_PRIV_KEY_PEM_FILE - Optional - accountPrivateKey.pem  
* SERVER_PRIV_KEY_PEM_FILE - Optional - serverPrivateKey.pem  
* LETS_ENCRYPT_ACCOUNT_INFO_FILE - Optional letsEncryptAccountInfo.json  

### Requesting a signed certificate

`index.js` is the script responsible for renewing certificates. It uses [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin to create and renew certificates. The private keys and Let's Encrypt account information are pulled from the GCP_BUCKET and the signed certificate and certificate chain are uploaded back to the same bucket. You can adjust this if you wish. It's recommended to set LOCAL_MACHINE=1 if you're going to use `demo-terraform/` to set up the mock environment, so that you'll have local copies of the certificate chain and the server private key for initial deployment.

**Environment variables: [Some of these values are better described here](https://git.coolaj86.com/coolaj86/acme.js#user-content-api-overview)**
* MAINTAINER_EMAIL - author of the code  
* SUBSCRIBER_EMAIL - contact of the service provider to recieve renewal failure notices and manage the ACME account.  
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

#### Mock infrastructure
Deploy the infrasructure in `demo-terraform/`, if you do not already have existing infrastructure. This sets up a backend service with an internal load-balancer and a Cloud DNS Private zone. You can access the "frontend" instance via SSH from the Google console, or hit the public webserver instance. This terraform is going to look locally for the server private key and the certificate chain. If you've been using the "staging" directory URL for Let's Encrypt, you should expect the `frontend.<fqdn>` endpoint to succeed, but the `frontend.<fqdn>/protected` endpoint to fail due to a bad certificate. This can also be confirmed by SSHing into the frontend instance and `curLing` the backend load-balancer from there.


### Rotating certificates 

`update-certs.js` makes use of the Google Cloud API and assumes that new certs are available for it in the GCP_BUCKET by the 
SERVER_PRIV_KEY_PEM_FILE and CERT_CHAIN_FILE names. If you deployed the mock infrastrucutre using `demo-terraform/` and the "staging" URL for Let's Encrypt initially, you can now switch to using CERT_ENV=production to obtain a real certificiate via `node index.js`. After receiving the new certificates, if you run `node update-certs.js` and it is successful, you should be able to hit the `frontend.<fqdn>/protected` endpoint and get a response.

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
