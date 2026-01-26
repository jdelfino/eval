# Terraform and Provider Version Constraints
#
# This file is separate from main.tf to make version requirements
# immediately visible and easy to update.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
