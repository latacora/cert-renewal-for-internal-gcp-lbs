variable "project_id" {
	type = string
}
variable "creds_file_path" {
	type = string
	default = ""
	description = "path to service account creds. You probably don't want to use this"
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
