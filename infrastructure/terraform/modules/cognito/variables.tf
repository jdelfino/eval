# Cognito Module Variables

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

variable "region" {
  description = "AWS region"
  type        = string
}

# -----------------------------------------------------------------------------
# Cognito-specific Variables
# -----------------------------------------------------------------------------

variable "callback_urls" {
  description = "Allowed callback URLs for OAuth"
  type        = list(string)
}

variable "logout_urls" {
  description = "Allowed logout URLs"
  type        = list(string)
}
