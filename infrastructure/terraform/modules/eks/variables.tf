# EKS Module Variables

# -----------------------------------------------------------------------------
# Common Variables (required by all modules)
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Environment name (staging or prod)"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

# -----------------------------------------------------------------------------
# EKS-specific Variables
# -----------------------------------------------------------------------------

variable "vpc_id" {
  description = "ID of the VPC to deploy into"
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of private subnets for the EKS cluster"
  type        = list(string)
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
}
