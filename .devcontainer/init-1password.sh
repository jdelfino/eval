#!/bin/bash
# Initialize 1Password vault for this project (runs on HOST via initializeCommand)
# Requires: op CLI installed and signed in on host
#
# This script handles vault and service account setup for project secrets,
# including GitHub CLI authentication.
# SSH and git identity are handled by devcontainer/DevPod forwarding.

set -e

# Ensure bind mount source dirs exist on host (even if tools aren't installed)
mkdir -p "$HOME/.claude"

VAULT_NAME="eval-dev"

echo "=== 1Password Setup for eval ==="

# Check if op is available
if ! command -v op &> /dev/null; then
    echo "ERROR: 1Password CLI (op) not found on host."
    echo "Install from: https://1password.com/downloads/command-line/"
    exit 1
fi

# Check if signed in (op whoami requires valid auth, not just configured accounts)
if ! op whoami &> /dev/null; then
    if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
        echo "ERROR: OP_SERVICE_ACCOUNT_TOKEN is set but invalid (may be deleted)"
        echo "Fix: unset OP_SERVICE_ACCOUNT_TOKEN"
        exit 1
    fi
    echo "ERROR: Not signed in to 1Password."
    echo "Fix: Run 'eval \$(op signin)' first."
    exit 1
fi

echo "Using vault: $VAULT_NAME"

# Create vault if needed
if op vault get "$VAULT_NAME" &> /dev/null; then
    echo "✓ Vault exists"
else
    echo "Creating vault '$VAULT_NAME'..."
    op vault create "$VAULT_NAME"
    echo "✓ Vault created"
fi

# Check/create service account
SA_NAME="eval-devcontainer"
echo ""
if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    echo "✓ OP_SERVICE_ACCOUNT_TOKEN is set"
    # Write to file for container
    echo "$OP_SERVICE_ACCOUNT_TOKEN" > "$(dirname "$0")/../.op-token"
elif op item get "service-account-token" --vault "$VAULT_NAME" &> /dev/null; then
    echo "✓ Service account exists, retrieving token..."
    SA_TOKEN=$(op read "op://${VAULT_NAME}/service-account-token/credential")
    echo "$SA_TOKEN" > "$(dirname "$0")/../.op-token"
    echo "✓ Token written to .op-token"
else
    echo "Creating service account '$SA_NAME'..."
    SA_TOKEN=$(op service-account create "$SA_NAME" \
        --vault "$VAULT_NAME:read_items,write_items" \
        --raw 2>&1) || {
        echo "⚠ Could not create service account (may already exist or require admin)"
        echo "  Create manually at: https://my.1password.com/developer-tools/service-accounts"
        echo "  Then set: export OP_SERVICE_ACCOUNT_TOKEN=<token>"
        exit 1
    }

    # Save token in vault for future reference
    op item create --category "API Credential" --vault "$VAULT_NAME" \
        --title "service-account-token" \
        "credential[password]=$SA_TOKEN" > /dev/null

    # Write token to local file for container to read
    echo "$SA_TOKEN" > "$(dirname "$0")/../.op-token"
    echo "✓ Service account created (token saved in vault and .op-token)"
fi

# Also write vault name for container
echo "$VAULT_NAME" > "$(dirname "$0")/../.op-vault"

# Store GitHub CLI token in 1Password (if gh is available and authenticated)
echo ""
if command -v gh &> /dev/null; then
    GH_TOKEN=$(gh auth token 2>/dev/null) || true
    if [ -n "$GH_TOKEN" ]; then
        if op item get "github-cli-token" --vault "$VAULT_NAME" &> /dev/null; then
            op item edit "github-cli-token" --vault "$VAULT_NAME" \
                "credential[password]=$GH_TOKEN" > /dev/null
            echo "✓ GitHub CLI token updated in 1Password"
        else
            op item create --category "API Credential" --vault "$VAULT_NAME" \
                --title "github-cli-token" \
                "credential[password]=$GH_TOKEN" > /dev/null
            echo "✓ GitHub CLI token stored in 1Password"
        fi
    else
        echo "⚠ gh CLI installed but not authenticated, skipping GitHub token"
    fi
else
    echo "⚠ gh CLI not found on host, skipping GitHub token"
fi

echo ""
echo "=== 1Password setup complete ==="
