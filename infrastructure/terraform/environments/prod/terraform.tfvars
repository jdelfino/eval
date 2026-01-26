# Production Environment Configuration
#
# All environment-specific values are defined here.
# These values instantiate the same modules used in staging with production config.

# -----------------------------------------------------------------------------
# Common Configuration
# -----------------------------------------------------------------------------

environment  = "prod"
project_name = "eval"
region       = "us-east-2"

# -----------------------------------------------------------------------------
# VPC Configuration
# Production uses a separate CIDR range from staging for isolation.
# -----------------------------------------------------------------------------

vpc_cidr           = "10.1.0.0/16"
availability_zones = ["us-east-2a", "us-east-2b"]

private_subnet_cidrs = [
  "10.1.1.0/24",
  "10.1.2.0/24"
]

public_subnet_cidrs = [
  "10.1.101.0/24",
  "10.1.102.0/24"
]

# -----------------------------------------------------------------------------
# EKS Configuration
# -----------------------------------------------------------------------------

eks_cluster_version = "1.28"

# -----------------------------------------------------------------------------
# RDS Configuration
# Start small, scale up when needed. Instance resize is quick (~30s downtime).
# -----------------------------------------------------------------------------

rds_instance_class    = "db.t3.small"
rds_allocated_storage = 20
database_name         = "eval"

# -----------------------------------------------------------------------------
# Redis Configuration
# Start small, scale up when needed. Node resize is quick.
# -----------------------------------------------------------------------------

redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# -----------------------------------------------------------------------------
# Cognito Configuration
# -----------------------------------------------------------------------------

cognito_callback_urls = [
  "https://eval.example.com/auth/callback"
]

cognito_logout_urls = [
  "https://eval.example.com"
]
