# Bootstrap Module Variables

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "region" {
  description = "AWS region for the state backend resources"
  type        = string
}
