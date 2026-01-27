# Cloud Build Module
#
# Enables Cloud Build API and grants the default Cloud Build service account
# permissions to deploy to GKE.

# Enable Cloud Build API
resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# Grant Cloud Build service account permission to deploy to GKE
resource "google_project_iam_member" "cloudbuild_gke" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${var.project_number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.cloudbuild]
}

# Grant Cloud Build service account permission to pull images from Artifact Registry
resource "google_project_iam_member" "cloudbuild_artifact_registry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${var.project_number}@cloudbuild.gserviceaccount.com"

  depends_on = [google_project_service.cloudbuild]
}
