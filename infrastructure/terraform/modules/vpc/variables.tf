# GCP VPC Module Variables
#
# All required variables have no defaults - forces explicit configuration.
# Values are provided by the calling environment.

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
# VPC Configuration
# -----------------------------------------------------------------------------

variable "vpc_name" {
  description = "Name of the VPC network"
  type        = string
  default     = null
}

# -----------------------------------------------------------------------------
# GKE Subnet Configuration
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

# -----------------------------------------------------------------------------
# Cloud SQL Subnet Configuration
# -----------------------------------------------------------------------------

variable "cloudsql_subnet_cidr" {
  description = "CIDR block for Cloud SQL private services"
  type        = string
}

variable "private_service_access_cidr" {
  description = "CIDR block for Private Service Access (Cloud SQL VPC peering)"
  type        = string
}

variable "private_service_access_prefix_length" {
  description = "Prefix length for Private Service Access CIDR"
  type        = number
  default     = 16
}

# -----------------------------------------------------------------------------
# Public Subnet Configuration
# -----------------------------------------------------------------------------

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet (NAT, bastion, etc.)"
  type        = string
}

# -----------------------------------------------------------------------------
# Flow Logs
# -----------------------------------------------------------------------------

variable "enable_flow_logs" {
  description = "Enable VPC flow logs on all subnets. Defaults to false to save costs; set true for debugging."
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Firewall Configuration
# -----------------------------------------------------------------------------

variable "enable_internal_firewall" {
  description = "Enable firewall rules for internal communication"
  type        = bool
  default     = true
}

variable "internal_allow_protocols" {
  description = "List of protocols to allow for internal communication"
  type        = list(string)
  default     = ["tcp", "udp", "icmp"]
}

variable "gke_master_cidr" {
  description = "CIDR block for GKE master (control plane) in private cluster mode"
  type        = string
  default     = null
}
