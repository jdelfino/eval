# Production Environment Variables
#
# All required variables have no defaults - forces explicit configuration.
# Values are provided via terraform.tfvars.

# -----------------------------------------------------------------------------
# Common Variables (required by all modules)
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Environment name (staging or prod)"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
}

# -----------------------------------------------------------------------------
# VPC Variables
# -----------------------------------------------------------------------------

variable "gke_subnet_cidr" {
  description = "CIDR block for the GKE nodes subnet"
  type        = string
}

variable "gke_pods_cidr" {
  description = "Secondary CIDR range for GKE pods"
  type        = string
}

variable "gke_services_cidr" {
  description = "Secondary CIDR range for GKE services"
  type        = string
}

variable "cloudsql_subnet_cidr" {
  description = "CIDR block for Cloud SQL private services"
  type        = string
}

variable "private_service_access_cidr" {
  description = "CIDR block for Private Service Access (Cloud SQL VPC peering)"
  type        = string
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet (NAT, bastion, etc.)"
  type        = string
}

# -----------------------------------------------------------------------------
# NAT Variables
# -----------------------------------------------------------------------------

variable "nat_zone" {
  description = "GCP zone for the NAT VM instance"
  type        = string
}

# -----------------------------------------------------------------------------
# GKE Variables
# -----------------------------------------------------------------------------

variable "gke_release_channel" {
  description = "Release channel for GKE upgrades (RAPID, REGULAR, STABLE)"
  type        = string
  default     = "REGULAR"
}

variable "gke_deletion_protection" {
  description = "Whether to enable deletion protection on the GKE cluster"
  type        = bool
  default     = true
}

variable "gke_master_ipv4_cidr_block" {
  description = "The IP range in CIDR notation for the hosted master network"
  type        = string
  default     = "172.16.0.0/28"
}

variable "gke_master_authorized_networks" {
  description = "List of networks authorized to access the Kubernetes master"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

# -----------------------------------------------------------------------------
# Cloud SQL Variables
# -----------------------------------------------------------------------------

variable "database_name" {
  description = "Name of the database to create"
  type        = string
}

variable "cloudsql_tier" {
  description = "Cloud SQL instance tier (machine type)"
  type        = string
  default     = "db-g1-small"
}

variable "cloudsql_disk_size" {
  description = "Storage capacity in GB"
  type        = number
  default     = 10
}

variable "cloudsql_availability_type" {
  description = "Availability type: REGIONAL (HA) or ZONAL"
  type        = string
  default     = "ZONAL"
}

variable "cloudsql_deletion_protection" {
  description = "Prevent accidental deletion of the instance"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Identity Platform Variables
# -----------------------------------------------------------------------------

variable "authorized_domains" {
  description = "List of domains authorized for OAuth redirects"
  type        = list(string)
  default     = []
}

variable "oauth_client_id" {
  description = "OAuth 2.0 client ID (created manually in GCP Console)"
  type        = string
  default     = ""
}

variable "oauth_client_secret" {
  description = "OAuth 2.0 client secret (created manually in GCP Console)"
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Workload Identity Federation Variables
# -----------------------------------------------------------------------------

variable "project_number" {
  description = "GCP project number (numeric ID, required for WIF)"
  type        = string
}

variable "github_owner" {
  description = "GitHub repository owner (user or organization)"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}
