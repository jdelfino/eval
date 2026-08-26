# Validation tests for the nat module's hibernation support
#
# These tests verify that hibernate = true destroys the entire NAT module
# (VM, static IP, route, firewall) rather than merely stopping the VM —
# a stopped VM with an attached static IP bills as "unused" and costs more
# than leaving it running. Run with: terraform test

variables {
  environment         = "test"
  project_name        = "testproject"
  project_id          = "testproject-test"
  region              = "us-central1"
  zone                = "us-central1-a"
  network_id          = "projects/testproject-test/global/networks/test-network"
  public_subnet_id    = "projects/testproject-test/regions/us-central1/subnetworks/test-public-subnet"
  private_subnet_cidr = "10.0.0.0/24"
}

run "hibernate_destroys_whole_nat_module" {
  command = plan

  variables {
    hibernate = true
  }

  assert {
    condition     = length(google_compute_instance.nat) == 0
    error_message = "Expected the NAT VM instance to be absent when hibernating"
  }

  assert {
    condition     = length(google_compute_address.nat) == 0
    error_message = "Expected the NAT static IP to be absent when hibernating — retaining it bills as an unused address"
  }

  assert {
    condition     = length(google_compute_route.nat) == 0
    error_message = "Expected the NAT route to be absent when hibernating"
  }

  assert {
    condition     = length(google_compute_firewall.nat_egress) == 0
    error_message = "Expected the NAT egress firewall rule to be absent when hibernating"
  }
}

run "normal_mode_creates_whole_nat_module" {
  command = plan

  variables {
    hibernate = false
  }

  assert {
    condition     = length(google_compute_instance.nat) == 1
    error_message = "Expected the NAT VM instance to be present when not hibernating"
  }

  assert {
    condition     = length(google_compute_address.nat) == 1
    error_message = "Expected the NAT static IP to be present when not hibernating"
  }

  assert {
    condition     = length(google_compute_route.nat) == 1
    error_message = "Expected the NAT route to be present when not hibernating"
  }

  assert {
    condition     = length(google_compute_firewall.nat_egress) == 1
    error_message = "Expected the NAT egress firewall rule to be present when not hibernating"
  }
}
