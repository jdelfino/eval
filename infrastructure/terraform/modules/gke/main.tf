# GCP GKE Standard Module
#
# Creates a GKE Standard cluster with two node pools (default + executor),
# private cluster configuration, Workload Identity, and VPC-native networking.
#
# The executor pool is tainted so only executor pods schedule there.
# Both pools support scale-to-zero via configurable min node counts.

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
# GKE Standard Cluster
# -----------------------------------------------------------------------------

resource "google_container_cluster" "main" {
  name     = local.cluster_name
  project  = var.project_id
  location = var.zone

  # Standard cluster pattern: remove default node pool, manage separately
  initial_node_count       = 1
  remove_default_node_pool = true

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

# -----------------------------------------------------------------------------
# Default Node Pool
# -----------------------------------------------------------------------------

resource "google_container_node_pool" "default" {
  name     = "default"
  project  = var.project_id
  location = var.zone
  cluster  = google_container_cluster.main.name

  autoscaling {
    min_node_count = var.default_pool_min_nodes
    max_node_count = var.default_pool_max_nodes
  }

  node_config {
    machine_type = var.default_pool_machine_type
    spot         = var.default_pool_spot
    disk_size_gb = var.default_pool_disk_size_gb
    tags         = var.node_network_tags

    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# -----------------------------------------------------------------------------
# Executor Node Pool
# -----------------------------------------------------------------------------

resource "google_container_node_pool" "executor" {
  name     = "executor"
  project  = var.project_id
  location = var.zone
  cluster  = google_container_cluster.main.name

  autoscaling {
    min_node_count = var.executor_pool_min_nodes
    max_node_count = var.executor_pool_max_nodes
  }

  node_config {
    machine_type = var.executor_pool_machine_type
    image_type   = "COS_CONTAINERD"
    spot         = var.executor_pool_spot
    disk_size_gb = var.executor_pool_disk_size_gb
    tags         = var.node_network_tags

    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    taint {
      key    = "executor-only"
      value  = "true"
      effect = "NO_SCHEDULE"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# -----------------------------------------------------------------------------
# Fleet Membership (Connect Gateway)
# -----------------------------------------------------------------------------

resource "google_gke_hub_membership" "main" {
  membership_id = local.cluster_name
  project       = var.project_id

  endpoint {
    gke_cluster {
      resource_link = google_container_cluster.main.id
    }
  }
}
