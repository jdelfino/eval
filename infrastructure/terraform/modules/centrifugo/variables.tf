# Centrifugo Kubernetes Module Variables
#
# All required variables have no defaults - forces explicit configuration.
# Values are provided by the calling environment.

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

variable "image_tag" {
  description = "Centrifugo Docker image tag"
  type        = string
  default     = "v5"
}

variable "replicas" {
  description = "Number of Centrifugo deployment replicas"
  type        = number
  default     = 2
}

variable "namespace" {
  description = "Kubernetes namespace for Centrifugo resources"
  type        = string
  default     = "default"
}

# -----------------------------------------------------------------------------
# Resource Limits
# -----------------------------------------------------------------------------

variable "cpu_request" {
  description = "CPU request for Centrifugo container"
  type        = string
  default     = "100m"
}

variable "memory_request" {
  description = "Memory request for Centrifugo container"
  type        = string
  default     = "128Mi"
}

variable "memory_limit" {
  description = "Memory limit for Centrifugo container"
  type        = string
  default     = "256Mi"
}
