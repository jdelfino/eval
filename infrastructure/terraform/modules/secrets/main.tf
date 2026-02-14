# GCP Secret Manager Module
#
# Manages Secret Manager secrets and reads their latest versions.
#
# IMPORTANT: Secret values must be created manually via `gcloud secrets versions add`
# or GCP Console BEFORE the first `terraform apply`. The data sources that read
# secret versions will fail if no version exists for a secret.

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  # Common labels for all resources
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      module      = "secrets"
    },
    var.labels
  )
}

# -----------------------------------------------------------------------------
# Enable Secret Manager API
# -----------------------------------------------------------------------------

resource "google_project_service" "secret_manager_api" {
  project            = var.project_id
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# Secret Manager Secrets
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(var.secret_ids)
  project   = var.project_id
  secret_id = each.value

  labels = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.secret_manager_api]
}

# -----------------------------------------------------------------------------
# Read Latest Secret Versions
#
# These data sources read the latest version of each secret. They will fail
# if a secret has no versions — ensure values are set before terraform apply.
# -----------------------------------------------------------------------------

data "google_secret_manager_secret_version" "secrets" {
  for_each = toset(var.secret_ids)
  project  = var.project_id
  secret   = each.value

  depends_on = [google_secret_manager_secret.secrets]
}
