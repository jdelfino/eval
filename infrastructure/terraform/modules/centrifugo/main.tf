# Centrifugo Kubernetes Module
#
# Deploys Centrifugo v5 for real-time WebSocket messaging on Kubernetes.
# Uses Redis as the broker/presence engine.

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

resource "random_password" "api_key" {
  length  = 32
  special = false
}

resource "random_password" "token_secret" {
  length  = 32
  special = false
}

locals {
  api_key      = random_password.api_key.result
  token_secret = random_password.token_secret.result

  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
    module      = "centrifugo"
  }
}

# -----------------------------------------------------------------------------
# ConfigMap — Centrifugo configuration file
# -----------------------------------------------------------------------------

resource "kubernetes_config_map" "centrifugo_config" {
  metadata {
    name      = "centrifugo-config"
    namespace = var.namespace
  }

  data = {
    "config.json" = jsonencode({
      token_hmac_secret_key = "$${CENTRIFUGO_TOKEN_HMAC_SECRET_KEY}"
      api_key               = "$${CENTRIFUGO_API_KEY}"
      admin                 = false
      health                = true
      allowed_origins       = var.allowed_origins
      engine                = "redis"
      redis_address         = "${var.redis_host}:${var.redis_port}"
      client_channel_limit  = 128
      client_queue_max_size = 1048576
      namespaces = [
        {
          name         = "session"
          presence     = true
          join_leave   = true
          history_size = 10
          history_ttl  = "5m"
        }
      ]
    })
  }
}

# -----------------------------------------------------------------------------
# Secret — Centrifugo API key and token secret
# -----------------------------------------------------------------------------

resource "kubernetes_secret" "centrifugo_secrets" {
  metadata {
    name      = "centrifugo-secrets"
    namespace = var.namespace
  }

  data = {
    CENTRIFUGO_API_KEY               = local.api_key
    CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = local.token_secret
  }

  type = "Opaque"
}

# -----------------------------------------------------------------------------
# Deployment — Centrifugo server
# -----------------------------------------------------------------------------

resource "kubernetes_deployment" "centrifugo" {
  metadata {
    name      = "centrifugo"
    namespace = var.namespace
    labels = merge(local.labels, {
      app = "centrifugo"
    })
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "centrifugo"
      }
    }

    template {
      metadata {
        labels = {
          app = "centrifugo"
        }
      }

      spec {
        container {
          name  = "centrifugo"
          image = "centrifugo/centrifugo:${var.image_tag}"

          args = ["centrifugo", "-c", "/centrifugo/config.json"]

          port {
            container_port = 8000
            name           = "http"
          }

          env {
            name = "CENTRIFUGO_API_KEY"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.centrifugo_secrets.metadata[0].name
                key  = "CENTRIFUGO_API_KEY"
              }
            }
          }

          env {
            name = "CENTRIFUGO_TOKEN_HMAC_SECRET_KEY"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.centrifugo_secrets.metadata[0].name
                key  = "CENTRIFUGO_TOKEN_HMAC_SECRET_KEY"
              }
            }
          }

          volume_mount {
            name       = "centrifugo-config"
            mount_path = "/centrifugo"
            read_only  = true
          }

          resources {
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
            limits = {
              memory = var.memory_limit
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8000
            }
            initial_delay_seconds = 10
            period_seconds        = 15
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8000
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }
        }

        volume {
          name = "centrifugo-config"
          config_map {
            name = kubernetes_config_map.centrifugo_config.metadata[0].name
          }
        }
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Service — ClusterIP for internal access
# -----------------------------------------------------------------------------

resource "kubernetes_service" "centrifugo" {
  metadata {
    name      = "centrifugo"
    namespace = var.namespace
    labels = merge(local.labels, {
      app = "centrifugo"
    })
  }

  spec {
    type = "ClusterIP"

    selector = {
      app = "centrifugo"
    }

    port {
      port        = 8000
      target_port = 8000
      protocol    = "TCP"
      name        = "http"
    }
  }
}
