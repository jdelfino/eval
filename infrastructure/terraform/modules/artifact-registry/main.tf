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

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      package_name_prefixes = [""]
      keep_count            = var.cleanup_keep_count
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = var.cleanup_untagged_max_age
    }
  }

  cleanup_policies {
    id     = "delete-old-tagged"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = var.cleanup_tagged_max_age
    }
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}
