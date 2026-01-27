# GCP Artifact Registry Module
#
# Creates a Docker repository in Artifact Registry for storing container images.
# Used by CI/CD pipelines to push images and by GKE to pull them.

resource "google_artifact_registry_repository" "this" {
  location      = var.region
  repository_id = var.repository_id
  description   = var.description
  format        = var.format

  docker_config {
    immutable_tags = var.immutable_tags
  }

  cleanup_policy_dry_run = var.cleanup_policy_dry_run

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}
