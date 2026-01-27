# Production Environment
#
# Instantiates reusable GCP modules with production-specific configuration.
# All values come from terraform.tfvars - no hardcoded environment values.

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true

  default_labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true

  default_labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Kubernetes provider configuration
# Configured after GKE module creates the cluster
provider "kubernetes" {
  host                   = "https://${module.gke.endpoint}"
  cluster_ca_certificate = base64decode(module.gke.ca_certificate)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "gke-gcloud-auth-plugin"
    env = {
      USE_GKE_GCLOUD_AUTH_PLUGIN = "True"
    }
  }
}

# -----------------------------------------------------------------------------
# Module Instantiation
# -----------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  gke_subnet_cidr             = var.gke_subnet_cidr
  gke_pods_cidr               = var.gke_pods_cidr
  gke_services_cidr           = var.gke_services_cidr
  cloudsql_subnet_cidr        = var.cloudsql_subnet_cidr
  private_service_access_cidr = var.private_service_access_cidr
  public_subnet_cidr          = var.public_subnet_cidr
}

module "nat" {
  source = "../../modules/nat"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region
  zone         = var.nat_zone

  network_id          = module.vpc.vpc_id
  public_subnet_id    = module.vpc.public_subnet_id
  private_subnet_cidr = var.gke_subnet_cidr
}

module "gke" {
  source = "../../modules/gke"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  network             = module.vpc.vpc_name
  subnetwork          = module.vpc.gke_subnet_name
  pods_range_name     = module.vpc.gke_pods_range_name
  services_range_name = module.vpc.gke_services_range_name

  release_channel            = var.gke_release_channel
  deletion_protection        = var.gke_deletion_protection
  master_ipv4_cidr_block     = var.gke_master_ipv4_cidr_block
  master_authorized_networks = var.gke_master_authorized_networks
}

module "cloudsql" {
  source = "../../modules/cloudsql"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  vpc_network_id      = module.vpc.vpc_id
  database_name       = var.database_name
  tier                = var.cloudsql_tier
  disk_size           = var.cloudsql_disk_size
  availability_type   = var.cloudsql_availability_type
  deletion_protection = var.cloudsql_deletion_protection

  # Wait for Private Service Access to be ready
  depends_on = [module.vpc]
}

module "identity_platform" {
  source = "../../modules/identity-platform"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  authorized_domains  = var.authorized_domains
  oauth_client_id     = var.oauth_client_id
  oauth_client_secret = var.oauth_client_secret
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region
}

module "workload_identity_federation" {
  source = "../../modules/workload-identity-federation"

  environment    = var.environment
  project_name   = var.project_name
  project_id     = var.project_id
  project_number = var.project_number
  region         = var.region

  github_owner = var.github_owner
  github_repo  = var.github_repo
}

module "monitoring" {
  source = "../../modules/monitoring"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region
}

module "redis" {
  source = "../../modules/redis"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  vpc_network_id = module.vpc.vpc_id

  depends_on = [module.vpc]
}

# -----------------------------------------------------------------------------
# Kubernetes Resources for Application Configuration
# -----------------------------------------------------------------------------
# These resources expose infrastructure outputs to applications running in GKE.
# Apps read environment variables from ConfigMaps and Secrets.

resource "kubernetes_config_map" "app_config" {
  metadata {
    name      = "app-config"
    namespace = "default"
  }

  data = {
    # GCP Configuration
    GCP_PROJECT_ID = var.project_id
    GCP_REGION     = var.region

    # Identity Platform Configuration
    IDENTITY_PLATFORM_API_KEY     = module.identity_platform.api_key
    IDENTITY_PLATFORM_AUTH_DOMAIN = module.identity_platform.auth_domain
    OAUTH_CLIENT_ID               = module.identity_platform.oauth_client_id

    # Database Configuration (non-secret)
    DATABASE_HOST = module.cloudsql.database_host
    DATABASE_PORT = tostring(module.cloudsql.database_port)
    DATABASE_NAME = module.cloudsql.database_name

    # Cloud SQL Connection Name (for Cloud SQL Proxy)
    CLOUDSQL_CONNECTION_NAME = module.cloudsql.instance_connection_name
  }

  depends_on = [module.gke]
}

resource "kubernetes_secret" "app_secrets" {
  metadata {
    name      = "app-secrets"
    namespace = "default"
  }

  data = {
    OAUTH_CLIENT_SECRET = module.identity_platform.oauth_client_secret
    DATABASE_USER       = module.cloudsql.database_user
    DATABASE_PASSWORD   = module.cloudsql.database_password
    DATABASE_URL        = module.cloudsql.connection_string_full
  }

  type = "Opaque"

  depends_on = [module.gke]
}

# -----------------------------------------------------------------------------
# Centrifugo Kubernetes Resources
# -----------------------------------------------------------------------------
# Deploys Centrifugo v5 for real-time WebSocket messaging.
# Uses Memorystore Redis as the broker/presence engine.

resource "kubernetes_config_map" "centrifugo_config" {
  metadata {
    name      = "centrifugo-config"
    namespace = "default"
  }

  data = {
    "config.json" = jsonencode({
      token_hmac_secret_key = "$${CENTRIFUGO_TOKEN_HMAC_SECRET_KEY}"
      api_key               = "$${CENTRIFUGO_API_KEY}"
      admin                 = false
      health                = true
      allowed_origins       = var.centrifugo_allowed_origins
      engine                = "redis"
      redis_address         = "${module.redis.host}:${module.redis.port}"
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

  depends_on = [module.gke]
}

resource "kubernetes_secret" "centrifugo_secrets" {
  metadata {
    name      = "centrifugo-secrets"
    namespace = "default"
  }

  data = {
    CENTRIFUGO_API_KEY              = var.centrifugo_api_key
    CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = var.centrifugo_token_secret
  }

  type = "Opaque"

  depends_on = [module.gke]
}

resource "kubernetes_deployment" "centrifugo" {
  metadata {
    name      = "centrifugo"
    namespace = "default"
    labels = {
      app = "centrifugo"
    }
  }

  spec {
    replicas = 2

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
          image = "centrifugo/centrifugo:v5"

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
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              memory = "256Mi"
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

  depends_on = [module.gke]
}

resource "kubernetes_service" "centrifugo" {
  metadata {
    name      = "centrifugo"
    namespace = "default"
    labels = {
      app = "centrifugo"
    }
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

  depends_on = [module.gke]
}
