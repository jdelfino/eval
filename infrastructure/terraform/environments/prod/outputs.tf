# Production Environment Outputs
#
# Expose key values from modules for reference and debugging.

# -----------------------------------------------------------------------------
# VPC Outputs
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the VPC network"
  value       = module.vpc.vpc_id
}

output "vpc_name" {
  description = "Name of the VPC network"
  value       = module.vpc.vpc_name
}

output "gke_subnet_id" {
  description = "ID of the GKE subnet"
  value       = module.vpc.gke_subnet_id
}

output "cloudsql_subnet_id" {
  description = "ID of the Cloud SQL subnet"
  value       = module.vpc.cloudsql_subnet_id
}

output "public_subnet_id" {
  description = "ID of the public subnet"
  value       = module.vpc.public_subnet_id
}

# -----------------------------------------------------------------------------
# NAT Outputs
# -----------------------------------------------------------------------------

output "nat_external_ip" {
  description = "External IP address of the NAT VM"
  value       = module.nat.nat_external_ip
}

# -----------------------------------------------------------------------------
# GKE Outputs
# -----------------------------------------------------------------------------

output "gke_cluster_name" {
  description = "Name of the GKE cluster"
  value       = module.gke.cluster_name
}

output "gke_cluster_endpoint" {
  description = "Endpoint for the GKE cluster"
  value       = module.gke.endpoint
  sensitive   = true
}

output "gke_get_credentials_command" {
  description = "gcloud command to get cluster credentials"
  value       = module.gke.get_credentials_command
}

# -----------------------------------------------------------------------------
# Cloud SQL Outputs
# -----------------------------------------------------------------------------

output "cloudsql_instance_name" {
  description = "Cloud SQL instance name"
  value       = module.cloudsql.instance_name
}

output "cloudsql_connection_name" {
  description = "Cloud SQL instance connection name for Cloud SQL Proxy"
  value       = module.cloudsql.instance_connection_name
}

output "cloudsql_private_ip" {
  description = "Cloud SQL instance private IP address"
  value       = module.cloudsql.private_ip_address
}

# -----------------------------------------------------------------------------
# Identity Platform Outputs
# -----------------------------------------------------------------------------

output "identity_platform_auth_domain" {
  description = "Identity Platform authentication domain"
  value       = module.identity_platform.auth_domain
}

output "identity_platform_api_key" {
  description = "Identity Platform Web API key"
  value       = module.identity_platform.api_key
  sensitive   = true
}

output "identity_platform_setup_instructions" {
  description = "Manual setup instructions for Identity Platform"
  value       = module.identity_platform.manual_setup_instructions
}
