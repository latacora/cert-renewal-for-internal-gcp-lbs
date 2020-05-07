terraform {
	required_version = "> 0.12.0"
}

provider "google" {
	project = var.project_id
	#credentials = file(var.creds_file_path)
	region = var.region
        zone = var.zone
}



resource "google_storage_bucket" "bucket" {
  name = var.bucket_name
}

resource "google_storage_bucket_object" "archive" {
  name   = var.renewal_zip_filename
  bucket = google_storage_bucket.bucket.name
  source = "${var.renewal_zip_filename_path}${var.renewal_zip_filename}"
}

resource "google_cloudfunctions_function" "function" {
  name        = "function-test"
  description = "My function"
  runtime     = "nodejs10"

  available_memory_mb   = 512
  source_archive_bucket = google_storage_bucket.bucket.name
  source_archive_object = google_storage_bucket_object.archive.name
  event_trigger {
	event_type = "google.pubsub.topic.publish"
	resource = var.topic_name
  }
  entry_point           = "handler"
  timeout = 540
  environment_variables = {
	MAINTAINER_EMAIL=var.maintainer_email
	SUBSCRIBER_EMAIL=var.subscriber_email
	PROJECT_ID=var.project_id
	ZONENAME=var.zonename
	GCP_BUCKET=var.certificate_bucket
	DOMAIN_NAMES=var.domain_names
	CERT_ENV=var.cert_env
  }
}
