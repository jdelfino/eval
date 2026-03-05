# Workload Identity Federation Module
#
# Enables GitHub Actions to authenticate with GCP using OIDC tokens
# instead of long-lived service account keys.
#
# Resources created:
# - Workload Identity Pool
# - Workload Identity Provider (GitHub OIDC)
# - Service Account for GitHub Actions
# - IAM bindings for the service account

# -----------------------------------------------------------------------------
# Workload Identity Pool
# -----------------------------------------------------------------------------

resource "google_iam_workload_identity_pool" "github_actions" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Identity pool for GitHub Actions CI/CD"
}

# -----------------------------------------------------------------------------
# Workload Identity Provider (GitHub OIDC)
# -----------------------------------------------------------------------------

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"
  description                        = "GitHub Actions OIDC provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.github_owner}/${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# -----------------------------------------------------------------------------
# Service Account
# -----------------------------------------------------------------------------

resource "google_service_account" "github_actions" {
  account_id   = "github-actions-deploy"
  display_name = "GitHub Actions Deploy"
  description  = "Service account for GitHub Actions CI/CD"
}

# -----------------------------------------------------------------------------
# Service Account IAM Roles
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "github_actions_roles" {
  for_each = toset(var.service_account_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# -----------------------------------------------------------------------------
# Firebase Auth Admin: E2E Test User Management
# -----------------------------------------------------------------------------
# E2E tests create Identity Platform users and set emailVerified=true in the
# staging tenant. The identitytoolkit.admin role is required because tenant-
# scoped admin operations (accounts:update on /projects/{id}/tenants/{id}/...)
# need identitytoolkit.tenants.* permissions for tenant resolution.
# roles/firebaseauth.admin does NOT include these — it lacks tenant permissions.
#
# The serviceUsageConsumer role is also required because WIF-issued tokens
# (unlike in-cluster Workload Identity) need the x-goog-user-project header
# for quota attribution, which requires serviceusage.services.use.

resource "google_project_iam_member" "github_actions_smoke_test" {
  project = var.project_id
  role    = "roles/identitytoolkit.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# -----------------------------------------------------------------------------
# Workload Identity User Binding
# -----------------------------------------------------------------------------

# Allow GitHub Actions from this repo to impersonate the service account
resource "google_service_account_iam_member" "workload_identity_user" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions.name}/attribute.repository/${var.github_owner}/${var.github_repo}"
}
