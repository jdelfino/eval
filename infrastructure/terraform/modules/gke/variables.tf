# GCP GKE Autopilot Module Variables
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
  description = "GCP region for the cluster"
  type        = string
}

# -----------------------------------------------------------------------------
# Cluster Configuration
# -----------------------------------------------------------------------------

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = null
}

variable "release_channel" {
  description = "Release channel for GKE upgrades (RAPID, REGULAR, STABLE)"
  type        = string
  default     = "REGULAR"

  validation {
    condition     = contains(["RAPID", "REGULAR", "STABLE"], var.release_channel)
    error_message = "release_channel must be one of: RAPID, REGULAR, STABLE"
  }
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection on the cluster"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "network" {
  description = "The VPC network to host the cluster in"
  type        = string
}

variable "subnetwork" {
  description = "The subnetwork to host the cluster in"
  type        = string
}

variable "pods_range_name" {
  description = "The name of the secondary IP range for pods"
  type        = string
}

variable "services_range_name" {
  description = "The name of the secondary IP range for services"
  type        = string
}

# -----------------------------------------------------------------------------
# Private Cluster Configuration
# -----------------------------------------------------------------------------

variable "enable_private_nodes" {
  description = "Whether nodes have internal IP addresses only"
  type        = bool
  default     = true
}

variable "enable_private_endpoint" {
  description = "Whether the master's internal IP is used as the cluster endpoint"
  type        = bool
  default     = false
}

variable "master_ipv4_cidr_block" {
  description = "The IP range in CIDR notation for the hosted master network"
  type        = string
  default     = "172.16.0.0/28"
}

# -----------------------------------------------------------------------------
# Authorized Networks (Master Access)
# -----------------------------------------------------------------------------

variable "master_authorized_networks" {
  description = "List of networks authorized to access the Kubernetes master"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

# -----------------------------------------------------------------------------
# Workload Identity
# -----------------------------------------------------------------------------

variable "workload_identity_enabled" {
  description = "Enable Workload Identity for the cluster"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Maintenance Window
# -----------------------------------------------------------------------------

variable "maintenance_start_time" {
  description = "Time window specified for daily maintenance operations (UTC)"
  type        = string
  default     = "03:00"
}

# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------

variable "cluster_resource_labels" {
  description = "The GCP labels (key/value pairs) to be applied to the cluster"
  type        = map(string)
  default     = {}
}
