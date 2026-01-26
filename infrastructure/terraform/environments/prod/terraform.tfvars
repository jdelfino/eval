# Production Environment Configuration
#
# All environment-specific values are defined here.
# These values instantiate the same modules used in staging with production config.

# -----------------------------------------------------------------------------
# Common Configuration
# -----------------------------------------------------------------------------

environment  = "prod"
project_name = "eval"
region       = "us-west-2"

# -----------------------------------------------------------------------------
# VPC Configuration
# Production uses a separate CIDR range from staging for isolation.
# -----------------------------------------------------------------------------

vpc_cidr           = "10.1.0.0/16"
availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]

private_subnet_cidrs = [
  "10.1.1.0/24",
  "10.1.2.0/24",
  "10.1.3.0/24"
]

public_subnet_cidrs = [
  "10.1.101.0/24",
  "10.1.102.0/24",
  "10.1.103.0/24"
]

# -----------------------------------------------------------------------------
# EKS Configuration
# -----------------------------------------------------------------------------

eks_cluster_version = "1.28"

# -----------------------------------------------------------------------------
# RDS Configuration
# Production uses larger instance sizes for capacity.
# -----------------------------------------------------------------------------

rds_instance_class    = "db.r6g.large"
rds_allocated_storage = 100
database_name         = "eval"

# -----------------------------------------------------------------------------
# Redis Configuration
# Production uses larger nodes and multi-node cluster.
# -----------------------------------------------------------------------------

redis_node_type       = "cache.r6g.large"
redis_num_cache_nodes = 2

# -----------------------------------------------------------------------------
# Cognito Configuration
# -----------------------------------------------------------------------------

cognito_callback_urls = [
  "https://eval.example.com/auth/callback"
]

cognito_logout_urls = [
  "https://eval.example.com"
]
