# GCP Cloud SQL Module Variables
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
# Cloud SQL Instance Configuration
# -----------------------------------------------------------------------------

variable "instance_name" {
  description = "Name of the Cloud SQL instance (optional, defaults to project-env-db)"
  type        = string
  default     = null
}

variable "database_version" {
  description = "PostgreSQL version (e.g., POSTGRES_15)"
  type        = string
  default     = "POSTGRES_15"
}

variable "tier" {
  description = "Cloud SQL instance tier (machine type)"
  type        = string
  default     = "db-g1-small"
}

variable "disk_size" {
  description = "Storage capacity in GB"
  type        = number
  default     = 10
}

variable "disk_type" {
  description = "Storage type: PD_SSD or PD_HDD"
  type        = string
  default     = "PD_SSD"
}

variable "disk_autoresize" {
  description = "Enable automatic storage increase"
  type        = bool
  default     = true
}

variable "disk_autoresize_limit" {
  description = "Maximum storage capacity in GB (0 = unlimited)"
  type        = number
  default     = 100
}

# -----------------------------------------------------------------------------
# Database Configuration
# -----------------------------------------------------------------------------

variable "database_name" {
  description = "Name of the database to create"
  type        = string
}

variable "database_user" {
  description = "Name of the database user to create"
  type        = string
  default     = "app"
}

variable "database_charset" {
  description = "Character set for the database"
  type        = string
  default     = "UTF8"
}

variable "database_collation" {
  description = "Collation for the database"
  type        = string
  default     = "en_US.UTF8"
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "vpc_network_id" {
  description = "VPC network ID for private IP connectivity"
  type        = string
}

variable "private_network_enabled" {
  description = "Enable private IP (requires Private Service Access)"
  type        = bool
  default     = true
}

variable "public_network_enabled" {
  description = "Enable public IP (not recommended for production)"
  type        = bool
  default     = false
}

variable "authorized_networks" {
  description = "List of authorized networks for public IP access"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# -----------------------------------------------------------------------------
# Backup Configuration
# -----------------------------------------------------------------------------

variable "backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_start_time" {
  description = "Start time for backup window (HH:MM format, UTC)"
  type        = string
  default     = "03:00"
}

variable "backup_location" {
  description = "Location for backup storage (optional, defaults to instance region)"
  type        = string
  default     = null
}

variable "point_in_time_recovery_enabled" {
  description = "Enable point-in-time recovery"
  type        = bool
  default     = true
}

variable "transaction_log_retention_days" {
  description = "Number of days to retain transaction logs (1-7)"
  type        = number
  default     = 7
}

variable "retained_backups" {
  description = "Number of backups to retain"
  type        = number
  default     = 7
}

# -----------------------------------------------------------------------------
# Maintenance Configuration
# -----------------------------------------------------------------------------

variable "maintenance_window_day" {
  description = "Day of week for maintenance window (1=Monday, 7=Sunday)"
  type        = number
  default     = 7
}

variable "maintenance_window_hour" {
  description = "Hour of day for maintenance window (0-23, UTC)"
  type        = number
  default     = 4
}

variable "maintenance_window_update_track" {
  description = "Maintenance update track: canary, stable, or week5"
  type        = string
  default     = "stable"
}

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------

variable "require_ssl" {
  description = "Require SSL connections to the database"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Prevent accidental deletion of the instance"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# High Availability Configuration
# -----------------------------------------------------------------------------

variable "availability_type" {
  description = "Availability type: REGIONAL (HA) or ZONAL"
  type        = string
  default     = "ZONAL"
}

# -----------------------------------------------------------------------------
# Database Flags
# -----------------------------------------------------------------------------

variable "database_flags" {
  description = "Database flags to set on the instance"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------

variable "labels" {
  description = "Additional labels to apply to resources"
  type        = map(string)
  default     = {}
}
