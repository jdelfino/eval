# GCP Memorystore Redis Module
#
# Creates a Memorystore Redis instance for Centrifugo pub/sub and presence.
# Connects via private IP within the same VPC as the GKE cluster.

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  instance_name = coalesce(var.instance_name, "${var.project_name}-${var.environment}-redis")

  # Common labels for all resources
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      module      = "redis"
    },
    var.labels
  )
}

# -----------------------------------------------------------------------------
# Memorystore Redis Instance
# -----------------------------------------------------------------------------

resource "google_redis_instance" "main" {
  name               = local.instance_name
  project            = var.project_id
  region             = var.region
  tier               = var.tier
  memory_size_gb     = var.memory_size_gb
  redis_version      = var.redis_version
  display_name       = "${var.project_name} ${var.environment} Redis"
  authorized_network = var.vpc_network_id
  connect_mode       = var.connect_mode

  labels = local.labels

  lifecycle {
    prevent_destroy = false
  }
}
