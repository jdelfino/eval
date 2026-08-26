# Validation tests for the dns-ssl module's hibernation support
#
# These tests verify that hibernate = true releases the ingress static IP
# and both A records, while keeping the managed zone itself intact — the
# zone holds the GoDaddy NS delegation and deleting it would require
# re-delegation on wake. Run with: terraform test

variables {
  environment  = "test"
  project_name = "testproject"
  project_id   = "testproject-test"
  region       = "us-central1"
  domain_name  = "example.com"
}

run "hibernate_releases_ingress_ip_and_a_records" {
  command = plan

  variables {
    hibernate = true
  }

  assert {
    condition     = length(google_compute_global_address.ingress) == 0
    error_message = "Expected the ingress static IP to be absent when hibernating"
  }

  assert {
    condition     = length(google_dns_record_set.a) == 0
    error_message = "Expected the domain A record to be absent when hibernating"
  }

  assert {
    condition     = length(google_dns_record_set.staging_a) == 0
    error_message = "Expected the staging A record to be absent when hibernating"
  }

  assert {
    condition     = google_dns_managed_zone.this.name == "testproject-test-zone"
    error_message = "Expected the managed zone to still be planned when hibernating — deleting it would break the GoDaddy NS delegation and require re-delegation on wake"
  }
}

run "normal_mode_creates_ingress_ip_and_a_records" {
  command = plan

  variables {
    hibernate = false
  }

  assert {
    condition     = length(google_compute_global_address.ingress) == 1
    error_message = "Expected the ingress static IP to be present when not hibernating"
  }

  assert {
    condition     = length(google_dns_record_set.a) == 1
    error_message = "Expected the domain A record to be present when not hibernating"
  }

  assert {
    condition     = length(google_dns_record_set.staging_a) == 1
    error_message = "Expected the staging A record to be present when not hibernating"
  }

  assert {
    condition     = google_dns_managed_zone.this.name == "testproject-test-zone"
    error_message = "Expected the managed zone to be planned when not hibernating"
  }
}
