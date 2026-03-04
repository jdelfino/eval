# GCP Identity Platform Module
#
# This module configures Google Cloud Identity Platform for authentication,
# replacing AWS Cognito in the GCP migration.
#
# IMPORTANT: Terraform support for Identity Platform is limited. The following
# require manual configuration in the GCP Console:
#   - OAuth 2.0 Web Client (APIs & Services > Credentials)
#   - SAML provider configuration (Identity Platform > Providers)
#   - Email templates customization
#
# See outputs.tf for manual configuration instructions.

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "identitytoolkit" {
  project = var.project_id
  service = "identitytoolkit.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}

# -----------------------------------------------------------------------------
# Identity Platform Configuration
# -----------------------------------------------------------------------------

resource "google_identity_platform_config" "main" {
  project = var.project_id

  # Automatically clean up anonymous users
  autodelete_anonymous_users = var.autodelete_anonymous_users

  # Sign-in configuration
  sign_in {
    allow_duplicate_emails = var.allow_duplicate_emails

    # Email/password authentication
    email {
      enabled           = var.enable_email_password
      password_required = var.password_required
    }

    # Anonymous authentication
    anonymous {
      enabled = var.enable_anonymous
    }
  }

  # Client configuration (provides API key for SDK usage)
  client {
    permissions {
      disabled_user_signup   = false
      disabled_user_deletion = false
    }
  }

  # Enable multi-tenancy (required for staging tenant isolation)
  multi_tenant {
    allow_tenants = true
  }

  # Authorized domains for OAuth redirects
  # Note: The project's Firebase hosting domains are automatically included
  authorized_domains = length(var.authorized_domains) > 0 ? var.authorized_domains : null

  depends_on = [google_project_service.identitytoolkit]
}

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  # Resource naming convention
  name_prefix = "${var.project_name}-${var.environment}"

  # Common labels for all resources
  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
    module      = "identity-platform"
  }
}

# -----------------------------------------------------------------------------
# MFA Configuration
# -----------------------------------------------------------------------------
# Note: MFA is configured within google_identity_platform_config in newer
# provider versions. For now, document manual steps if MFA is required.

# -----------------------------------------------------------------------------
# SAML Provider Configuration (Placeholder)
# -----------------------------------------------------------------------------
# Note: SAML configuration requires manual setup. When provider support improves,
# the configuration would look like:
#
# resource "google_identity_platform_inbound_saml_config" "main" {
#   count        = var.saml_enabled ? 1 : 0
#   project      = var.project_id
#   name         = "saml.${var.saml_provider_id}"
#   display_name = "SAML Provider"
#   enabled      = true
#
#   idp_config {
#     idp_entity_id  = "..."
#     sso_url        = "..."
#     idp_certificates {
#       x509_certificate = "..."
#     }
#   }
#
#   sp_config {
#     sp_entity_id = "..."
#     callback_uri = "..."
#   }
#
#   depends_on = [google_identity_platform_config.main]
# }
