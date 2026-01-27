# Cloud Build Module Outputs

output "service_account" {
  description = "Cloud Build default service account"
  value       = "${var.project_number}@cloudbuild.gserviceaccount.com"
}
