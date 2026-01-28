# Centrifugo Kubernetes Module Outputs
#
# Outputs for integration with other modules and applications.

# -----------------------------------------------------------------------------
# Service Outputs
# -----------------------------------------------------------------------------

output "service_name" {
  description = "The name of the Centrifugo Kubernetes service"
  value       = kubernetes_service.centrifugo.metadata[0].name
}

output "service_port" {
  description = "The port of the Centrifugo Kubernetes service"
  value       = 8000
}

output "internal_url" {
  description = "Internal URL for accessing Centrifugo from within the cluster"
  value       = "http://${kubernetes_service.centrifugo.metadata[0].name}:8000"
}
