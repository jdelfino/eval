#!/bin/bash
# setup-secrets.sh - Load secrets from 1Password into .env.local
# Runs via postStartCommand (every container start)
#
# Add 1Password references to .env.1password, then this script will inject them.
set -e

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    echo "Note: OP_SERVICE_ACCOUNT_TOKEN not set, skipping secrets injection"
    exit 0
fi

export OP_VAULT="eval-dev"

if [ -f ".env.1password" ] && [ -s ".env.1password" ]; then
    echo "Loading secrets from 1Password..."
    envsubst < .env.1password | op inject -o .env.local
    echo "Secrets loaded into .env.local"
fi

# Export GH_TOKEN to shell profile so gh CLI works in all sessions
GH_TOKEN_VAL=$(op read "op://${OP_VAULT}/github-cli-token/credential" 2>/dev/null) || true
if [ -n "$GH_TOKEN_VAL" ]; then
    GH_EXPORT="export GH_TOKEN='${GH_TOKEN_VAL}'"
    for rcfile in ~/.bashrc ~/.zshrc; do
        if [ -f "$rcfile" ] || [ "$rcfile" = ~/.bashrc ]; then
            if ! grep -q "export GH_TOKEN=" "$rcfile" 2>/dev/null; then
                echo "$GH_EXPORT" >> "$rcfile"
            else
                sed -i "s|^export GH_TOKEN=.*|${GH_EXPORT}|" "$rcfile"
            fi
        fi
    done
    export GH_TOKEN="$GH_TOKEN_VAL"
    echo "GH_TOKEN exported to shell profile"
fi

# Terraform secrets
TF_SECRETS_TEMPLATE="infrastructure/terraform/environments/prod/secrets.tfvars.1password"
TF_SECRETS_OUTPUT="infrastructure/terraform/environments/prod/secrets.tfvars"
if [ -f "$TF_SECRETS_TEMPLATE" ] && [ -s "$TF_SECRETS_TEMPLATE" ]; then
    echo "Loading Terraform secrets from 1Password..."
    envsubst < "$TF_SECRETS_TEMPLATE" | op inject -o "$TF_SECRETS_OUTPUT"
    echo "Terraform secrets loaded into $TF_SECRETS_OUTPUT"
fi

echo ""
echo "========================================"
echo "  ✅ eval is ready!"
echo "  Run: devpod ssh eval"
echo "========================================"
echo ""
