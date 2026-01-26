# GCP VPC Module
#
# Creates a VPC network with subnets for GKE and Cloud SQL,
# including Private Service Access for Cloud SQL and Cloud NAT for outbound traffic.

locals {
  vpc_name = coalesce(var.vpc_name, "${var.project_name}-${var.environment}-vpc")
}

# -----------------------------------------------------------------------------
# VPC Network
# -----------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                            = local.vpc_name
  project                         = var.project_id
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false
}

# -----------------------------------------------------------------------------
# Subnets
# -----------------------------------------------------------------------------

# GKE nodes subnet with secondary ranges for pods and services
resource "google_compute_subnetwork" "gke" {
  name                     = "${local.vpc_name}-gke"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.gke_subnet_cidr
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.gke_pods_cidr
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.gke_services_cidr
  }

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud SQL subnet (for any Cloud SQL proxy or private access resources)
resource "google_compute_subnetwork" "cloudsql" {
  name                     = "${local.vpc_name}-cloudsql"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.cloudsql_subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Public subnet for NAT VM, bastion host, or other public-facing resources
resource "google_compute_subnetwork" "public" {
  name                     = "${local.vpc_name}-public"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = var.public_subnet_cidr
  private_ip_google_access = false

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# -----------------------------------------------------------------------------
# Private Service Access (for Cloud SQL)
# -----------------------------------------------------------------------------

# Reserve an IP range for Private Service Access
resource "google_compute_global_address" "private_service_access" {
  name          = "${local.vpc_name}-private-service-access"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_service_access_prefix_length
  address       = split("/", var.private_service_access_cidr)[0]
  network       = google_compute_network.vpc.id
}

# Create the Private Service Connection for Cloud SQL
resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_access.name]
}

# -----------------------------------------------------------------------------
# Cloud Router (for NAT)
# -----------------------------------------------------------------------------

resource "google_compute_router" "router" {
  name    = "${local.vpc_name}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.vpc.id

  bgp {
    asn = 64514
  }
}

# -----------------------------------------------------------------------------
# Cloud NAT
# -----------------------------------------------------------------------------

resource "google_compute_router_nat" "nat" {
  name                               = "${local.vpc_name}-nat"
  project                            = var.project_id
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = var.nat_ip_allocate_option
  source_subnetwork_ip_ranges_to_nat = var.source_subnetwork_ip_ranges_to_nat

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# -----------------------------------------------------------------------------
# Firewall Rules
# -----------------------------------------------------------------------------

# Allow internal communication within the VPC
resource "google_compute_firewall" "internal" {
  count = var.enable_internal_firewall ? 1 : 0

  name    = "${local.vpc_name}-allow-internal"
  project = var.project_id
  network = google_compute_network.vpc.id

  direction = "INGRESS"
  priority  = 1000

  source_ranges = [
    var.gke_subnet_cidr,
    var.gke_pods_cidr,
    var.gke_services_cidr,
    var.cloudsql_subnet_cidr,
    var.public_subnet_cidr,
  ]

  dynamic "allow" {
    for_each = var.internal_allow_protocols
    content {
      protocol = allow.value
    }
  }

  description = "Allow internal communication between all subnets in the VPC"
}

# Allow SSH from IAP (Identity-Aware Proxy) for secure bastion access
resource "google_compute_firewall" "iap_ssh" {
  name    = "${local.vpc_name}-allow-iap-ssh"
  project = var.project_id
  network = google_compute_network.vpc.id

  direction = "INGRESS"
  priority  = 1000

  # IAP IP ranges
  source_ranges = ["35.235.240.0/20"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  description = "Allow SSH access from Identity-Aware Proxy"
}

# Allow health checks from GCP load balancers
resource "google_compute_firewall" "health_check" {
  name    = "${local.vpc_name}-allow-health-check"
  project = var.project_id
  network = google_compute_network.vpc.id

  direction = "INGRESS"
  priority  = 1000

  # GCP health check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22",
  ]

  allow {
    protocol = "tcp"
  }

  description = "Allow health checks from GCP load balancers"
}

# Allow GKE master to communicate with nodes
# This rule is created only if gke_master_cidr is specified (for private clusters)
resource "google_compute_firewall" "gke_webhooks" {
  count = var.gke_master_cidr != null ? 1 : 0

  name    = "${local.vpc_name}-allow-gke-webhooks"
  project = var.project_id
  network = google_compute_network.vpc.id

  direction = "INGRESS"
  priority  = 1000

  # GKE control plane IP range for private clusters
  source_ranges = [var.gke_master_cidr]

  target_tags = ["gke-node"]

  allow {
    protocol = "tcp"
    ports    = ["443", "8443", "10250"]
  }

  description = "Allow GKE webhooks and kubelet communication from control plane"
}
