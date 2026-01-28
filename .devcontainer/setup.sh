#!/bin/bash
# setup.sh - Configure 1Password access for project secrets
# Runs via postCreateCommand (container creation)
#
# SSH, git identity, and GitHub CLI are handled by devcontainer/DevPod forwarding.
# This script only sets up 1Password access for project-specific secrets.
set -euo pipefail

echo "=== Devcontainer Setup ==="

# Load token from file if env var not set
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ -f ".op-token" ]; then
    export OP_SERVICE_ACCOUNT_TOKEN=$(cat .op-token)
    echo "Loaded OP_SERVICE_ACCOUNT_TOKEN from .op-token"
fi

# Load vault from file if env var not set
if [ -z "${OP_VAULT:-}" ] && [ -f ".op-vault" ]; then
    export OP_VAULT=$(cat .op-vault)
    echo "Loaded OP_VAULT from .op-vault"
fi

# Require token
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    echo "ERROR: OP_SERVICE_ACCOUNT_TOKEN not set"
    echo "Fix: Run .devcontainer/init-1password.sh on host first"
    exit 1
fi

# Require vault
if [ -z "${OP_VAULT:-}" ]; then
    echo "ERROR: OP_VAULT not set"
    echo "Fix: Run .devcontainer/init-1password.sh on host first"
    exit 1
fi

if ! op vault get "$OP_VAULT" --format json > /dev/null; then
    echo "ERROR: Cannot access vault '$OP_VAULT'"
    echo "Fix: Check OP_SERVICE_ACCOUNT_TOKEN has access to this vault"
    exit 1
fi

echo "Using 1Password vault: $OP_VAULT"

# Add env vars to shell profile for future sessions
WORKSPACE_DIR=$(pwd)
PROFILE_SNIPPET="
# 1Password credentials for devcontainer
if [ -f \"$WORKSPACE_DIR/.op-token\" ]; then
    export OP_SERVICE_ACCOUNT_TOKEN=\$(cat \"$WORKSPACE_DIR/.op-token\")
fi
if [ -f \"$WORKSPACE_DIR/.op-vault\" ]; then
    export OP_VAULT=\$(cat \"$WORKSPACE_DIR/.op-vault\")
fi
"

# Add to bashrc if not already present
if ! grep -q "1Password credentials for devcontainer" ~/.bashrc 2>/dev/null; then
    echo "$PROFILE_SNIPPET" >> ~/.bashrc
    echo "Added 1Password env vars to ~/.bashrc"
fi

# Add to zshrc if it exists and not already present
if [ -f ~/.zshrc ] && ! grep -q "1Password credentials for devcontainer" ~/.zshrc; then
    echo "$PROFILE_SNIPPET" >> ~/.zshrc
    echo "Added 1Password env vars to ~/.zshrc"
fi

echo "=== Setup Complete ==="
