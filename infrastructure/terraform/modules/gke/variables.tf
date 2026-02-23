# GCP GKE Standard Module Variables
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
  description = "GCP region (used by other modules sharing this variable set)"
  type        = string
}

variable "zone" {
  description = "GCP zone for the zonal GKE cluster (e.g. us-east1-b)"
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

# -----------------------------------------------------------------------------
# Network Tags
# -----------------------------------------------------------------------------

variable "node_network_tags" {
  description = "Network tags applied to all node pool instances (used for route targeting)"
  type        = list(string)
  default     = []
}

# -----------------------------------------------------------------------------
# Default Node Pool
# -----------------------------------------------------------------------------

variable "default_pool_machine_type" {
  description = "Machine type for the default node pool"
  type        = string
  default     = "e2-small"
}

variable "default_pool_min_nodes" {
  description = "Minimum number of nodes in the default pool (must be >= 1 for system pods)"
  type        = number
  default     = 1
}

variable "default_pool_max_nodes" {
  description = "Maximum number of nodes in the default pool"
  type        = number
  default     = 3
}

variable "default_pool_spot" {
  description = "Use spot VMs for the default node pool"
  type        = bool
  default     = true
}

variable "default_pool_disk_size_gb" {
  description = "Boot disk size in GB for the default node pool"
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# Executor Node Pool
# -----------------------------------------------------------------------------

variable "executor_pool_machine_type" {
  description = "Machine type for the executor node pool"
  type        = string
  default     = "e2-medium"
}

variable "executor_pool_min_nodes" {
  description = "Minimum number of nodes in the executor pool (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "executor_pool_max_nodes" {
  description = "Maximum number of nodes in the executor pool"
  type        = number
  default     = 5
}

variable "executor_pool_spot" {
  description = "Use spot VMs for the executor node pool"
  type        = bool
  default     = true
}

variable "executor_pool_disk_size_gb" {
  description = "Boot disk size in GB for the executor node pool"
  type        = number
  default     = 30
}
