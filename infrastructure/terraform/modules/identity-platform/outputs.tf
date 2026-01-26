# GCP Identity Platform Module Outputs
#
# Outputs for integration with other modules and applications.
# These values are used to configure application authentication.

# -----------------------------------------------------------------------------
# Identity Platform Configuration
# -----------------------------------------------------------------------------

output "project_id" {
  description = "GCP project ID where Identity Platform is configured"
  value       = var.project_id
}

output "api_key" {
  description = "Web API key for Identity Platform (use with Firebase Auth SDK)"
  value       = try(google_identity_platform_config.main.client[0].api_key, "")
  sensitive   = true
}

output "firebase_subdomain" {
  description = "Firebase Auth subdomain for this project"
  value       = try(google_identity_platform_config.main.client[0].firebase_subdomain, "")
}

# -----------------------------------------------------------------------------
# OAuth Client Configuration
# -----------------------------------------------------------------------------
# Note: OAuth clients must be created manually in GCP Console.
# Pass the client ID/secret as variables to expose them as outputs.

output "oauth_client_id" {
  description = "OAuth 2.0 client ID (manually configured)"
  value       = var.oauth_client_id
}

output "oauth_client_secret" {
  description = "OAuth 2.0 client secret (manually configured)"
  value       = var.oauth_client_secret
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Auth Domain URLs
# -----------------------------------------------------------------------------

output "auth_domain" {
  description = "Authentication domain URL"
  value       = "${var.project_id}.firebaseapp.com"
}

output "auth_uri" {
  description = "OAuth authorization endpoint"
  value       = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp"
}

output "token_uri" {
  description = "OAuth token endpoint"
  value       = "https://securetoken.googleapis.com/v1/token"
}

# -----------------------------------------------------------------------------
# SAML Configuration (Placeholder)
# -----------------------------------------------------------------------------

output "saml_enabled" {
  description = "Whether SAML authentication is enabled"
  value       = var.saml_enabled
}

output "saml_provider_id" {
  description = "SAML provider identifier"
  value       = var.saml_provider_id
}

# -----------------------------------------------------------------------------
# Manual Configuration Instructions
# -----------------------------------------------------------------------------

output "manual_setup_instructions" {
  description = "Instructions for manual configuration steps required"
  value       = <<-EOT
    Identity Platform Manual Configuration Required:

    1. OAuth 2.0 Web Client:
       - Go to: https://console.cloud.google.com/apis/credentials?project=${var.project_id}
       - Click "Create Credentials" > "OAuth client ID"
       - Application type: "Web application"
       - Name: "${local.name_prefix}-web-client"
       - Authorized JavaScript origins: Add your app domains
       - Authorized redirect URIs: Add your callback URLs
       - Save the Client ID and Client Secret

    2. SAML Provider (if needed):
       - Go to: https://console.cloud.google.com/customer-identity/providers?project=${var.project_id}
       - Click "Add a Provider"
       - Select "SAML"
       - Configure with your IdP metadata
       - Note the SP Entity ID and ACS URL for your IdP

    3. Email Templates (optional):
       - Go to: https://console.cloud.google.com/customer-identity/settings?project=${var.project_id}
       - Customize email verification, password reset templates

    4. Update Terraform Variables:
       After creating OAuth client, update your terraform.tfvars:
       oauth_client_id     = "your-client-id.apps.googleusercontent.com"
       oauth_client_secret = "your-client-secret"
  EOT
}
