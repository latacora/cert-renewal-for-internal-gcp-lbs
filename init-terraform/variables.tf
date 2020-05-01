variable "project_name" {
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
variable "fqdn" {
	type = string
	description = "fully qualified domain name of the dns zone that you will be creating"
}
variable "certs-bucket-name" {
	type = string
	description = "google storage bucket name"
}
