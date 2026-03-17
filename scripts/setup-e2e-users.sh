#!/usr/bin/env bash
# setup-e2e-users.sh — Idempotent E2E test user setup for staging Identity Platform tenant.
#
# Ensures a list of test user accounts exist in a GCP Identity Platform tenant.
# Safe to run multiple times — existing users are skipped.
#
# Usage:
#   PROJECT_ID=my-project \
#   TENANT_ID=my-tenant-abc123 \
#   E2E_PASSWORD=secret \
#   ./scripts/setup-e2e-users.sh
#
# Required environment variables:
#   PROJECT_ID    — GCP project ID
#   TENANT_ID     — Identity Platform tenant ID (scopes users away from production)
#   E2E_PASSWORD  — shared password for all test users
#
# Optional environment variables:
#   E2E_USERS     — JSON array of email strings to ensure exist.
#                   Defaults to a representative set covering all E2E test roles.
#                   Generate the real list by running Playwright with --list and
#                   extracting the emails produced by the test fixture.
#   IDP_API_KEY   — Identity Platform API key for public endpoints (signIn/signUp).
#                   Auto-fetched via gcloud if not set.
#
# Dependencies: curl, jq, gcloud (only if IDP_API_KEY is not set)

set -euo pipefail

# ── Validate required env vars ───────────────────────────────────────────────

MISSING=()
[[ -z "${PROJECT_ID:-}" ]]   && MISSING+=("PROJECT_ID")
[[ -z "${TENANT_ID:-}" ]]    && MISSING+=("TENANT_ID")
[[ -z "${E2E_PASSWORD:-}" ]] && MISSING+=("E2E_PASSWORD")

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  echo "ERROR: Missing required environment variables: ${MISSING[*]}" >&2
  echo "Usage: PROJECT_ID=<id> TENANT_ID=<id> E2E_PASSWORD=<pw> $0" >&2
  exit 1
fi

# ── Default user list ────────────────────────────────────────────────────────
# This list covers the roles used across all E2E spec files.
# The exact emails depend on Playwright's testId hashes (derived from test file
# path + title). To generate the canonical list, run:
#   cd frontend && npx playwright test --list 2>/dev/null \
#     | grep -oE '[a-z]+-[a-z0-9-]+@test\.local' | sort -u
DEFAULT_E2E_USERS='[
  "emulator-admin@test.local",
  "instructor@test.local",
  "student@test.local",
  "student2@test.local"
]'

E2E_USERS="${E2E_USERS:-${DEFAULT_E2E_USERS}}"

# ── Resolve API key ──────────────────────────────────────────────────────────

if [[ -z "${IDP_API_KEY:-}" ]]; then
  echo "IDP_API_KEY not set — fetching from gcloud..."
  IDP_API_KEY="$(gcloud identity-platform config describe \
    --project="${PROJECT_ID}" \
    --format='value(client.apiKey)')"
  if [[ -z "$IDP_API_KEY" ]]; then
    echo "ERROR: Could not fetch IDP API key via gcloud" >&2
    exit 1
  fi
  echo "Fetched API key (length ${#IDP_API_KEY})"
fi

IDP_BASE="https://identitytoolkit.googleapis.com/v1"

# ── Process each user ────────────────────────────────────────────────────────

ERRORS=0
EMAILS=()

# Parse the JSON array into a bash array
while IFS= read -r email; do
  EMAILS+=("$email")
done < <(echo "$E2E_USERS" | jq -r '.[]')

if [[ "${#EMAILS[@]}" -eq 0 ]]; then
  echo "ERROR: E2E_USERS parsed to an empty list" >&2
  exit 1
fi

echo "Processing ${#EMAILS[@]} user(s) in tenant ${TENANT_ID} (project ${PROJECT_ID})..."
echo ""

for email in "${EMAILS[@]}"; do
  # ── Step 1: Try signInWithPassword to check if user exists ────────────────
  signin_response="$(mktemp)"
  signin_body="$(jq -n \
    --arg email "$email" \
    --arg password "$E2E_PASSWORD" \
    --arg tenant "$TENANT_ID" \
    '{email: $email, password: $password, returnSecureToken: true, tenantId: $tenant}')"

  signin_code="$(curl -s \
    -o "$signin_response" \
    -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$signin_body" \
    "${IDP_BASE}/accounts:signInWithPassword?key=${IDP_API_KEY}")"

  if [[ "$signin_code" == "200" ]]; then
    echo "SKIP: ${email} (already exists)"
    rm -f "$signin_response"
    continue
  fi

  # Check if the failure is because the user doesn't exist
  signin_body_text="$(cat "$signin_response")"
  rm -f "$signin_response"

  if ! echo "$signin_body_text" | grep -qE "EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS"; then
    # Unexpected error on sign-in — not a "user not found" situation
    echo "ERROR: ${email}: unexpected sign-in response (HTTP ${signin_code}): ${signin_body_text}" >&2
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # ── Step 2: Create user via admin API ─────────────────────────────────────
  access_token="$(gcloud auth print-access-token)"
  create_response="$(mktemp)"
  create_body="$(jq -n \
    --arg email "$email" \
    --arg password "$E2E_PASSWORD" \
    '{email: $email, password: $password, emailVerified: true}')"

  create_code="$(curl -s \
    -o "$create_response" \
    -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "$create_body" \
    "${IDP_BASE}/projects/${PROJECT_ID}/tenants/${TENANT_ID}/accounts")"

  if [[ "$create_code" -ge 200 && "$create_code" -lt 300 ]]; then
    echo "CREATED: ${email}"
  else
    create_body_text="$(cat "$create_response")"
    echo "ERROR: ${email}: signUp failed (HTTP ${create_code}): ${create_body_text}" >&2
    ERRORS=$((ERRORS + 1))
  fi
  rm -f "$create_response"
done

echo ""
if [[ "$ERRORS" -gt 0 ]]; then
  echo "Completed with ${ERRORS} error(s)."
  exit 1
fi

echo "All users processed successfully."
exit 0
