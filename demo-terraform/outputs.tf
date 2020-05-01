// A variable for extracting the external ip of the instance
#output "ip" {
# value = google_compute_instance.vm_instance.network_interface.0.access_config.0.nat_ip
#}
