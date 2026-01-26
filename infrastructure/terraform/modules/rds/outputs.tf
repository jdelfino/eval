# RDS Module Outputs

output "endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = "" # Placeholder
}

output "username" {
  description = "Master username for the database"
  value       = "" # Placeholder
}

output "password" {
  description = "Master password for the database"
  value       = "" # Placeholder
  sensitive   = true
}

output "database_name" {
  description = "Name of the database"
  value       = "" # Placeholder
}

output "security_group_id" {
  description = "Security group ID for the RDS instance"
  value       = "" # Placeholder
}
