# Cloud DNS and Static IP Module
#
# Provisions a static global IP for the GKE ingress load balancer and a
# Cloud DNS managed zone with an A record pointing the domain to that IP.
# SSL is handled separately via a GKE ManagedCertificate custom resource
# in Kubernetes manifests, not in this module.

# -----------------------------------------------------------------------------
# Enable Cloud DNS API
# -----------------------------------------------------------------------------

resource "google_project_service" "dns" {
  project = var.project_id
  service = "dns.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}

# -----------------------------------------------------------------------------
# Static Global IP for Ingress Load Balancer
# -----------------------------------------------------------------------------

resource "google_compute_global_address" "ingress" {
  name    = "${var.project_name}-${var.environment}-ingress-ip"
  project = var.project_id
}

# -----------------------------------------------------------------------------
# Cloud DNS Managed Zone
# -----------------------------------------------------------------------------

resource "google_dns_managed_zone" "this" {
  name        = "${var.project_name}-${var.environment}-zone"
  dns_name    = "${var.domain_name}."
  description = "DNS zone for ${var.domain_name} (${var.environment})"
  project     = var.project_id
  visibility  = "public"

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.dns]
}

# -----------------------------------------------------------------------------
# A Record: domain -> static IP
# -----------------------------------------------------------------------------

resource "google_dns_record_set" "a" {
  name         = "${var.domain_name}."
  managed_zone = google_dns_managed_zone.this.name
  project      = var.project_id
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.ingress.address]
}

# -----------------------------------------------------------------------------
# A Record: staging subdomain -> same static IP
# -----------------------------------------------------------------------------

resource "google_dns_record_set" "staging_a" {
  name         = "staging.${var.domain_name}."
  managed_zone = google_dns_managed_zone.this.name
  project      = var.project_id
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.ingress.address]
}
