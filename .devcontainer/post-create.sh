#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Install 1Password CLI
"$SCRIPT_DIR/install-1password-cli.sh"

# Install beads
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Install Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# Install Air (Go hot reload)
go install github.com/air-verse/air@latest

# Install system packages
sudo apt-get update
sudo apt-get install -y postgresql-client redis-tools apt-transport-https ca-certificates gnupg

# Install Google Cloud SDK
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update
sudo apt-get install -y google-cloud-cli

# Run project setup
"$SCRIPT_DIR/setup.sh"
