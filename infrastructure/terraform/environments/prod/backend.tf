# Terraform Backend Configuration - Production
#
# Uses S3 for state storage with DynamoDB for locking.
# The S3 bucket and DynamoDB table are created by the bootstrap module.

terraform {
  backend "s3" {
    # Update these values after running bootstrap module
    bucket         = "eval-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "eval-terraform-locks"
    encrypt        = true
  }
}
