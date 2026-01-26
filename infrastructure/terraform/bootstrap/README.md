# Bootstrap Module

One-time setup for Terraform state backend infrastructure.

## Purpose

Creates the S3 bucket and DynamoDB table required for remote state storage and locking. This module is run once, manually, before any other Terraform modules.

## Resources Created

- **S3 Bucket**: Stores Terraform state files with versioning and encryption
- **DynamoDB Table**: Provides state locking to prevent concurrent modifications

## Usage

```bash
cd infrastructure/terraform/bootstrap

# Initialize (local state only for bootstrap)
terraform init

# Review the plan
terraform plan -var="project_name=eval" -var="region=us-east-2"

# Apply
terraform apply -var="project_name=eval" -var="region=us-east-2"
```

## After Bootstrap

Once applied, note the output values. Use them to configure `backend.tf` in each environment:

```hcl
# environments/staging/backend.tf
terraform {
  backend "s3" {
    bucket         = "<state_bucket_name from output>"
    key            = "staging/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "<dynamodb_table_name from output>"
    encrypt        = true
  }
}
```

## State Management

The bootstrap module's own state is stored **locally** in `terraform.tfstate`. This is intentional - the bootstrap cannot use the backend it creates. Keep this state file safe or store it in a secure location.

## Destroying

**Warning**: Destroying the bootstrap module will delete all Terraform state for all environments. Only do this if you're completely tearing down the infrastructure.

```bash
# Only if you're sure!
terraform destroy -var="project_name=eval" -var="region=us-east-2"
```
