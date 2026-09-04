# Validation tests for the monitoring module
#
# These tests verify the module's configuration is valid and that
# resources are properly defined. Run with: terraform test

variables {
  environment            = "test"
  project_name           = "testproject"
  project_id             = "testproject-test"
  region                 = "us-central1"
  alert_email            = "alerts@example.com"
  domain_name            = "example.com"
  dashboard_display_name = ""
}

run "validates_uptime_check_configured" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz[0].display_name == "testproject-test /healthz"
    error_message = "Expected uptime check display name to match project and environment"
  }
}

run "validates_uptime_check_path" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz[0].http_check[0].path == "/healthz"
    error_message = "Expected uptime check path to be /healthz"
  }
}

run "validates_uptime_check_https" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz[0].http_check[0].use_ssl == true
    error_message = "Expected uptime check to use SSL (HTTPS)"
  }
}

run "validates_uptime_check_period" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz[0].period == "300s"
    error_message = "Expected uptime check interval to be 300s (5 minutes)"
  }
}

run "validates_uptime_check_timeout" {
  command = plan

  assert {
    condition     = google_monitoring_uptime_check_config.healthz[0].timeout == "10s"
    error_message = "Expected uptime check timeout to be 10s"
  }
}

run "validates_uptime_alert_policy_configured" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.uptime_failure[0].display_name == "testproject-test Uptime Check Failure"
    error_message = "Expected uptime alert policy display name to match project and environment"
  }
}

run "validates_uptime_alert_auto_close" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.uptime_failure[0].alert_strategy[0].auto_close == "1800s"
    error_message = "Expected uptime alert policy to auto-close after 1800s"
  }
}

run "validates_dashboard_json_is_valid" {
  command = plan

  assert {
    condition     = can(jsondecode(google_monitoring_dashboard.go_api.dashboard_json))
    error_message = "Dashboard JSON must be valid JSON"
  }
}

run "validates_dashboard_has_executor_execution_rate_tile" {
  command = plan

  assert {
    condition = anytrue([
      for tile in jsondecode(google_monitoring_dashboard.go_api.dashboard_json).mosaicLayout.tiles :
      can(tile.widget.xyChart.dataSets[0].timeSeriesQuery.prometheusQuery) &&
      strcontains(tile.widget.xyChart.dataSets[0].timeSeriesQuery.prometheusQuery, "executor_executions_total")
    ])
    error_message = "Dashboard must contain an executor execution rate tile using executor_executions_total metric"
  }
}

run "validates_dashboard_has_frontend_error_rate_tile" {
  command = plan

  assert {
    condition     = strcontains(google_monitoring_dashboard.go_api.dashboard_json, "frontend-client-errors")
    error_message = "Dashboard must contain a frontend error rate tile referencing the frontend-client-errors log-based metric"
  }
}

run "validates_dashboard_has_uptime_check_latency_tile" {
  command = plan

  assert {
    condition = anytrue([
      for tile in jsondecode(google_monitoring_dashboard.go_api.dashboard_json).mosaicLayout.tiles :
      can(tile.widget.xyChart.dataSets[0].timeSeriesQuery.timeSeriesFilter.filter) &&
      strcontains(tile.widget.xyChart.dataSets[0].timeSeriesQuery.timeSeriesFilter.filter, "uptime_check")
    ])
    error_message = "Dashboard must contain an uptime check latency tile referencing uptime_check metric"
  }
}

run "validates_dashboard_tile_count" {
  command = plan

  assert {
    condition     = length(jsondecode(google_monitoring_dashboard.go_api.dashboard_json).mosaicLayout.tiles) >= 10
    error_message = "Dashboard must have at least 10 tiles (original 7 + 3 new tiles)"
  }
}

run "validates_frontend_error_alert_policy_configured" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.frontend_client_error_rate[0].display_name == "testproject-test High Frontend Client Error Rate"
    error_message = "Expected frontend client error rate alert policy display name to match project and environment"
  }
}

run "validates_frontend_error_alert_auto_close" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.frontend_client_error_rate[0].alert_strategy[0].auto_close == "1800s"
    error_message = "Expected frontend client error rate alert policy to auto-close after 1800s"
  }
}

run "validates_frontend_error_alert_uses_log_metric" {
  command = plan

  assert {
    condition = anytrue([
      for cond in google_monitoring_alert_policy.frontend_client_error_rate[0].conditions :
      can(cond.condition_threshold) && strcontains(cond.condition_threshold[0].filter, "frontend-client-errors")
    ])
    error_message = "Frontend client error alert must use the frontend-client-errors log-based metric in its condition filter"
  }
}

run "validates_frontend_error_log_metric_filter_has_severity" {
  command = plan

  assert {
    condition     = strcontains(google_logging_metric.frontend_client_errors.filter, "severity>=ERROR")
    error_message = "Frontend client errors log metric filter must include severity>=ERROR to count only error-level entries"
  }
}

# -----------------------------------------------------------------------------
# Hibernation
# -----------------------------------------------------------------------------
# Verifies that hibernate = true silences alerting entirely — including the
# uptime check and its failure alert, and the zero-traffic alert — so the
# inbox isn't filled with "zero traffic" / "uptime check failed" emails for
# the entire hibernation, both of which fire by design when the site goes
# dark.

run "hibernate_silences_alerting" {
  command = plan

  variables {
    hibernate = true
  }

  assert {
    condition     = length(google_monitoring_uptime_check_config.healthz) == 0
    error_message = "Expected the uptime check to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.zero_traffic) == 0
    error_message = "Expected the zero-traffic alert policy to be absent when hibernating — it fires by design when the site goes dark"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.uptime_failure) == 0
    error_message = "Expected the uptime-failure alert policy to be absent when hibernating — it fires by design when the site goes dark"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.error_rate_5xx) == 0
    error_message = "Expected the 5xx error rate alert policy to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.latency_p95) == 0
    error_message = "Expected the p95 latency alert policy to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.pod_crash_loop) == 0
    error_message = "Expected the pod crash loop alert policy to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.db_pool_exhaustion) == 0
    error_message = "Expected the DB pool exhaustion alert policy to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.executor_failure_rate) == 0
    error_message = "Expected the executor failure rate alert policy to be absent when hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.frontend_client_error_rate) == 0
    error_message = "Expected the frontend client error rate alert policy to be absent when hibernating"
  }
}

run "normal_mode_keeps_alerting" {
  command = plan

  variables {
    hibernate = false
  }

  assert {
    condition     = length(google_monitoring_uptime_check_config.healthz) == 1
    error_message = "Expected the uptime check to be present when not hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.zero_traffic) == 1
    error_message = "Expected the zero-traffic alert policy to be present when not hibernating"
  }

  assert {
    condition     = length(google_monitoring_alert_policy.uptime_failure) == 1
    error_message = "Expected the uptime-failure alert policy to be present when not hibernating"
  }
}
