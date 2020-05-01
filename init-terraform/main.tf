terraform {
        required_version = "> 0.12.0"
}

provider "google" {
        project = "gcp-study-renzo"
        #credentials = file(var.creds_file_path)
        region = var.region
        zone = var.zone
}

# Bucket for loading private keys, public certs, and let's encrypt account into
resource "google_storage_bucket" "certs-bucket" {
  name          = var.certs-bucket-name
  location      = "US"
  force_destroy = true
  bucket_policy_only = true
}


# Cloud DNS zone for dns domain validation
# Make sure you have ownership of the domain and if you're doing subdomain delegation that you copy the Name Servers to the appropriate DNS service


resource "google_dns_managed_zone" "public-zone" {
  name        = "public-zone"
  dns_name    = var.fqdn
  description = "Public DNS Zone using for the frontend or external VM instance"
}

