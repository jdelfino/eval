# Terraform Backend Configuration - Production
#
# Uses S3 for state storage with DynamoDB for locking.
# The S3 bucket and DynamoDB table are created by the bootstrap module.

terraform {
  backend "s3" {
    bucket         = "eval-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
