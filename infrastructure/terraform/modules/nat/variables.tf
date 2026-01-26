# GCP NAT VM Module Variables
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

variable "zone" {
  description = "GCP zone for the NAT VM instance"
  type        = string
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "network_id" {
  description = "The ID of the VPC network"
  type        = string
}

variable "public_subnet_id" {
  description = "The ID of the public subnet for the NAT VM"
  type        = string
}

variable "private_subnet_cidr" {
  description = "CIDR range of the private subnet that will use NAT"
  type        = string
}

# -----------------------------------------------------------------------------
# NAT VM Configuration
# -----------------------------------------------------------------------------

variable "machine_type" {
  description = "Machine type for the NAT VM instance"
  type        = string
  default     = "e2-micro"
}

variable "boot_disk_size_gb" {
  description = "Size of the boot disk in GB"
  type        = number
  default     = 10
}

variable "boot_disk_type" {
  description = "Type of the boot disk (pd-standard, pd-ssd, pd-balanced)"
  type        = string
  default     = "pd-standard"
}

variable "image_family" {
  description = "Image family for the NAT VM boot disk"
  type        = string
  default     = "debian-12"
}

variable "image_project" {
  description = "Project containing the image family"
  type        = string
  default     = "debian-cloud"
}

# -----------------------------------------------------------------------------
# Route Configuration
# -----------------------------------------------------------------------------

variable "route_priority" {
  description = "Priority for the NAT route (lower = higher priority)"
  type        = number
  default     = 800
}

variable "route_tags" {
  description = "Network tags that identify instances that should use the NAT route"
  type        = list(string)
  default     = ["private"]
}

# -----------------------------------------------------------------------------
# Optional Configuration
# -----------------------------------------------------------------------------

variable "name_prefix" {
  description = "Optional prefix for resource names (defaults to project_name-environment)"
  type        = string
  default     = null
}

variable "labels" {
  description = "Additional labels to apply to resources"
  type        = map(string)
  default     = {}
}
