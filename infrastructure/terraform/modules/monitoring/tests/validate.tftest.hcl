# Validation tests for the monitoring module
#
# These tests verify the module's configuration is valid and that
# resources are properly defined. Run with: terraform test

variables {
  environment  = "test"
  project_name = "testproject"
  project_id   = "testproject-test"
  region       = "us-central1"
  alert_email  = "alerts@example.com"
  domain_name  = "example.com"
}

run "validates_uptime_check_configured" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz.display_name == "testproject-test /healthz"
    error_message = "Expected uptime check display name to match project and environment"
  }
}

run "validates_uptime_check_path" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz.http_check[0].path == "/healthz"
    error_message = "Expected uptime check path to be /healthz"
  }
}

run "validates_uptime_check_https" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz.http_check[0].use_ssl == true
    error_message = "Expected uptime check to use SSL (HTTPS)"
  }
}

run "validates_uptime_check_period" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz.period == "300s"
    error_message = "Expected uptime check interval to be 300s (5 minutes)"
  }
}

run "validates_uptime_check_timeout" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz.timeout == "10s"
    error_message = "Expected uptime check timeout to be 10s"
  }
}

run "validates_uptime_alert_policy_configured" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.uptime_failure.display_name == "testproject-test Uptime Check Failure"
    error_message = "Expected uptime alert policy display name to match project and environment"
  }
}

run "validates_uptime_alert_auto_close" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.uptime_failure.alert_strategy[0].auto_close == "1800s"
    error_message = "Expected uptime alert policy to auto-close after 1800s"
  }
}
