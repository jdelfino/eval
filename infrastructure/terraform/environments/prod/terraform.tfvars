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

# OAuth client ID is public (appears in frontend config).
# Created manually in GCP Console > APIs & Services > Credentials.
oauth_client_id = "580381260766-g0a0lism1p3kt6an595di291cebmv5fl.apps.googleusercontent.com"

# OAuth client secret and Resend API key are in GCP Secret Manager.
# See module "secrets" in main.tf for the list of managed secrets.

invite_base_url = "https://eval.delquillan.com"

# -----------------------------------------------------------------------------
# Workload Identity Federation Configuration
# -----------------------------------------------------------------------------

project_number = "580381260766"
github_owner   = "jdelfino"
github_repo    = "eval"

# -----------------------------------------------------------------------------
# Centrifugo Configuration
# -----------------------------------------------------------------------------

centrifugo_allowed_origins = ["https://eval.delquillan.com"]

# -----------------------------------------------------------------------------
# Frontend Configuration
# -----------------------------------------------------------------------------

frontend_centrifugo_url = "wss://eval.delquillan.com/connection/websocket"

# -----------------------------------------------------------------------------
# DNS / SSL Configuration
# -----------------------------------------------------------------------------

domain_name = "eval.delquillan.com"
