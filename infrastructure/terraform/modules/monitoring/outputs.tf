# Cloud Monitoring Dashboard Module Outputs

output "dashboard_id" {
  description = "The ID of the monitoring dashboard"
  value       = google_monitoring_dashboard.go_api.id
}

