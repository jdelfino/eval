# GCP VPC Module Outputs
#
# Expose all values needed by other modules and applications.

# -----------------------------------------------------------------------------
# VPC Network Outputs
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "The ID of the VPC network"
  value       = google_compute_network.vpc.id
}

output "vpc_name" {
  description = "The name of the VPC network"
  value       = google_compute_network.vpc.name
}

output "vpc_self_link" {
  description = "The self-link of the VPC network"
  value       = google_compute_network.vpc.self_link
}

# -----------------------------------------------------------------------------
# GKE Subnet Outputs
# -----------------------------------------------------------------------------

output "gke_subnet_id" {
  description = "The ID of the GKE subnet"
  value       = google_compute_subnetwork.gke.id
}

output "gke_subnet_name" {
  description = "The name of the GKE subnet"
  value       = google_compute_subnetwork.gke.name
}

output "gke_subnet_self_link" {
  description = "The self-link of the GKE subnet"
  value       = google_compute_subnetwork.gke.self_link
}

output "gke_subnet_cidr" {
  description = "The CIDR range of the GKE subnet"
  value       = google_compute_subnetwork.gke.ip_cidr_range
}

output "gke_pods_range_name" {
  description = "The name of the secondary IP range for GKE pods"
  value       = "pods"
}

output "gke_services_range_name" {
  description = "The name of the secondary IP range for GKE services"
  value       = "services"
}

output "gke_pods_cidr" {
  description = "The CIDR range for GKE pods"
  value       = var.gke_pods_cidr
}

output "gke_services_cidr" {
  description = "The CIDR range for GKE services"
  value       = var.gke_services_cidr
}

# -----------------------------------------------------------------------------
# Cloud SQL Subnet Outputs
# -----------------------------------------------------------------------------

output "cloudsql_subnet_id" {
  description = "The ID of the Cloud SQL subnet"
  value       = google_compute_subnetwork.cloudsql.id
}

output "cloudsql_subnet_name" {
  description = "The name of the Cloud SQL subnet"
  value       = google_compute_subnetwork.cloudsql.name
}

output "cloudsql_subnet_self_link" {
  description = "The self-link of the Cloud SQL subnet"
  value       = google_compute_subnetwork.cloudsql.self_link
}

output "cloudsql_subnet_cidr" {
  description = "The CIDR range of the Cloud SQL subnet"
  value       = google_compute_subnetwork.cloudsql.ip_cidr_range
}

# -----------------------------------------------------------------------------
# Public Subnet Outputs
# -----------------------------------------------------------------------------

output "public_subnet_id" {
  description = "The ID of the public subnet"
  value       = google_compute_subnetwork.public.id
}

output "public_subnet_name" {
  description = "The name of the public subnet"
  value       = google_compute_subnetwork.public.name
}

output "public_subnet_self_link" {
  description = "The self-link of the public subnet"
  value       = google_compute_subnetwork.public.self_link
}

output "public_subnet_cidr" {
  description = "The CIDR range of the public subnet"
  value       = google_compute_subnetwork.public.ip_cidr_range
}

# -----------------------------------------------------------------------------
# Private Service Access Outputs (for Cloud SQL)
# -----------------------------------------------------------------------------

output "private_service_access_address" {
  description = "The reserved IP address for Private Service Access"
  value       = google_compute_global_address.private_service_access.address
}

output "private_service_access_name" {
  description = "The name of the Private Service Access range"
  value       = google_compute_global_address.private_service_access.name
}

output "private_service_connection_id" {
  description = "The ID of the Private Service Connection"
  value       = google_service_networking_connection.private_service_access.id
}

# -----------------------------------------------------------------------------
# Convenience Outputs for Other Modules
# -----------------------------------------------------------------------------

output "region" {
  description = "The region where the VPC resources are created"
  value       = var.region
}

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}
