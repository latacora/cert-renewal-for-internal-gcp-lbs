Automatically renewing and rotating certificates on Google Internal Load-balances with Let's Encrypt
Problem: Google does not offer managed certificates for its internal load-balancers

This PoC demonstrates how to renew and rotate certificates using two scripts.
There are two separate things happening in this demo.
Renewal of the certs
Rotation of the certs on target devices
This repository primarily exists to demonstrate that it is possible to automate certificate rotation on Google internal load-balancers with minimal infratructure setup and without requiring your own CA. The code is this repository should not be put into your production environemnts without appropriate review.


This specific method that you choose for renewing certificates does not create dependencies for rotation since they happen independently, however, renewing certificates usually implies that you are also interested in rotating certificates. I don't think I need to go into further detail here since you probably already know this is you're reading this. If you wish to choose another method for certificate renewal, you can review the [clients](https://letsencrypt.org/docs/client-options/) available on the Let's Encrypt website or write something yourself. 

1. Using [ACME.js](https://git.coolaj86.com/coolaj86/acme.js) with the [acme-dns-01-gcp](https://github.com/latacora/acme-dns-01-gcp) plugin to create and renew certificates. This relies on Google Cloud DNS, Google Storage, and Google Functions. 
2. Rotate certificates on the Google load-balancers using the available Google Compute API.

[API](https://cloud.google.com/compute/docs/reference/rest/v1/forwardingRules/setTarget) for forwardingRules seems to indicate that a setTarget method exists, I kept getting the following error: 400 `Invalid target type TARGET_HTTPS_PROXY for forwarding rule in scope REGION` when trying to setTarget for forwarding rule. I guess it thinks that either the httpsProxy or the forwardingRule is global, but I'm using the regional methods. But works (200 response) when you setTarget to the targetHttpsProxy that is already set. 
Also, the setSslCertificates function is only available on global targetHttpsProxies


Parts: Google Storage for account key, server key, let's encrypt account info, signed cert and cert chain. A single bucket was used, however, you are free to use more.



Walkthrough:
Assuming you have nothing
init-terraform will create a Google Storage bucket and a Google Cloud DNS - The variables.tf file there will describe the required variables.
Use `node create-new.js` will create a account key  (EC) and a server key (RSA). The account key is used to create a Let's Encrypt account and the account metadata is returned as JSON. These three values are then uploaded to the Google Storage bucket if the environment variable "GCP_BUCKET" is set else they are only to your local filesystem.



Environment variables [Some of these values are better described here](https://git.coolaj86.com/coolaj86/acme.js#user-content-api-overview)

`create-new.js`  
MAINTAINER_EMAIL - author of the code
SUBSCRIBER_EMAIL - concat of the service provider to revieve renewal failure notices and manage the ACME account.
CUSTOMER_EMAIL - Not used
CERT_ENV= - set to "production" to use the production Let's Encrypt domain url, else the staging domain url will be used
GCP_BUCKET - bucket that you created using terraform in the previous step
PACKAGE_AGENT_PREFIX - Optional should be an RFC72321-style user-agent string to append to the ACME client (ex: mypackage/v1.1.1)
ACCOUNT_PRIV_KEY_PEM_FILE - Optional - accountPrivateKey.pem 
SERVER_PRIV_KEY_PEM_FILE - Optional - serverPrivateKey.pem
LETS_ENCRYPT_ACCOUNT_INFO_FILE - Optional letsEncryptAccountInfo.json

----------------------------------------------------------------------------
`index.js`  
PROJECT_ID  
ZONENAME  
GCP_BUCKET  
DOMAIN_NAMES '["placeholder.example.com", "backend.placeholder.example.com", "frontend.placeholder.example.com", "\*.backend.placeholder.example.com"]'  
CERT_ENV  
MAINTAINER_EMAIL  
SUBSCRIBER_EMAIL  
CUSTOMER_EMAIL  
PACKAGE_AGENT_PREFIX  

ACCOUNT_PRIV_KEY_PEM_FILE - Default - accountPrivateKey.pem  
SERVER_PRIV_KEY_PEM_FILE - Default - serverPrivateKey.pem  
LETS_ENCRYPT_ACCOUNT_INFO_FILE - Default letsEncryptAccountInfo.json  
SSL_CERT_FILE - Default sslCert.pem  
CERT_CHAIN_FILE - Default certChain.pem  
LOCAL_MACHINE - set to 1 to have the certificate chain and signed certificate written to the local filesystem.  


`update-certs.py`  
NETWORK  
SUBNETWORK  
DNS_PRIVATE_ZONENAME  
BACKEND_DNS_NAME  
PROJECT_ID  
REGION  
CERT_CHAIN_FILE  

These three values are then uploaded to the Google Storage bucket and also written to your local filesystem if you get the environment variable LOCAL_MACHINE to 1.  



This PoC is divided into two parts:
You need to create a bucket to hold your certs.
You can really use anything you want to hold certs or whatnot
You need a Cloud DNS zone for dns domain validation



Use a lambda to make updates to your frontend listeners for the load balancers. Probably in the form of just adding additional certs and expiring the old ones

variable "fqdn" {
        type = string
        description = "fully qualified domain name of the dns zone that you will be creating"
}
variable "local-private-key-file" {
        type = string
        description = "would be used for initialization purposes. local file path of the server private key"
}
variable "local-cert-chain-file" {
        type = string
        description = "would be used for initialization purposes. local file path to the cert chain"
}


Deployment Strategies:

You could pass in env vars or pass in a payload to the google function that would be parsed  
This example is using ENV VARs  
