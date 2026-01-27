# Cloud Build Module
#
# Enables Cloud Build API and grants the Compute Engine default service account
# (used by Cloud Build) permissions to deploy to GKE.

locals {
  # Cloud Build uses the Compute Engine default SA in newer projects
  cloudbuild_sa = "${var.project_number}-compute@developer.gserviceaccount.com"
}

# Enable Cloud Build API
resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# Grant Cloud Build service account permission to deploy to GKE
resource "google_project_iam_member" "cloudbuild_gke" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${local.cloudbuild_sa}"

  depends_on = [google_project_service.cloudbuild]
}

# Grant Cloud Build service account permission to pull images from Artifact Registry
resource "google_project_iam_member" "cloudbuild_artifact_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${local.cloudbuild_sa}"

  depends_on = [google_project_service.cloudbuild]
}

# Allow CI service account to act as the Cloud Build service account when submitting builds
resource "google_service_account_iam_member" "ci_acts_as_cloudbuild" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${local.cloudbuild_sa}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.ci_service_account_email}"

  depends_on = [google_project_service.cloudbuild]
}
