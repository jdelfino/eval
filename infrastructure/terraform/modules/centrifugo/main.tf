# Centrifugo Kubernetes Module
#
# Manages Centrifugo configuration and secrets on Kubernetes.
# Deployment, Service, and BackendConfig are managed by kustomize (k8s/base/).
# Uses Redis as the broker/presence engine.

# -----------------------------------------------------------------------------
# Generated Secrets
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

