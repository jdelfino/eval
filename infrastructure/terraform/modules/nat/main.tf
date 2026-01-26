# GCP NAT VM Module
#
# Creates a cost-effective NAT instance using an e2-micro VM (~$6/mo) instead
# of Cloud NAT (~$32/mo). The VM provides outbound internet access for private
# subnet resources via IP masquerading.
#
# Resources created:
# - Static external IP for NAT VM
# - e2-micro compute instance with IP forwarding enabled
# - Custom route for private subnet traffic through NAT VM
# - Firewall rule allowing egress through NAT VM

locals {
  name_prefix = coalesce(var.name_prefix, "${var.project_name}-${var.environment}")
  nat_name    = "${local.name_prefix}-nat"

  # Common labels for all resources
  labels = merge(
    {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
      module      = "nat"
    },
    var.labels
  )

  # Startup script to configure iptables NAT masquerade
  startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    sysctl -w net.ipv4.ip_forward=1

    # Make IP forwarding persistent
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

    # Configure iptables for NAT masquerading
    # Allow forwarding from private subnet
    iptables -t nat -A POSTROUTING -o ens4 -j MASQUERADE
    iptables -A FORWARD -i ens4 -o ens4 -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i ens4 -o ens4 -j ACCEPT

    # Save iptables rules
    apt-get update -y
    apt-get install -y iptables-persistent
    netfilter-persistent save

    # Log successful configuration
    echo "NAT configuration completed successfully" | logger -t nat-setup
  EOF
}

# -----------------------------------------------------------------------------
# Static External IP
# -----------------------------------------------------------------------------

resource "google_compute_address" "nat" {
  name         = "${local.nat_name}-ip"
  project      = var.project_id
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "STANDARD"

  labels = local.labels
}

# -----------------------------------------------------------------------------
# NAT VM Instance
# -----------------------------------------------------------------------------

resource "google_compute_instance" "nat" {
  name         = local.nat_name
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  # Enable IP forwarding for NAT functionality
  can_ip_forward = true

  # Use preemptible/spot for additional cost savings (optional - comment out for higher availability)
  # scheduling {
  #   preemptible         = true
  #   automatic_restart   = false
  #   on_host_maintenance = "TERMINATE"
  # }

  boot_disk {
    initialize_params {
      image = "${var.image_project}/${var.image_family}"
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    subnetwork = var.public_subnet_id

    access_config {
      nat_ip       = google_compute_address.nat.address
      network_tier = "STANDARD"
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = local.startup_script

  labels = local.labels

  tags = ["nat-gateway"]

  # Allow instance to be stopped for maintenance
  allow_stopping_for_update = true

  service_account {
    # Use default compute service account with minimal scopes
    scopes = [
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
    ]
  }
}

# -----------------------------------------------------------------------------
# Route for Private Subnet Traffic
# -----------------------------------------------------------------------------

resource "google_compute_route" "nat" {
  name                   = "${local.nat_name}-route"
  project                = var.project_id
  network                = var.network_id
  dest_range             = "0.0.0.0/0"
  priority               = var.route_priority
  next_hop_instance      = google_compute_instance.nat.self_link
  next_hop_instance_zone = var.zone

  # Only apply to instances with specified tags
  tags = var.route_tags

  description = "Route internet traffic through NAT VM for private subnet instances"
}

# -----------------------------------------------------------------------------
# Firewall Rule for NAT Traffic
# -----------------------------------------------------------------------------

resource "google_compute_firewall" "nat_egress" {
  name    = "${local.nat_name}-allow-egress"
  project = var.project_id
  network = var.network_id

  direction = "INGRESS"
  priority  = 1000

  # Allow traffic from private subnet to NAT VM
  source_ranges = [var.private_subnet_cidr]
  target_tags   = ["nat-gateway"]

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }

  description = "Allow private subnet instances to send traffic through NAT VM"
}
