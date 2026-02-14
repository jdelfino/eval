# GCP Cloud SQL PostgreSQL Module
#
# Creates a Cloud SQL PostgreSQL instance with:
# - Private IP connectivity via Private Service Access
# - Automated backups with point-in-time recovery
# - SSL required for all connections
# - Configurable database and user

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  instance_name = coalesce(var.instance_name, "${var.project_name}-${var.environment}-db")

  # Common labels for all resources
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      module      = "cloudsql"
    },
    var.labels
  )
}

# -----------------------------------------------------------------------------
# Random Passwords for Database Users
# -----------------------------------------------------------------------------

resource "random_password" "database_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "reader_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# -----------------------------------------------------------------------------
# Cloud SQL Instance
# -----------------------------------------------------------------------------

resource "google_sql_database_instance" "main" {
  name                = local.instance_name
  project             = var.project_id
  region              = var.region
  database_version    = var.database_version
  deletion_protection = var.deletion_protection

  settings {
    tier                  = var.tier
    availability_type     = var.availability_type
    disk_size             = var.disk_size
    disk_type             = var.disk_type
    disk_autoresize       = var.disk_autoresize
    disk_autoresize_limit = var.disk_autoresize ? var.disk_autoresize_limit : 0

    user_labels = local.labels

    # IP configuration - private IP only by default
    ip_configuration {
      ipv4_enabled    = var.public_network_enabled
      private_network = var.private_network_enabled ? var.vpc_network_id : null
      ssl_mode        = var.ssl_mode

      dynamic "authorized_networks" {
        for_each = var.authorized_networks
        content {
          name  = authorized_networks.value.name
          value = authorized_networks.value.value
        }
      }
    }

    # Backup configuration
    backup_configuration {
      enabled                        = var.backup_enabled
      start_time                     = var.backup_start_time
      location                       = var.backup_location
      point_in_time_recovery_enabled = var.point_in_time_recovery_enabled
      transaction_log_retention_days = var.transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.retained_backups
        retention_unit   = "COUNT"
      }
    }

    # Maintenance window
    maintenance_window {
      day          = var.maintenance_window_day
      hour         = var.maintenance_window_hour
      update_track = var.maintenance_window_update_track
    }

    # Database flags
    dynamic "database_flags" {
      for_each = var.database_flags
      content {
        name  = database_flags.value.name
        value = database_flags.value.value
      }
    }

    # Insights configuration for query performance monitoring
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }
  }

  # Prevent destruction if deletion_protection is enabled
  lifecycle {
    prevent_destroy = false
  }
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "google_sql_database" "main" {
  name      = var.database_name
  project   = var.project_id
  instance  = google_sql_database_instance.main.name
  charset   = var.database_charset
  collation = var.database_collation
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------

resource "google_sql_user" "main" {
  name     = var.database_user
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.database_password.result

  # Deletion policy - allow deletion without breaking terraform
  deletion_policy = "ABANDON"
}

# -----------------------------------------------------------------------------
# Read-Only Database User
# -----------------------------------------------------------------------------
# Used for production debugging. Privileges granted via SQL migration.

resource "google_sql_user" "reader" {
  name     = "reader"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.reader_password.result

  deletion_policy = "ABANDON"
}
