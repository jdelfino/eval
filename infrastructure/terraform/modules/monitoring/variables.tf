# Cloud Monitoring Dashboard Module Variables
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
  description = "GCP region"
  type        = string
}

# -----------------------------------------------------------------------------
# Dashboard Configuration
# -----------------------------------------------------------------------------

variable "dashboard_display_name" {
  description = "Display name for the monitoring dashboard"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Alerting Configuration
# -----------------------------------------------------------------------------

variable "alert_email" {
  description = "Email address for alert notification channel"
  type        = string
}
