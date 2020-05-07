terraform {
	required_version = "> 0.12.0"
}

provider "google" {
	project = var.project_id
	#credentials = file(var.creds_file_path)
	region = var.region
        zone = var.zone
}

resource "google_compute_network" "vpc_network" {
  name = "vpc-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "generic" {
  provider = google-beta
  project = var.project_id
  name          = "generic-subnet"
  ip_cidr_range = "10.1.2.0/24" # this is hard-coded
  region        = var.region
  network       = google_compute_network.vpc_network.self_link
  purpose = "PRIVATE"
}

# Internal LBs used for HTTPs require a reserved subnet for proxying requests. This is the IP that the backend services should see.
# TBH, I don't really see where its actually used in this config unless its just some GCP magic that happens behind the scenes.
resource "google_compute_subnetwork" "proxy-lb" {
  provider = google-beta
  project = var.project_id
  name          = "load-balancer-proxy"
  ip_cidr_range = "10.129.0.0/23" # this is hard-coded
  region        = var.region
  network       = google_compute_network.vpc_network.self_link
  purpose = "INTERNAL_HTTPS_LOAD_BALANCER"
  role = "ACTIVE"
}

# This is the instance template we are protecting behind the load balancer
resource "google_compute_instance_template" "default" {
  name        = "appserver-template"
  description = "This template is used to create app server instances."
  region = var.region
  tags = ["allow-ssh", "load-balanced-backend"]

  labels = {
    environment = "dev"
  }

  instance_description = "description assigned to instances"
  machine_type         = "f1-micro"
  can_ip_forward       = false
  metadata_startup_script = "#! /bin/bash\napt-get update\napt-get install apache2 -y\na2ensite default-ssl\na2enmod ssl\nvm_hostname=\"$(curl -H \"Metadata-Flavor:Google\" http://169.254.169.254/computeMetadata/v1/instance/name)\"\necho \"Page served from: $vm_hostname\" | tee /var/www/html/index.html\nsystemctl restart apache2"
  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
  }

  // Create a new boot disk from an image
  disk {
    source_image = "debian-cloud/debian-9"
    auto_delete  = true
    boot         = true
  }

  network_interface {
    network = google_compute_network.vpc_network.name
    subnetwork = google_compute_subnetwork.generic.name
    access_config {} # Given an external IP just so it can download packages. In prod, you're probably using a Cloud NAT for outbound traffic
  }

}

# This instance we use to connect from our local machine if we wish to see that the internal load balancer is working properly
# This instance accepts calls on port 5000 because why not.
resource "google_compute_instance" "vm_instance" {
  name         = "external-flask-instance"
  machine_type = "f1-micro"
  tags = ["allow-ssh", "load-balanced-backend", "external"]
  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-9"
    }
  }
  // Make sure flask is installed on all new instances for later steps
  metadata_startup_script = "sudo apt-get update; sudo apt-get install -yq build-essential python-pip rsync; pip install flask requests; echo -e \"from flask import Flask\\napp = Flask(__name__)\\nimport requests\\n@app.route('/')\\ndef hello_cloud():\\n\\treturn 'hello world'\\n\\n@app.route('/protected')\\ndef hello_cloud_protected():\\n\\tresponse = requests.get('https://${google_dns_record_set.a.name}')\\n\\tprint(response.text)\\n\\treturn 'hello from backend: ' + response.text;\\napp.run(host='0.0.0.0')\" > app.py; python app.py"
  network_interface {
    # A default network is created for all GCP projects
    network = google_compute_network.vpc_network.name
    subnetwork = google_compute_subnetwork.generic.name
    access_config {} # grant external ip address
  }
}

# Most IP addresses and CIDR ranges are hard-coded but that doesn't have to be the case
#resource "google_compute_address" "static-http" {
#  name         = "my-internal-http-address"
#  subnetwork   = google_compute_subnetwork.proxy-lb.id
#  address_type = "INTERNAL"
#  region       = var.region
#}


# https 443
resource "google_compute_forwarding_rule" "https" {
  name       = "backend-forwarding-rule-https"
  region = var.region
  target     = google_compute_region_target_https_proxy.default.self_link
  port_range = "443"
  load_balancing_scheme = "INTERNAL_MANAGED"
  subnetwork   = google_compute_subnetwork.generic.id
  ip_address = "10.1.2.99" # hard-coded but could be changed
  depends_on = [google_compute_region_backend_service.backend]
}

resource "google_compute_region_target_https_proxy" "default" {
  provider = google-beta
  project = var.project_id
  name             = "https-proxy"
  region = var.region
  url_map          = google_compute_region_url_map.default.self_link
  ssl_certificates = [google_compute_region_ssl_certificate.default.self_link]
}

# This would mostly be used for initialization
# After running an initial setup, you'd rely on the Cloud Functions to update the certificates on the existing load balances
resource "google_compute_region_ssl_certificate" "default" {
  region = var.region
  name        = "my-certificate"
  private_key = file(var.local-private-key-file)
  certificate = file(var.local-cert-chain-file)
}

resource "google_compute_region_url_map" "default" {
  provider = google-beta

  region          = var.region
  project         = var.project_id
  name            = "internal-backend-map"
  default_service = google_compute_region_backend_service.backend.self_link
}

resource "google_compute_region_backend_service" "backend" {
  provider = google-beta
  project = var.project_id
  name = "default"
  region                = var.region
  health_checks         = [google_compute_region_health_check.hc.self_link]
  backend {
	group = google_compute_region_instance_group_manager.appserver.instance_group
	balancing_mode = "UTILIZATION"
	capacity_scaler = 1.0
  }
  protocol = "HTTP"
  
  load_balancing_scheme = "INTERNAL_MANAGED"
}

resource "google_compute_region_health_check" "hc" {
  name               = "check-backend-service"
  check_interval_sec = 3
  timeout_sec        = 3
  http_health_check {
    port = "80"
  }
}


resource "google_compute_region_instance_group_manager" "appserver" {
  name = "appserver-igm"

  base_instance_name         = "app"
  region                     = "us-central1"
  distribution_policy_zones  = ["us-central1-a", "us-central1-f"]

  version {
    instance_template = google_compute_instance_template.default.self_link
  }

  target_size  = 2

  auto_healing_policies {
    health_check      = google_compute_health_check.autohealing.self_link
    initial_delay_sec = 300
  }
}

resource "google_compute_health_check" "autohealing" {
  name                = "autohealing-health-check"
  check_interval_sec  = 5
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 10 # 50 seconds

  http_health_check {
    request_path = "/"
    port         = "80"
  }
}
####################### Firewalls
# This could probably get cleaned up a bit. Firewall rules are keeping traffic from the internet from hitting the backend instances at this time. Note above about using a Cloud NAT so that the external IPs on the backend instances can be dropped.
resource "google_compute_firewall" "fw-allow-proxies" {
 name    = "fw-allow-proxies"
 network = google_compute_network.vpc_network.name

 allow {
   protocol = "tcp"
   ports    = ["5000", "80", "443", "8080"]
 }
 source_ranges = ["10.129.0.0/23"]
 target_tags = ["load-balanced-backend"]
}

# TODO: add the allow-health-check tag
resource "google_compute_firewall" "allow-health-check" {
 name    = "fw-allow-health-check"
 network = google_compute_network.vpc_network.name

 allow {
   protocol = "tcp"
   ports    = ["5000", "80"]
 }
 target_tags = ["load-balanced-backend"]
 source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
}

resource "google_compute_firewall" "allow-ssh" {
 name    = "fw-allow-ssh"
 network = google_compute_network.vpc_network.name

 allow {
   protocol = "tcp"
   ports = ["22"]
 }
 target_tags = ["allow-ssh"]
}

resource "google_compute_firewall" "allow-backend-subnet" {
 name    = "fw-allow-backend-subnet"
 network = google_compute_network.vpc_network.name
 
 allow {
   protocol = "tcp"
 }
 allow {
   protocol = "udp"
 }
 allow {
   protocol = "icmp"
 }
 source_ranges = ["10.1.2.0/24"]
}

resource "google_compute_firewall" "allow-external" {
 name    = "fw-allow-external"
 network = google_compute_network.vpc_network.name

 allow {
   protocol = "tcp"
   ports = ["80", "443", "5000"]
 }
 allow {
   protocol = "icmp"
 }
 target_tags = ["external"]
}

##############################################################

### DNS Zone
# We're going to assume this zone has already been made for dns domain validation.
#resource "google_dns_managed_zone" "public-zone" {
#  name        = "public-zone"
#  dns_name    = var.fqdn
#  description = "Public DNS Zone using for the frontend or external VM instance"
#}

data "google_dns_managed_zone" "public-zone" {
  name = var.public_zone_name
}


resource "google_dns_record_set" "a-frontend" {
  name         = "frontend.${data.google_dns_managed_zone.public-zone.dns_name}"
  managed_zone = data.google_dns_managed_zone.public-zone.name
  type         = "A"
  ttl          = 60

  rrdatas = [google_compute_instance.vm_instance.network_interface[0].access_config[0].nat_ip]
}

resource "google_dns_managed_zone" "private-zone" {
  name        = "private-zone"
  dns_name    = var.fqdn
  description = "Example private DNS zone"

  visibility = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.vpc_network.self_link
    }
  }
}

resource "google_dns_record_set" "a" {
  name         = "backend.${google_dns_managed_zone.private-zone.dns_name}"
  managed_zone = google_dns_managed_zone.private-zone.name
  type         = "A"
  ttl          = 60

  rrdatas = [google_compute_forwarding_rule.https.ip_address]
}

