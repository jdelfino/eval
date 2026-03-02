# Cloud Monitoring Dashboard Module
#
# Creates a Cloud Monitoring dashboard displaying key go-api metrics
# collected by Google Managed Prometheus (GMP). Uses PromQL queries
# against GMP data for request rate, latency, error rate, and DB pool health.

locals {
  display_name = var.dashboard_display_name != "" ? var.dashboard_display_name : "${var.project_name}-${var.environment} Go API"
}

# -----------------------------------------------------------------------------
# Notification Channel
# -----------------------------------------------------------------------------

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# -----------------------------------------------------------------------------
# Alert Policies
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "error_rate_5xx" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} High 5xx Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx error rate > 5%"

    condition_prometheus_query_language {
      query               = "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) > 0.05"
      duration            = "300s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "latency_p95" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} High p95 Latency"
  combiner     = "OR"

  conditions {
    display_name = "p95 latency > 2s"

    condition_prometheus_query_language {
      query               = "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 2.0"
      duration            = "300s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "pod_crash_loop" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} Pod Crash Loop"
  combiner     = "OR"

  conditions {
    display_name = "Pod restart rate > 0"

    condition_monitoring_query_language {
      query    = "fetch k8s_container | metric 'kubernetes.io/container/restart_count' | align rate(1m) | every 1m | condition val() > 0"
      duration = "300s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "db_pool_exhaustion" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} DB Pool Exhaustion"
  combiner     = "OR"

  conditions {
    display_name = "DB pool utilization > 85%"

    condition_prometheus_query_language {
      query               = "db_pool_connections{state=\"acquired\"} / db_pool_max_connections > 0.85"
      duration            = "300s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "executor_failure_rate" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} High Executor Failure Rate"
  combiner     = "OR"

  conditions {
    display_name = "Executor error rate > 10%"

    condition_prometheus_query_language {
      query               = "sum(rate(executor_executions_total{status=\"error\"}[5m])) / sum(rate(executor_executions_total[5m])) > 0.10"
      duration            = "300s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "zero_traffic" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} Zero Traffic"
  combiner     = "OR"

  conditions {
    display_name = "No HTTP traffic for 10 minutes"

    condition_prometheus_query_language {
      query               = "sum(rate(http_requests_total[10m])) == 0"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

# -----------------------------------------------------------------------------
# Uptime Checks
# -----------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "healthz" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} /healthz"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path    = "/healthz"
    port    = 443
    use_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain_name
    }
  }
}

resource "google_monitoring_alert_policy" "uptime_failure" {
  project      = var.project_id
  display_name = "${var.project_name}-${var.environment} Uptime Check Failure"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing from 2+ regions for 5+ minutes"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.healthz.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_TRUE"
        group_by_fields      = ["resource.labels.host"]
      }

      trigger {
        count = 2
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
  }
}

# -----------------------------------------------------------------------------
# Log-based Metrics
# -----------------------------------------------------------------------------

# Log-based metric: HTTP 5xx errors from the go-api container.
# Used for alerting on server error rates in Cloud Monitoring.
resource "google_logging_metric" "api_5xx_errors" {
  project = var.project_id
  name    = "${var.project_name}-${var.environment}-api-5xx-errors"

  filter = <<-EOT
    resource.type="k8s_container"
    AND resource.labels.container_name="go-api"
    AND jsonPayload.status >= 500
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "API 5xx Errors"
  }
}

# Log-based metric: ERROR and above log entries from go-api and executor containers.
# Provides a unified error count across the backend services for dashboards and alerts.
resource "google_logging_metric" "error_log_entries" {
  project = var.project_id
  name    = "${var.project_name}-${var.environment}-error-log-entries"

  filter = <<-EOT
    resource.type="k8s_container"
    AND (resource.labels.container_name="go-api" OR resource.labels.container_name="executor")
    AND severity >= ERROR
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Error Log Entries"
  }
}

# Log-based metric: client-side errors reported by the frontend through the go-api.
# The frontend posts errors to the API which logs them with source="frontend".
resource "google_logging_metric" "frontend_client_errors" {
  project = var.project_id
  name    = "${var.project_name}-${var.environment}-frontend-client-errors"

  filter = <<-EOT
    resource.type="k8s_container"
    AND resource.labels.container_name="go-api"
    AND jsonPayload.source="frontend"
  EOT

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
    display_name = "Frontend Client Errors"
  }
}

resource "google_monitoring_dashboard" "go_api" {
  project = var.project_id

  # The GCP API normalizes dashboard JSON (reorders keys, adds defaults),
  # causing perpetual diff on every plan. Ignore after initial creation.
  lifecycle {
    ignore_changes = [dashboard_json]
  }

  dashboard_json = jsonencode({
    displayName = local.display_name
    mosaicLayout = {
      columns = 12
      tiles = [
        # -----------------------------------------------------------------
        # Row 1: Request Rate & Error Rate
        # -----------------------------------------------------------------
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Request Rate by Status Code"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "sum by (status) (rate(http_requests_total[5m]))"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "req/s"
              }
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "Error Rate (5xx / total)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "ratio"
              }
            }
          }
        },

        # -----------------------------------------------------------------
        # Row 2: Latency Percentiles
        # -----------------------------------------------------------------
        {
          xPos   = 0
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "p50 Latency"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "seconds"
              }
            }
          }
        },
        {
          xPos   = 4
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "p95 Latency"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "seconds"
              }
            }
          }
        },
        {
          xPos   = 8
          yPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "p99 Latency"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "seconds"
              }
            }
          }
        },

        # -----------------------------------------------------------------
        # Row 3: DB Pool Health
        # -----------------------------------------------------------------
        {
          xPos   = 0
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "DB Pool Utilization (acquired / max)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "db_pool_connections{state=\"acquired\"} / db_pool_max_connections"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "ratio"
              }
            }
          }
        },
        {
          xPos   = 4
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "DB Pool Acquired Connections"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "db_pool_connections{state=\"acquired\"}"
                  }
                  plotType = "LINE"
                },
                {
                  timeSeriesQuery = {
                    prometheusQuery = "db_pool_max_connections"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "connections"
              }
            }
          }
        },
        {
          xPos   = 8
          yPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "DB Pool Acquire / Cancel Rate"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    prometheusQuery = "rate(db_pool_acquire_count_total[5m])"
                  }
                  plotType = "LINE"
                },
                {
                  timeSeriesQuery = {
                    prometheusQuery = "rate(db_pool_canceled_acquire_count_total[5m])"
                  }
                  plotType = "LINE"
                }
              ]
              timeshiftDuration = "0s"
              yAxis = {
                scale = "LINEAR"
                label = "ops/s"
              }
            }
          }
        }
      ]
    }
  })
}
