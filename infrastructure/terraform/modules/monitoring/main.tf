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
