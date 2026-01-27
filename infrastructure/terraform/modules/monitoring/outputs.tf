# Cloud Monitoring Dashboard Module Outputs

output "dashboard_id" {
  description = "The ID of the monitoring dashboard"
  value       = google_monitoring_dashboard.go_api.id
}

output "dashboard_name" {
  description = "The resource name of the monitoring dashboard"
  value       = google_monitoring_dashboard.go_api.name
}
