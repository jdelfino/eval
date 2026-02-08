# Centrifugo Kubernetes Module Outputs
#
# Outputs for integration with other modules and applications.
# Deployment, Service, and BackendConfig are managed by kustomize (k8s/base/).

output "api_key" {
  description = "Generated API key for Centrifugo server API authentication"
  value       = local.api_key
  sensitive   = true
}

output "token_secret" {
  description = "Generated HMAC secret for Centrifugo JWT token verification"
  value       = local.token_secret
  sensitive   = true
}
