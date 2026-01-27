# Artifact Registry Module Outputs
#
# Expose key values for reference by other modules and CI/CD pipelines.

output "repository_id" {
  description = "The repository ID"
  value       = google_artifact_registry_repository.this.repository_id
}

output "repository_name" {
  description = "The full resource name of the repository"
  value       = google_artifact_registry_repository.this.name
}

output "repository_url" {
  description = "Artifact Registry repository URL for Docker operations"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}"
}
