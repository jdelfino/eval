# Cloud DNS and Static IP Module Outputs
#
# Expose key values for reference by other modules, Kubernetes manifests,
# and manual DNS delegation steps.

output "static_ip_name" {
  description = "Name of the static global IP resource (for kubernetes.io/ingress.global-static-ip-name annotation)"
  value       = google_compute_global_address.ingress.name
}

output "static_ip_address" {
  description = "The allocated static IP address for the ingress load balancer"
  value       = google_compute_global_address.ingress.address
}

output "dns_name_servers" {
  description = "Name servers for the Cloud DNS managed zone (delegate these in your domain registrar)"
  value       = google_dns_managed_zone.this.name_servers
}

output "godaddy_instructions" {
  description = "Step-by-step instructions to delegate the subdomain from GoDaddy to Cloud DNS"
  value       = <<-EOT
    === GoDaddy DNS Delegation Instructions ===

    To delegate the "${var.domain_name}" subdomain to Google Cloud DNS,
    add the following NS records in GoDaddy's DNS management for your
    parent domain.

    IMPORTANT: Do NOT change the domain's nameservers. Instead, add NS
    records for the subdomain so that queries for ${var.domain_name} are
    forwarded to Google Cloud DNS.

    Steps:
    1. Log in to GoDaddy and go to DNS Management for your domain.
    2. Add NS records for the subdomain prefix (e.g. "eval") pointing
       to each of the following name servers:

    %{for ns in google_dns_managed_zone.this.name_servers~}
       - ${ns}
    %{endfor~}

    3. Save the changes. DNS propagation may take up to 48 hours,
       but typically completes within a few minutes to a few hours.
    4. Verify with: dig ${var.domain_name} NS +short
  EOT
}
