# Staging Environment Configuration
#
# All environment-specific values are defined here.
# These values instantiate the same modules used in prod with staging config.

# -----------------------------------------------------------------------------
# Common Configuration
# -----------------------------------------------------------------------------

environment  = "staging"
project_name = "eval"
region       = "us-east-2"

# -----------------------------------------------------------------------------
# VPC Configuration
# -----------------------------------------------------------------------------

vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-2a", "us-east-2b"]

private_subnet_cidrs = [
  "10.0.1.0/24",
  "10.0.2.0/24"
]

public_subnet_cidrs = [
  "10.0.101.0/24",
  "10.0.102.0/24"
]

# -----------------------------------------------------------------------------
# EKS Configuration
# -----------------------------------------------------------------------------

eks_cluster_version = "1.28"

# -----------------------------------------------------------------------------
# RDS Configuration
# -----------------------------------------------------------------------------

rds_instance_class    = "db.t3.small"
rds_allocated_storage = 20
database_name         = "eval"

# -----------------------------------------------------------------------------
# Redis Configuration
# -----------------------------------------------------------------------------

redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# -----------------------------------------------------------------------------
# Cognito Configuration
# -----------------------------------------------------------------------------

cognito_callback_urls = [
  "https://staging.eval.example.com/auth/callback",
  "http://localhost:3000/auth/callback"
]

cognito_logout_urls = [
  "https://staging.eval.example.com",
  "http://localhost:3000"
]
