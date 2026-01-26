# Terraform Backend Configuration - Production
#
# Uses GCS for state storage with built-in locking.
# The GCS bucket is created manually or by a bootstrap process.

terraform {
  backend "gcs" {
    bucket = "eval-prod-485520-terraform-state"
    prefix = "terraform/prod"
  }
}
