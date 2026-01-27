# Workload Identity Federation Module Variables
#
# Configures GitHub Actions to authenticate with GCP without service account keys.

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

variable "project_number" {
  description = "GCP project number (numeric ID)"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

# -----------------------------------------------------------------------------
# GitHub Repository Configuration
# -----------------------------------------------------------------------------

variable "github_owner" {
  description = "GitHub repository owner (user or organization)"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

# -----------------------------------------------------------------------------
# Service Account Roles
# -----------------------------------------------------------------------------

variable "service_account_roles" {
  description = "IAM roles to grant to the GitHub Actions service account"
  type        = list(string)
  default = [
    "roles/artifactregistry.writer",
    "roles/container.developer",
    "roles/gkehub.gatewayReader",
    "roles/gkehub.viewer"
  ]
}
