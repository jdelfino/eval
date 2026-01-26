# GCP GKE Autopilot Module
#
# Creates a GKE Autopilot cluster with private cluster configuration,
# Workload Identity enabled, and VPC-native networking.
#
# Autopilot clusters have $0 control plane fee - you pay only for pod resources.

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  cluster_name = coalesce(var.cluster_name, "${var.project_name}-${var.environment}-gke")

  # Common labels for all resources
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      module      = "gke"
    },
    var.cluster_resource_labels
  )
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "container" {
  project = var.project_id
  service = "container.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}

# -----------------------------------------------------------------------------
# GKE Autopilot Cluster
# -----------------------------------------------------------------------------

resource "google_container_cluster" "autopilot" {
  name     = local.cluster_name
  project  = var.project_id
  location = var.region

  # Enable Autopilot mode - this manages node pools automatically
  enable_autopilot = true

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Network configuration - VPC-native cluster
  network    = var.network
  subnetwork = var.subnetwork

  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = var.enable_private_nodes
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block

    master_global_access_config {
      enabled = true
    }
  }

  # Master authorized networks for secure access
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  # Release channel for automatic upgrades
  release_channel {
    channel = var.release_channel
  }

  # Workload Identity configuration
  dynamic "workload_identity_config" {
    for_each = var.workload_identity_enabled ? [1] : []
    content {
      workload_pool = "${var.project_id}.svc.id.goog"
    }
  }

  # Maintenance window
  maintenance_policy {
    daily_maintenance_window {
      start_time = var.maintenance_start_time
    }
  }

  # Resource labels
  resource_labels = local.labels

  depends_on = [google_project_service.container]
}
