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
variable "fqdn" {
	type = string
	description = "fully qualified domain name of the dns zone that you will be creating. Don't forget the '.' on the end."
}
variable "certs_bucket_name" {
	type = string
	description = "google storage bucket name"
}
variable "public_dns_zone_name" {
	type = string
	description = "name for the public dns zone where dns domain validation will take place"
	default = "public-zone"
}
