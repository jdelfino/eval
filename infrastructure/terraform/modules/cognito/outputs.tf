# Cognito Module Outputs

output "user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = "" # Placeholder
}

output "user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = "" # Placeholder
}

output "client_id" {
  description = "ID of the Cognito App Client"
  value       = "" # Placeholder
}

output "client_secret" {
  description = "Secret of the Cognito App Client"
  value       = "" # Placeholder
  sensitive   = true
}

output "domain_url" {
  description = "Cognito hosted UI domain URL"
  value       = "" # Placeholder
}
