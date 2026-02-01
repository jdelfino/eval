# Production Environment Configuration
#
# All environment-specific values are defined here.
# These values instantiate the same modules used in staging with production config.

# -----------------------------------------------------------------------------
# Common Configuration
# -----------------------------------------------------------------------------

environment  = "prod"
project_name = "eval"
project_id   = "eval-prod-485520"
region       = "us-east1"

# -----------------------------------------------------------------------------
# VPC Configuration
# Production uses a separate CIDR range from staging for isolation.
# -----------------------------------------------------------------------------

# GKE node subnet
gke_subnet_cidr = "10.1.0.0/20"

# Secondary ranges for GKE pods and services
gke_pods_cidr     = "10.4.0.0/14"
gke_services_cidr = "10.8.0.0/20"

# Cloud SQL subnet
cloudsql_subnet_cidr = "10.1.16.0/24"

# Private Service Access CIDR for Cloud SQL VPC peering
private_service_access_cidr = "10.100.0.0/16"

# Public subnet for NAT gateway
public_subnet_cidr = "10.1.32.0/24"

# -----------------------------------------------------------------------------
# NAT Configuration
# -----------------------------------------------------------------------------

nat_zone = "us-east1-b"

# -----------------------------------------------------------------------------
# GKE Configuration
# -----------------------------------------------------------------------------

gke_zone                   = "us-east1-b"
gke_release_channel        = "REGULAR"
gke_deletion_protection    = true
gke_master_ipv4_cidr_block = "172.16.0.0/28"

gke_master_authorized_networks = [
  {
    cidr_block   = "108.26.187.103/32"
    display_name = "devcontainer"
  }
]

# -----------------------------------------------------------------------------
# Cloud SQL Configuration
# Start small, scale up when needed.
# -----------------------------------------------------------------------------

database_name                = "eval"
cloudsql_tier                = "db-g1-small"
cloudsql_disk_size           = 20
cloudsql_availability_type   = "ZONAL" # Use REGIONAL for HA when needed
cloudsql_deletion_protection = true

# -----------------------------------------------------------------------------
# Identity Platform Configuration
# -----------------------------------------------------------------------------

authorized_domains = [
  "eval.delquillan.com",
  "localhost"
]

# OAuth credentials are created in GCP Console > APIs & Services > Credentials
# Provide via environment variables (don't commit secrets):
#   export TF_VAR_oauth_client_id="xxx.apps.googleusercontent.com"
#   export TF_VAR_oauth_client_secret="xxx"
# Or via: terraform apply -var-file="secrets.tfvars" (gitignored)

# -----------------------------------------------------------------------------
# Workload Identity Federation Configuration
# -----------------------------------------------------------------------------

project_number = "580381260766"
github_owner   = "jdelfino"
github_repo    = "eval"

# -----------------------------------------------------------------------------
# Redis Configuration
# -----------------------------------------------------------------------------

redis_tier           = "BASIC"
redis_memory_size_gb = 1

# -----------------------------------------------------------------------------
# Centrifugo Configuration
# -----------------------------------------------------------------------------

centrifugo_allowed_origins = ["https://eval.delquillan.com"]

# Centrifugo secrets - provide via environment variables (don't commit secrets):
#   export TF_VAR_centrifugo_api_key="your-api-key"
#   export TF_VAR_centrifugo_token_secret="your-token-secret"
# Or via: terraform apply -var-file="secrets.tfvars" (gitignored)
