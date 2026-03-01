#!/bin/bash
# post-create.sh - Install tools and configure the development environment
# Runs via postCreateCommand (after container creation)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Install 1Password CLI
"$SCRIPT_DIR/install-1password-cli.sh"

# Install beads and git hooks
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
bd hooks install 2>/dev/null || true

# Install Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# Fix ownership of node_modules volume (Docker named volumes default to root)
sudo chown vscode:vscode "/workspaces/eval/node_modules"

# Fix ownership of go mod cache volume (Docker named volumes default to root)
sudo chown -R vscode:vscode /home/vscode/go/pkg/mod

# Install Air (Go hot reload)
go install github.com/air-verse/air@latest

# Install lefthook and gitleaks
go install github.com/evilmartians/lefthook@latest
go install github.com/zricethezav/gitleaks/v8@latest
lefthook install

# Install system packages
sudo apt-get update
sudo apt-get install -y postgresql-client redis-tools apt-transport-https ca-certificates gnupg

# Install Google Cloud SDK
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update
sudo apt-get install -y google-cloud-cli

# Configure 1Password vault access
"$SCRIPT_DIR/setup.sh"
