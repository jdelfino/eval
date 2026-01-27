# Cloud Monitoring Dashboard Module
#
# Creates a Cloud Monitoring dashboard displaying key go-api metrics
# collected by Google Managed Prometheus (GMP). Uses PromQL queries
# against GMP data for request rate, latency, error rate, and DB pool health.

locals {
  display_name = var.dashboard_display_name != "" ? var.dashboard_display_name : "${var.project_name}-${var.environment} Go API"
}

resource "google_monitoring_dashboard" "go_api" {
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
                    prometheusQuery = "sum by (status_code) (rate(http_requests_total[5m]))"
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
                    prometheusQuery = "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))"
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
                    prometheusQuery = "db_pool_acquired_connections / db_pool_max_connections"
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
                    prometheusQuery = "db_pool_acquired_connections"
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
