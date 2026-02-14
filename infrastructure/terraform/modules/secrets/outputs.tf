# GCP Secret Manager Module Outputs
#
# Outputs for integration with other modules (e.g., Kubernetes secrets).
# All secret values are marked sensitive.

# -----------------------------------------------------------------------------
# Secret Values
# -----------------------------------------------------------------------------

output "secret_values" {
  description = "Map of secret_id to secret data (latest version). Use this to pass secret values to Kubernetes secrets or other consumers."
  value = {
    for id, version in data.google_secret_manager_secret_version.secrets : id => version.secret_data
  }
  sensitive = true
}

# -----------------------------------------------------------------------------
# Secret Resource IDs
# -----------------------------------------------------------------------------

output "secret_resource_ids" {
  description = "Map of secret_id to the fully-qualified Secret Manager resource ID"
  value = {
    for id, secret in google_secret_manager_secret.secrets : id => secret.id
  }
}

# -----------------------------------------------------------------------------
# Convenience Outputs
# -----------------------------------------------------------------------------

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}
