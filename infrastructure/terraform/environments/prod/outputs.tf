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

output "cloudsql_database_password" {
  description = "Cloud SQL database password (for proxy connections)"
  value       = module.cloudsql.database_password
  sensitive   = true
}

output "cloudsql_reader_password" {
  description = "Cloud SQL reader password (for read-only debugging connections)"
  value       = module.cloudsql.reader_password
  sensitive   = true
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

# -----------------------------------------------------------------------------
# Artifact Registry Outputs
# -----------------------------------------------------------------------------

output "artifact_registry_url" {
  description = "Artifact Registry repository URL for Docker operations"
  value       = module.artifact_registry.repository_url
}

# -----------------------------------------------------------------------------
# Workload Identity Federation Outputs
# -----------------------------------------------------------------------------

output "wif_provider" {
  description = "Workload Identity Provider for GitHub Actions auth"
  value       = module.workload_identity_federation.workload_identity_provider
}

output "wif_service_account" {
  description = "Service account email for GitHub Actions"
  value       = module.workload_identity_federation.service_account_email
}

output "github_secrets_setup" {
  description = "Instructions for configuring GitHub Actions secrets"
  value       = module.workload_identity_federation.github_secrets_setup
}

# -----------------------------------------------------------------------------
# DNS / SSL Outputs
# -----------------------------------------------------------------------------

output "dns_name_servers" {
  description = "Cloud DNS nameservers — add these as NS records in GoDaddy"
  value       = module.dns_ssl.dns_name_servers
}

output "ingress_static_ip" {
  description = "Static IP address for the ingress load balancer"
  value       = module.dns_ssl.static_ip_address
}

output "godaddy_instructions" {
  description = "Instructions for GoDaddy DNS delegation"
  value       = module.dns_ssl.godaddy_instructions
}
