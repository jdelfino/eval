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

provider "helm" {
  kubernetes {
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

  # Apply NAT route only to instances tagged "private". The GKE module applies
  # this tag to all node pools. The NAT VM itself must NOT match, or it creates
  # a routing loop (it would try to route its own outbound traffic through itself).
  route_tags = ["private"]
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

  zone = var.gke_zone

  release_channel            = var.gke_release_channel
  deletion_protection        = var.gke_deletion_protection
  master_ipv4_cidr_block     = var.gke_master_ipv4_cidr_block
  master_authorized_networks = var.gke_master_authorized_networks

  default_pool_machine_type  = var.gke_default_pool_machine_type
  default_pool_min_nodes     = var.gke_default_pool_min_nodes
  default_pool_max_nodes     = var.gke_default_pool_max_nodes
  default_pool_spot          = var.gke_default_pool_spot
  default_pool_disk_size_gb  = var.gke_default_pool_disk_size_gb
  executor_pool_machine_type = var.gke_executor_pool_machine_type
  executor_pool_min_nodes    = var.gke_executor_pool_min_nodes
  executor_pool_max_nodes    = var.gke_executor_pool_max_nodes
  executor_pool_spot         = var.gke_executor_pool_spot
  executor_pool_disk_size_gb = var.gke_executor_pool_disk_size_gb
  node_network_tags          = ["private"]
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
  oauth_client_secret = module.secrets.secret_values["oauth-client-secret"]
}

module "secrets" {
  source = "../../modules/secrets"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  secret_ids = ["resend-api-key", "oauth-client-secret", "anthropic-api-key"]
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

module "dns_ssl" {
  source = "../../modules/dns-ssl"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  domain_name = var.domain_name
}

# -----------------------------------------------------------------------------
# KEDA (Kubernetes Event-Driven Autoscaling)
# -----------------------------------------------------------------------------
# Required for the executor ScaledObject CRD used in k8s/base/.

resource "helm_release" "keda" {
  name             = "keda"
  repository       = "https://kedacore.github.io/charts"
  chart            = "keda"
  version          = "2.16.1"
  namespace        = "keda"
  create_namespace = true

  depends_on = [module.gke]
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
    # Application Configuration
    ENVIRONMENT = "production"

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

    # Internal Service URLs
    CENTRIFUGO_URL = "http://centrifugo:8000"
    EXECUTOR_URL   = "http://executor:8081"

    # Redis Configuration (for distributed rate limiting)
    REDIS_HOST = "redis.default.svc.cluster.local"
    REDIS_PORT = "6379"

    # Invitation / Email Configuration
    INVITE_BASE_URL   = var.invite_base_url
    RESEND_FROM_EMAIL = var.resend_from_email
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
    RESEND_API_KEY      = module.secrets.secret_values["resend-api-key"]
    DATABASE_USER       = module.cloudsql.database_user
    DATABASE_PASSWORD   = module.cloudsql.database_password
    DATABASE_URL        = module.cloudsql.connection_string_full

    # Read-only user for production debugging
    READER_DATABASE_USER     = module.cloudsql.reader_user
    READER_DATABASE_PASSWORD = module.cloudsql.reader_password

    # Centrifugo Secrets (generated by centrifugo module)
    CENTRIFUGO_API_KEY      = module.centrifugo.api_key
    CENTRIFUGO_TOKEN_SECRET = module.centrifugo.token_secret

    # AI Provider Keys
    ANTHROPIC_API_KEY = module.secrets.secret_values["anthropic-api-key"]
  }

  type = "Opaque"

  depends_on = [module.gke]
}

# Stable password for the persistent smoke-test Identity Platform user.
# Generated once by Terraform; the deploy smoke test reads it via kubectl.
resource "random_password" "smoke_test" {
  length  = 24
  special = true
}

resource "kubernetes_secret" "smoke_test_secrets" {
  metadata {
    name      = "smoke-test-secrets"
    namespace = "default"
  }

  data = {
    SMOKE_TEST_PASSWORD = random_password.smoke_test.result
  }

  type = "Opaque"

  depends_on = [module.gke]
}

resource "kubernetes_config_map" "frontend_config" {
  metadata {
    name      = "frontend-config"
    namespace = "default"
  }

  data = {
    NEXT_PUBLIC_API_URL              = "/api/v1"
    API_INTERNAL_URL                 = "http://go-api/api/v1" # SSR: server components fetch from internal service
    NEXT_PUBLIC_FIREBASE_API_KEY     = module.identity_platform.api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = module.identity_platform.auth_domain
    NEXT_PUBLIC_FIREBASE_PROJECT_ID  = var.project_id
    NEXT_PUBLIC_CENTRIFUGO_URL       = var.frontend_centrifugo_url
  }

  depends_on = [module.gke]
}

module "centrifugo" {
  source = "../../modules/centrifugo"

  environment  = var.environment
  project_name = var.project_name
  project_id   = var.project_id
  region       = var.region

  allowed_origins = var.centrifugo_allowed_origins
  redis_host      = "redis.default.svc.cluster.local" # Matches k8s/base/redis-service.yaml in default namespace
  redis_port      = 6379

  depends_on = [module.gke]
}
