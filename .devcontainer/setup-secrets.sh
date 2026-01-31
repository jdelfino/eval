#!/bin/bash
# setup-secrets.sh - Load secrets from 1Password into .env.local
# Runs via postStartCommand (every container start)
#
# Add 1Password references to .env.1password, then this script will inject them.
set -e

# Load token from file if env var not set
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ -f ".op-token" ]; then
    export OP_SERVICE_ACCOUNT_TOKEN=$(cat .op-token)
fi

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    echo "Note: OP_SERVICE_ACCOUNT_TOKEN not set, skipping secrets injection"
    exit 0
fi

# Load vault from file, with fallback
if [ -z "${OP_VAULT:-}" ] && [ -f ".op-vault" ]; then
    export OP_VAULT=$(cat .op-vault)
fi
export OP_VAULT="${OP_VAULT:-eval-dev}"

if [ -f ".env.1password" ] && [ -s ".env.1password" ]; then
    echo "Loading secrets from 1Password..."
    envsubst < .env.1password | op inject -f -o .env.local
    echo "Secrets loaded into .env.local"
fi

# Terraform secrets
TF_SECRETS_TEMPLATE="infrastructure/terraform/environments/prod/secrets.tfvars.1password"
TF_SECRETS_OUTPUT="infrastructure/terraform/environments/prod/secrets.tfvars"
if [ -f "$TF_SECRETS_TEMPLATE" ] && [ -s "$TF_SECRETS_TEMPLATE" ]; then
    echo "Loading Terraform secrets from 1Password..."
    envsubst < "$TF_SECRETS_TEMPLATE" | op inject -f -o "$TF_SECRETS_OUTPUT"
    echo "Terraform secrets loaded into $TF_SECRETS_OUTPUT"
fi

# GH_TOKEN is handled by setup.sh (file-based, like OP_SERVICE_ACCOUNT_TOKEN)

echo ""
echo "========================================"
echo "  eval is ready!"
echo "  Run: devpod ssh eval"
echo "========================================"
echo ""
