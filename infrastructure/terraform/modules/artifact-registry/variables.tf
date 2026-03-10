# GCP Artifact Registry Module Variables
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
  description = "GCP region for the repository"
  type        = string
}

# -----------------------------------------------------------------------------
# Repository Configuration
# -----------------------------------------------------------------------------

variable "repository_id" {
  description = "The repository ID (used in the repository URL)"
  type        = string
  default     = "go-api"
}

variable "description" {
  description = "Description of the repository"
  type        = string
  default     = "Go API container images"
}

variable "format" {
  description = "Repository format (DOCKER, NPM, MAVEN, etc.)"
  type        = string
  default     = "DOCKER"

  validation {
    condition     = contains(["DOCKER", "NPM", "MAVEN", "APT", "YUM", "PYTHON", "GO"], var.format)
    error_message = "format must be one of: DOCKER, NPM, MAVEN, APT, YUM, PYTHON, GO"
  }
}

variable "immutable_tags" {
  description = "If true, the repository will be set to immutable (tags cannot be overwritten)"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Cleanup Policy Configuration
# -----------------------------------------------------------------------------

variable "cleanup_policy_dry_run" {
  description = "If true, cleanup policy will only report what would be deleted"
  type        = bool
  default     = false
}

variable "cleanup_keep_count" {
  description = "Number of most recent versions to keep per package"
  type        = number
  default     = 3
}

variable "cleanup_untagged_max_age" {
  description = "Max age for untagged images before deletion (e.g. 86400s = 1 day)"
  type        = string
  default     = "86400s"
}

variable "cleanup_tagged_max_age" {
  description = "Max age for tagged images before deletion (e.g. 604800s = 7 days)"
  type        = string
  default     = "604800s"
}
