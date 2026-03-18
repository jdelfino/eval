#!/bin/bash
# setup-github-app.sh - Generate GitHub App installation token for Claude
# Runs via postStartCommand (every container start)
#
# The app token scopes Claude's git/gh access to only the installed repos
# with only the granted permissions. This is safer than a personal PAT.
#
# Required 1Password item (in $OP_VAULT):
#   - github-app: Secure note with fields: app-id, installation-id, private-key
set -e

WORKSPACE_DIR="${WORKSPACE_DIR:-$(pwd)}"

# Load 1Password token if needed
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ -f "$WORKSPACE_DIR/.op-token" ]; then
    export OP_SERVICE_ACCOUNT_TOKEN=$(cat "$WORKSPACE_DIR/.op-token")
fi

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    echo "ERROR: OP_SERVICE_ACCOUNT_TOKEN not set, cannot generate GitHub App token"
    exit 1
fi

# Load vault
if [ -z "${OP_VAULT:-}" ] && [ -f "$WORKSPACE_DIR/.op-vault" ]; then
    export OP_VAULT=$(cat "$WORKSPACE_DIR/.op-vault")
fi
export OP_VAULT="${OP_VAULT:-eval-dev}"

# Fetch app credentials from 1Password (single secure note with 3 fields)
APP_ID=$(op read "op://${OP_VAULT}/claudebot-github-app/app-id")
INSTALLATION_ID=$(op read "op://${OP_VAULT}/claudebot-github-app/installation-id")
PRIVATE_KEY=$(op read "op://${OP_VAULT}/claudebot-github-app/private-key")

if [ -z "$APP_ID" ] || [ -z "$INSTALLATION_ID" ] || [ -z "$PRIVATE_KEY" ]; then
    echo "ERROR: GitHub App credentials missing or incomplete in 1Password"
    echo "  Expected: 'claudebot-github-app' in vault '${OP_VAULT}' with fields: app-id, installation-id, private-key"
    exit 1
fi

# Generate JWT (valid for 10 minutes, used only to get an installation token)
NOW=$(date +%s)
IAT=$((NOW - 60))
EXP=$((NOW + 600))

HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
PAYLOAD=$(echo -n "{\"iat\":${IAT},\"exp\":${EXP},\"iss\":\"${APP_ID}\"}" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

SIGNATURE=$(echo -n "${HEADER}.${PAYLOAD}" | \
    openssl dgst -sha256 -sign <(echo "$PRIVATE_KEY") -binary | \
    openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

# Exchange JWT for an installation token (valid for 1 hour)
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${JWT}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens")

TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to generate GitHub App installation token"
    echo "Response: $RESPONSE"
    exit 1
fi

# Persist token for use by Claude
echo "$TOKEN" > "$WORKSPACE_DIR/.gh-app-token"
chmod 600 "$WORKSPACE_DIR/.gh-app-token"

# Configure git to use the app token for this repo
git config url."https://x-access-token:${TOKEN}@github.com/".insteadOf "https://github.com/"

# Wire up shell profile so GH_TOKEN uses the app token in new shells
# (the session-start hook runs this script, but exports don't propagate
# to subsequent Bash tool calls — shell profile is the only way)
PROFILE_LINE="# GitHub App token for agent identity
if [ -f \"$WORKSPACE_DIR/.gh-app-token\" ]; then
    export GH_TOKEN=\$(cat \"$WORKSPACE_DIR/.gh-app-token\")
fi"

for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$rc" ] && ! grep -qF "gh-app-token" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "$PROFILE_LINE" >> "$rc"
    fi
done

echo "GitHub App token generated (expires in 1 hour)"
