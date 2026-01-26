# GCP NAT VM Module Outputs
#
# Expose all values needed by other modules and applications.

# -----------------------------------------------------------------------------
# NAT VM Instance Outputs
# -----------------------------------------------------------------------------

output "nat_instance_id" {
  description = "The ID of the NAT VM instance"
  value       = google_compute_instance.nat.id
}

output "nat_instance_name" {
  description = "The name of the NAT VM instance"
  value       = google_compute_instance.nat.name
}

output "nat_instance_self_link" {
  description = "The self-link of the NAT VM instance"
  value       = google_compute_instance.nat.self_link
}

output "nat_instance_zone" {
  description = "The zone where the NAT VM instance is located"
  value       = google_compute_instance.nat.zone
}

output "nat_internal_ip" {
  description = "The internal IP address of the NAT VM"
  value       = google_compute_instance.nat.network_interface[0].network_ip
}

# -----------------------------------------------------------------------------
# Static External IP Outputs
# -----------------------------------------------------------------------------

output "nat_external_ip" {
  description = "The static external IP address of the NAT VM"
  value       = google_compute_address.nat.address
}

output "nat_external_ip_name" {
  description = "The name of the static external IP resource"
  value       = google_compute_address.nat.name
}

output "nat_external_ip_self_link" {
  description = "The self-link of the static external IP resource"
  value       = google_compute_address.nat.self_link
}

# -----------------------------------------------------------------------------
# Route Outputs
# -----------------------------------------------------------------------------

output "nat_route_id" {
  description = "The ID of the NAT route"
  value       = google_compute_route.nat.id
}

output "nat_route_name" {
  description = "The name of the NAT route"
  value       = google_compute_route.nat.name
}

output "nat_route_self_link" {
  description = "The self-link of the NAT route"
  value       = google_compute_route.nat.self_link
}

# -----------------------------------------------------------------------------
# Firewall Outputs
# -----------------------------------------------------------------------------

output "nat_firewall_id" {
  description = "The ID of the NAT egress firewall rule"
  value       = google_compute_firewall.nat_egress.id
}

output "nat_firewall_name" {
  description = "The name of the NAT egress firewall rule"
  value       = google_compute_firewall.nat_egress.name
}

output "nat_firewall_self_link" {
  description = "The self-link of the NAT egress firewall rule"
  value       = google_compute_firewall.nat_egress.self_link
}

# -----------------------------------------------------------------------------
# Convenience Outputs
# -----------------------------------------------------------------------------

output "region" {
  description = "The region where the NAT resources are created"
  value       = var.region
}

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}

output "nat_tag" {
  description = "The network tag applied to the NAT VM (for firewall rules)"
  value       = "nat-gateway"
}

output "route_tags" {
  description = "The network tags that identify instances using the NAT route"
  value       = var.route_tags
}
