# GCP Identity Platform Module Variables
#
# All required variables have no defaults - forces explicit configuration.
# Values are provided by the calling environment.
#
# Note: Identity Platform has limited Terraform support. OAuth clients and
# SAML providers must be configured manually in the GCP Console.

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
# Identity Platform Configuration
# -----------------------------------------------------------------------------

variable "autodelete_anonymous_users" {
  description = "Automatically delete anonymous users after 30 days of inactivity"
  type        = bool
  default     = true
}

variable "allow_duplicate_emails" {
  description = "Allow multiple accounts with the same email address"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Sign-in Methods
# -----------------------------------------------------------------------------

variable "enable_email_password" {
  description = "Enable email/password sign-in"
  type        = bool
  default     = true
}

variable "password_required" {
  description = "Require password for email sign-in (false enables passwordless email link)"
  type        = bool
  default     = true
}

variable "enable_anonymous" {
  description = "Enable anonymous authentication"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Authorized Domains
# -----------------------------------------------------------------------------

variable "authorized_domains" {
  description = "List of domains authorized for OAuth redirects (e.g., ['app.example.com', 'localhost'])"
  type        = list(string)
  default     = []
}

# -----------------------------------------------------------------------------
# MFA Configuration
# -----------------------------------------------------------------------------

variable "mfa_state" {
  description = "MFA enforcement state: DISABLED, ENABLED (optional), or MANDATORY"
  type        = string
  default     = "DISABLED"

  validation {
    condition     = contains(["DISABLED", "ENABLED", "MANDATORY"], var.mfa_state)
    error_message = "mfa_state must be one of: DISABLED, ENABLED, MANDATORY"
  }
}

# -----------------------------------------------------------------------------
# OAuth Client (Manual Configuration Reference)
# -----------------------------------------------------------------------------
# Note: OAuth clients cannot be created via Terraform for Identity Platform.
# These variables are provided for reference and output purposes only.

variable "oauth_client_id" {
  description = "OAuth 2.0 client ID (created manually in GCP Console)"
  type        = string
  default     = ""
}

variable "oauth_client_secret" {
  description = "OAuth 2.0 client secret (created manually in GCP Console)"
  type        = string
  default     = ""
  sensitive   = true
}

# -----------------------------------------------------------------------------
# SAML Configuration (Placeholder)
# -----------------------------------------------------------------------------
# Note: SAML configuration requires manual setup in GCP Console.
# These variables are placeholders for future automation.

variable "saml_enabled" {
  description = "Whether SAML authentication is enabled (requires manual configuration)"
  type        = bool
  default     = false
}

variable "saml_provider_id" {
  description = "SAML provider identifier (for documentation purposes)"
  type        = string
  default     = ""
}
