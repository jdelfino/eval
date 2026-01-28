# GCP Memorystore Redis Module Outputs
#
# Outputs for integration with other modules and applications.

# -----------------------------------------------------------------------------
# Connection Outputs
# -----------------------------------------------------------------------------

output "host" {
  description = "The IP address of the Redis instance"
  value       = google_redis_instance.main.host
}

output "port" {
  description = "The port number of the Redis instance"
  value       = google_redis_instance.main.port
}

output "connection_string" {
  description = "Redis connection string (redis://host:port)"
  value       = "redis://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}

# -----------------------------------------------------------------------------
# Instance Outputs
# -----------------------------------------------------------------------------

output "instance_name" {
  description = "The name of the Redis instance"
  value       = google_redis_instance.main.name
}

output "current_location_id" {
  description = "The current zone where the Redis endpoint is placed"
  value       = google_redis_instance.main.current_location_id
}

# -----------------------------------------------------------------------------
# Convenience Outputs
# -----------------------------------------------------------------------------

output "region" {
  description = "The region where the Redis instance is located"
  value       = var.region
}

output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}
