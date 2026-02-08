# Centrifugo Kubernetes Module Variables
#
# All required variables have no defaults - forces explicit configuration.
# Values are provided by the calling environment.
#
# Deployment, Service, and BackendConfig are managed by kustomize (k8s/base/).
# This module manages ConfigMap (with dynamic config) and Secret (with generated keys).

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

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
}

# -----------------------------------------------------------------------------
# Centrifugo Configuration
# -----------------------------------------------------------------------------

variable "allowed_origins" {
  description = "List of allowed origins for Centrifugo CORS"
  type        = list(string)
  default     = []
}

variable "redis_host" {
  description = "Redis host for Centrifugo engine"
  type        = string
}

variable "redis_port" {
  description = "Redis port for Centrifugo engine"
  type        = number
}

variable "namespace" {
  description = "Kubernetes namespace for Centrifugo resources"
  type        = string
  default     = "default"
}
