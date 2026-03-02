# Terraform and Provider Version Constraints
#
# This module requires only the Google Cloud provider for managing
# Cloud Monitoring resources.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}
