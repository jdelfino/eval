# Cloud Build Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_number" {
  description = "GCP project number"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "ci_service_account_email" {
  description = "Email of the CI service account that needs to submit Cloud Build jobs"
  type        = string
}
