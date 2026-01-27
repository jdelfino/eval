# GCP Memorystore Redis Module Variables
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
# Redis Instance Configuration
# -----------------------------------------------------------------------------

variable "instance_name" {
  description = "Name of the Redis instance (optional, defaults to project-env-redis)"
  type        = string
  default     = null
}

variable "tier" {
  description = "Service tier: BASIC (no replication) or STANDARD_HA (cross-zone replication)"
  type        = string
  default     = "BASIC"
}

variable "memory_size_gb" {
  description = "Memory size in GB for the Redis instance"
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Redis version (e.g., REDIS_7_0)"
  type        = string
  default     = "REDIS_7_0"
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "connect_mode" {
  description = "Connection mode: DIRECT_PEERING or PRIVATE_SERVICE_ACCESS"
  type        = string
  default     = "PRIVATE_SERVICE_ACCESS"
}

variable "vpc_network_id" {
  description = "VPC network ID for private connectivity"
  type        = string
}

# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------

variable "labels" {
  description = "Additional labels to apply to resources"
  type        = map(string)
  default     = {}
}
