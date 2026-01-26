# Staging Environment
#
# Instantiates reusable modules with staging-specific configuration.
# All values come from terraform.tfvars - no hardcoded environment values.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Kubernetes provider configuration
# Configured after EKS module creates the cluster
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# -----------------------------------------------------------------------------
# Module Instantiation
# -----------------------------------------------------------------------------

module "vpc" {
  source = "../../modules/vpc"

  environment  = var.environment
  project_name = var.project_name
  region       = var.region

  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs
}

module "eks" {
  source = "../../modules/eks"

  environment  = var.environment
  project_name = var.project_name
  region       = var.region

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  cluster_version = var.eks_cluster_version
}

module "rds" {
  source = "../../modules/rds"

  environment  = var.environment
  project_name = var.project_name
  region       = var.region

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  database_name     = var.database_name
}

module "redis" {
  source = "../../modules/redis"

  environment  = var.environment
  project_name = var.project_name
  region       = var.region

  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  node_type       = var.redis_node_type
  num_cache_nodes = var.redis_num_cache_nodes
}

module "cognito" {
  source = "../../modules/cognito"

  environment  = var.environment
  project_name = var.project_name
  region       = var.region

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
}

# -----------------------------------------------------------------------------
# Kubernetes Resources for Application Configuration
# -----------------------------------------------------------------------------
# These resources expose infrastructure outputs to applications running in EKS.
# Apps read environment variables from ConfigMaps and Secrets.

resource "kubernetes_config_map" "app_config" {
  metadata {
    name      = "app-config"
    namespace = "default"
  }

  data = {
    # AWS Configuration
    AWS_REGION = var.region

    # Cognito Configuration
    COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    COGNITO_CLIENT_ID    = module.cognito.client_id
    COGNITO_DOMAIN       = module.cognito.domain_url

    # Database Configuration (non-secret)
    DATABASE_HOST = module.rds.endpoint
    DATABASE_PORT = "5432"
    DATABASE_NAME = var.database_name

    # Redis Configuration
    REDIS_HOST = module.redis.endpoint
    REDIS_PORT = "6379"
  }

  depends_on = [module.eks]
}

resource "kubernetes_secret" "app_secrets" {
  metadata {
    name      = "app-secrets"
    namespace = "default"
  }

  data = {
    COGNITO_CLIENT_SECRET = module.cognito.client_secret
    DATABASE_PASSWORD     = module.rds.password
    DATABASE_URL          = "postgresql://${module.rds.username}:${module.rds.password}@${module.rds.endpoint}:5432/${var.database_name}"
  }

  type = "Opaque"

  depends_on = [module.eks]
}
