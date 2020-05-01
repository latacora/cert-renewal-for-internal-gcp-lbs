example using gcp to support cert renewal  


Starting with nothing:
Use `create-new.js`  

This PoC is divided into two parts:
You need to create a bucket to hold your certs.
You can really use anything you want to hold certs or whatnot
You need a Cloud DNS zone for dns domain validation



Use a lambda to make updates to your frontend listeners for the load balancers. Probably in the form of just adding additional certs and expiring the old ones

variable "project_name" {
        type = string
}
variable "creds_file_path" {
        type = string
}
variable "region" {
        type = string
}
variable "zone" {
        type = string
}
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



contains terraform  

to create a google storage bucket  
create a load balancer and uses the certs created in the script  


You could pass in env vars or pass in a payload to the google function that would be parsed  
This example is using ENV VARs  

env vars  
MAINTAINER_EMAIL  
SUBSCRIBER_EMAIL  
CUSTOMER_EMAIL  
CERT_ENV=development/production  
DOMAIN_NAME='["example.com"]'  
GCP_BUCKEt  
'["service.example.com", "\*.service.example.com"]'  
'["\*.example.com"]', '["service.example.com", "hello.example.com"]' '["example.com"]'  
PROJECT_ID # GCP prooject id where you manage DNS  
ZONENAME # GCP zone name with relevant records related to the domain  
SSL_CERT_FILE
CERT_CHAIN_FILE
ACCOUNT_PRIV_KEY_PEM_FILE
SERVER_PRIV_KEY_PEM_FILE
LETS_ENCRYPT_ACCOUNT_INFO_FILE
