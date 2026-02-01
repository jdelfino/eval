# GCP GKE Standard Module Outputs
#
# Outputs for integration with other modules and applications.
# These values are used to configure kubectl, workloads, and CI/CD.

# -----------------------------------------------------------------------------
# Cluster Identification
# -----------------------------------------------------------------------------

output "cluster_id" {
  description = "The unique identifier of the cluster"
  value       = google_container_cluster.main.id
}

output "cluster_name" {
  description = "The name of the cluster"
  value       = google_container_cluster.main.name
}

output "cluster_self_link" {
  description = "The self-link of the cluster"
  value       = google_container_cluster.main.self_link
}

# -----------------------------------------------------------------------------
# Cluster Endpoints
# -----------------------------------------------------------------------------

output "endpoint" {
  description = "The IP address of the cluster master"
  value       = google_container_cluster.main.endpoint
  sensitive   = true
}

output "private_endpoint" {
  description = "The private IP address of the cluster master (if private endpoint enabled)"
  value       = google_container_cluster.main.private_cluster_config[0].private_endpoint
  sensitive   = true
}

output "public_endpoint" {
  description = "The public IP address of the cluster master (if private endpoint disabled)"
  value       = google_container_cluster.main.private_cluster_config[0].public_endpoint
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Cluster Authentication
# -----------------------------------------------------------------------------

output "ca_certificate" {
  description = "Base64 encoded public certificate that is the root of trust for the cluster"
  value       = google_container_cluster.main.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Workload Identity
# -----------------------------------------------------------------------------

output "workload_identity_pool" {
  description = "Workload Identity pool for the cluster"
  value       = var.workload_identity_enabled ? "${var.project_id}.svc.id.goog" : null
}

# -----------------------------------------------------------------------------
# Network Information
# -----------------------------------------------------------------------------

output "network" {
  description = "The VPC network the cluster is connected to"
  value       = google_container_cluster.main.network
}

output "subnetwork" {
  description = "The subnetwork the cluster is connected to"
  value       = google_container_cluster.main.subnetwork
}

output "master_ipv4_cidr_block" {
  description = "The IP range in CIDR notation for the hosted master network"
  value       = var.master_ipv4_cidr_block
}

# -----------------------------------------------------------------------------
# Cluster Metadata
# -----------------------------------------------------------------------------

output "location" {
  description = "The location (zone) of the cluster"
  value       = google_container_cluster.main.location
}

output "project_id" {
  description = "The project ID the cluster is in"
  value       = var.project_id
}

output "release_channel" {
  description = "The release channel of the cluster"
  value       = var.release_channel
}

output "cluster_version" {
  description = "The current Kubernetes version of the cluster"
  value       = google_container_cluster.main.master_version
}

# -----------------------------------------------------------------------------
# kubectl Configuration Helper
# -----------------------------------------------------------------------------

output "get_credentials_command" {
  description = "gcloud command to get cluster credentials"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.main.name} --zone ${var.zone} --project ${var.project_id}"
}
