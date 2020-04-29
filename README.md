example using gcp to support cert renewal  

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

