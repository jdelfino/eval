#!/bin/bash
# Initialize 1Password vault for this project (runs on HOST via initializeCommand)
# Requires: op CLI installed and signed in on host

set -e

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

# Check/create SSH key
if op item list --vault "$VAULT_NAME" --tags devcontainer --categories "SSH Key" --format json 2>/dev/null | grep -q '"id"'; then
    echo "✓ SSH key exists (tagged 'devcontainer')"
else
    echo ""
    echo "Generating SSH key for eval..."

    # Let 1Password generate the SSH key (creates proper SSH Key item)
    op item create --category ssh --vault "$VAULT_NAME" \
        --title "devcontainer-ssh-key" \
        --tags "devcontainer" > /dev/null

    echo "✓ SSH key generated in 1Password"
fi

# Ensure SSH key is in GitHub (check every run in case gh wasn't authenticated before)
if gh auth status &>/dev/null; then
    PUBLIC_KEY=$(op read "op://${VAULT_NAME}/devcontainer-ssh-key/public key")
    # Check if this key is already in GitHub
    if ! gh ssh-key list 2>/dev/null | grep -q "eval-devcontainer"; then
        echo "Adding public key to GitHub..."
        echo "$PUBLIC_KEY" | gh ssh-key add - --title "eval-devcontainer"
        echo "✓ SSH key added to GitHub"
    else
        echo "✓ SSH key already in GitHub"
    fi
fi

# Check/create git-config
if op item get "git-config" --vault "$VAULT_NAME" &> /dev/null; then
    echo "✓ git-config exists"
else
    echo ""
    GIT_NAME=$(git config --global user.name 2>/dev/null || echo "")
    GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")

    if [ -n "$GIT_NAME" ] && [ -n "$GIT_EMAIL" ]; then
        echo "Creating git-config from local git settings..."
        op item create --category "Secure Note" --vault "$VAULT_NAME" \
            --title "git-config" \
            "name[text]=$GIT_NAME" \
            "email[text]=$GIT_EMAIL"
        echo "✓ git-config created (name: $GIT_NAME, email: $GIT_EMAIL)"
    else
        echo "Creating git-config (please edit in 1Password)..."
        op item create --category "Secure Note" --vault "$VAULT_NAME" \
            --title "git-config" \
            "name[text]=Your Name" \
            "email[text]=your@email.com"
        echo "⚠ git-config created with placeholders - edit in 1Password!"
    fi
fi

# Check/create github-pat
if op item get "github-pat" --vault "$VAULT_NAME" &> /dev/null; then
    echo "✓ github-pat exists"
else
    echo ""
    # Try to get token from gh CLI if authenticated
    if gh auth status &>/dev/null; then
        GH_TOKEN=$(gh auth token 2>/dev/null)
        if [ -n "$GH_TOKEN" ]; then
            echo "Creating github-pat from gh CLI..."
            op item create --category "API Credential" --vault "$VAULT_NAME" \
                --title "github-pat" \
                "credential[password]=$GH_TOKEN" > /dev/null
            echo "✓ github-pat created from host gh CLI"
        fi
    fi

    # If still no github-pat, create placeholder
    if ! op item get "github-pat" --vault "$VAULT_NAME" &> /dev/null; then
        echo "Creating github-pat placeholder..."
        op item create --category "API Credential" --vault "$VAULT_NAME" \
            --title "github-pat" \
            "credential[password]=paste-your-github-pat-here" > /dev/null
        echo "⚠ github-pat created with placeholder"
        echo "  1. Create a token at: https://github.com/settings/tokens"
        echo "  2. Required scopes: repo"
        echo "  3. Edit 'github-pat' in 1Password and paste the token"
    fi
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

echo ""
echo "=== 1Password setup complete ==="
