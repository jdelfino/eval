# Workload Identity Federation Module Outputs
#
# These values are needed to configure GitHub Actions secrets.

output "workload_identity_provider" {
  description = "Full identifier of the Workload Identity Provider for GitHub Actions auth"
  value       = "projects/${var.project_number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github_actions.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}

output "service_account_email" {
  description = "Email of the GitHub Actions service account"
  value       = google_service_account.github_actions.email
}

output "workload_identity_pool_id" {
  description = "ID of the Workload Identity Pool"
  value       = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
}

output "github_secrets_setup" {
  description = "Instructions for configuring GitHub Actions secrets"
  value       = <<-EOT
    Configure these GitHub Actions secrets:

    WIF_PROVIDER: ${google_iam_workload_identity_pool_provider.github.name}
    WIF_SERVICE_ACCOUNT: ${google_service_account.github_actions.email}
    GKE_CLUSTER: (your GKE cluster name)
    GKE_LOCATION: ${var.region}

    Run:
      gh secret set WIF_PROVIDER --body "projects/${var.project_number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github_actions.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
      gh secret set WIF_SERVICE_ACCOUNT --body "${google_service_account.github_actions.email}"
  EOT
}
