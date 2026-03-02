# Cloud Monitoring Dashboard Module Outputs

output "dashboard_id" {
  description = "The ID of the monitoring dashboard"
  value       = google_monitoring_dashboard.go_api.id
}

output "notification_channel_id" {
  description = "The ID of the email notification channel"
  value       = google_monitoring_notification_channel.email.id
}

output "alert_policy_error_rate_5xx_id" {
  description = "The ID of the 5xx error rate alert policy"
  value       = google_monitoring_alert_policy.error_rate_5xx.id
}

output "alert_policy_latency_p95_id" {
  description = "The ID of the p95 latency alert policy"
  value       = google_monitoring_alert_policy.latency_p95.id
}

output "alert_policy_pod_crash_loop_id" {
  description = "The ID of the pod crash loop alert policy"
  value       = google_monitoring_alert_policy.pod_crash_loop.id
}

output "alert_policy_db_pool_exhaustion_id" {
  description = "The ID of the DB pool exhaustion alert policy"
  value       = google_monitoring_alert_policy.db_pool_exhaustion.id
}

output "alert_policy_executor_failure_rate_id" {
  description = "The ID of the executor failure rate alert policy"
  value       = google_monitoring_alert_policy.executor_failure_rate.id
}

output "alert_policy_zero_traffic_id" {
  description = "The ID of the zero traffic alert policy"
  value       = google_monitoring_alert_policy.zero_traffic.id
}

output "uptime_check_id" {
  description = "The ID of the HTTPS uptime check"
  value       = google_monitoring_uptime_check_config.healthz.id
}

output "alert_policy_uptime_failure_id" {
  description = "The ID of the uptime check failure alert policy"
  value       = google_monitoring_alert_policy.uptime_failure.id
}

