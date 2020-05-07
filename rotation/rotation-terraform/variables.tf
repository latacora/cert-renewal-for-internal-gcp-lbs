variable "bucket_name" {
	type = string
	description = "bucket that holds the google function zip files"
}

variable "project_id" {
	type = string
}
variable "creds_file_path" {
	type = string
	default = ""
}
variable "region" {
	type = string
}
variable "zone" {
	type = string
}
variable "renewal_zip_filename" {
        type = string
}
variable "renewal_zip_filename_path" {
        type = string
}
variable "cert_env" {
	type = string
}

variable "domain_names" {
	type = string
}
variable "certificate_bucket" {
	type = string
}
variable "topic_name" {
	type = string
}
variable "maintainer_email" {
        type = string
}

variable "subscriber_email" {
        type = string
}
variable "zonename" {
        type = string
	description = "dns zonename"
}

