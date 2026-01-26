#!/bin/bash
# setup.sh - Configure credentials from 1Password
# Runs via postCreateCommand (container creation)
#
# Reads from env vars or .op-token/.op-vault files (created by init-1password.sh)
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

# SSH Key
echo "Setting up SSH..."
mkdir -p ~/.ssh && chmod 700 ~/.ssh

SSH_ITEM=$(op item list --vault "$OP_VAULT" --tags devcontainer --categories "SSH Key" --format json | jq -r '.[0].id')
if [ "$SSH_ITEM" = "null" ] || [ -z "$SSH_ITEM" ]; then
    echo "ERROR: No SSH Key found"
    echo "Fix: In 1Password, create an SSH Key item and tag it 'devcontainer'"
    exit 1
fi

# Get private key in OpenSSH format
if ! op read "op://${OP_VAULT}/${SSH_ITEM}/private key?ssh-format=openssh" > ~/.ssh/id_ed25519; then
    echo "ERROR: Could not read SSH private key"
    exit 1
fi
chmod 600 ~/.ssh/id_ed25519
ssh-keygen -y -f ~/.ssh/id_ed25519 > ~/.ssh/id_ed25519.pub
# Add github.com to known_hosts if not already present
if ! grep -q "^github.com " ~/.ssh/known_hosts 2>/dev/null; then
    ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
fi
echo "SSH key configured"

# Git identity
echo "Setting up Git..."
if ! GIT_NAME=$(op read "op://${OP_VAULT}/git-config/name"); then
    echo "ERROR: Could not read git-config/name"
    echo "Fix: In 1Password, create a Secure Note named 'git-config' with field 'name'"
    exit 1
fi

if ! GIT_EMAIL=$(op read "op://${OP_VAULT}/git-config/email"); then
    echo "ERROR: Could not read git-config/email"
    echo "Fix: In 1Password, create a Secure Note named 'git-config' with field 'email'"
    exit 1
fi

git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"
echo "Git: $GIT_NAME <$GIT_EMAIL>"

# GitHub CLI
echo "Setting up GitHub CLI..."
if ! op read "op://${OP_VAULT}/github-pat/credential" | gh auth login --with-token --git-protocol ssh --skip-ssh-key; then
    echo "ERROR: Could not authenticate GitHub CLI"
    echo "Fix: In 1Password, create an item named 'github-pat' with field 'credential' containing a GitHub PAT"
    exit 1
fi
echo "GitHub CLI authenticated"

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
