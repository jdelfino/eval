# GCP Cloud SQL Module Outputs
#
# Outputs for integration with other modules and applications.
# Sensitive values are marked appropriately.

# -----------------------------------------------------------------------------
# Instance Outputs
# -----------------------------------------------------------------------------

output "instance_name" {
  description = "The name of the Cloud SQL instance"
  value       = google_sql_database_instance.main.name
}

output "instance_self_link" {
  description = "The self-link of the Cloud SQL instance"
  value       = google_sql_database_instance.main.self_link
}

output "instance_connection_name" {
  description = "The connection name for Cloud SQL Proxy (project:region:instance)"
  value       = google_sql_database_instance.main.connection_name
}

output "instance_service_account_email" {
  description = "The service account email address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.service_account_email_address
}

# -----------------------------------------------------------------------------
# Connection Outputs
# -----------------------------------------------------------------------------

output "private_ip_address" {
  description = "The private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "public_ip_address" {
  description = "The public IP address of the Cloud SQL instance (if enabled)"
  value       = google_sql_database_instance.main.public_ip_address
}

output "database_host" {
  description = "The database host (private IP if enabled, otherwise public)"
  value       = var.private_network_enabled ? google_sql_database_instance.main.private_ip_address : google_sql_database_instance.main.public_ip_address
}

output "database_port" {
  description = "The database port (PostgreSQL default)"
  value       = 5432
}

# -----------------------------------------------------------------------------
# Database Outputs
# -----------------------------------------------------------------------------

output "database_name" {
  description = "The name of the created database"
  value       = google_sql_database.main.name
}

output "database_self_link" {
  description = "The self-link of the created database"
  value       = google_sql_database.main.self_link
}

# -----------------------------------------------------------------------------
# User Outputs
# -----------------------------------------------------------------------------

output "database_user" {
  description = "The name of the database user"
  value       = google_sql_user.main.name
}

output "database_password" {
  description = "The password for the database user"
  value       = random_password.database_password.result
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Connection String Outputs
# -----------------------------------------------------------------------------

output "connection_string" {
  description = "PostgreSQL connection string (without password)"
  value       = "postgresql://${urlencode(google_sql_user.main.name)}@${var.private_network_enabled ? google_sql_database_instance.main.private_ip_address : google_sql_database_instance.main.public_ip_address}:5432/${google_sql_database.main.name}"
}

output "connection_string_full" {
  description = "Full PostgreSQL connection string (with password, URL-encoded)"
  value       = "postgresql://${urlencode(google_sql_user.main.name)}:${urlencode(random_password.database_password.result)}@${var.private_network_enabled ? google_sql_database_instance.main.private_ip_address : google_sql_database_instance.main.public_ip_address}:5432/${google_sql_database.main.name}"
  sensitive   = true
}

# -----------------------------------------------------------------------------
# SSL Certificate Outputs
# -----------------------------------------------------------------------------

output "server_ca_cert" {
  description = "The server CA certificate for SSL connections"
  value       = google_sql_database_instance.main.server_ca_cert[0].cert
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Convenience Outputs
# -----------------------------------------------------------------------------

output "region" {
  description = "The region where the Cloud SQL instance is located"
  value       = var.region
}

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}

output "database_version" {
  description = "The PostgreSQL version"
  value       = google_sql_database_instance.main.database_version
}
