#!/usr/bin/env bash
# seed-staging.sh — Idempotent staging environment seeder.
#
# Seeds staging with test data using the app's own API endpoints.
# This ensures correct auth linking (external_id matches IDP UID) and
# exercises the real registration flows.
#
# Usage:
#   PROJECT_ID=my-project \
#   TENANT_ID=my-tenant-abc123 \
#   E2E_PASSWORD=secret \
#   API_BASE_URL=https://staging.eval.example.com \
#   BOOTSTRAP_ADMIN_EMAIL=staging-admin@test.local \
#   ./scripts/seed-staging.sh
#
# Required environment variables:
#   PROJECT_ID             — GCP project ID
#   TENANT_ID              — Identity Platform tenant ID
#   E2E_PASSWORD           — Shared password for all test users
#   API_BASE_URL           — Staging API base URL (no trailing slash)
#   BOOTSTRAP_ADMIN_EMAIL  — Admin email matching go-api's BOOTSTRAP_ADMIN_EMAIL
#
# Optional environment variables:
#   IDP_API_KEY  — Identity Platform API key (auto-fetched via gcloud if not set)
#
# Dependencies: curl, jq, gcloud

set -euo pipefail

# ── Validate required env vars ───────────────────────────────────────────────

MISSING=()
[[ -z "${PROJECT_ID:-}" ]]            && MISSING+=("PROJECT_ID")
[[ -z "${TENANT_ID:-}" ]]             && MISSING+=("TENANT_ID")
[[ -z "${E2E_PASSWORD:-}" ]]          && MISSING+=("E2E_PASSWORD")
[[ -z "${API_BASE_URL:-}" ]]          && MISSING+=("API_BASE_URL")
[[ -z "${BOOTSTRAP_ADMIN_EMAIL:-}" ]] && MISSING+=("BOOTSTRAP_ADMIN_EMAIL")

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  echo "ERROR: Missing required environment variables: ${MISSING[*]}" >&2
  echo "Usage: PROJECT_ID=<id> TENANT_ID=<id> E2E_PASSWORD=<pw> API_BASE_URL=<url> BOOTSTRAP_ADMIN_EMAIL=<email> $0" >&2
  exit 1
fi

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

# ── Helper functions ─────────────────────────────────────────────────────────

# ensure_idp_user <email> — create IDP user if it doesn't already exist.
ensure_idp_user() {
  local email="$1"

  # Try sign-in to check existence
  local signin_response
  signin_response="$(mktemp)"
  local signin_body
  signin_body="$(jq -n \
    --arg email "$email" \
    --arg password "$E2E_PASSWORD" \
    --arg tenant "$TENANT_ID" \
    '{email: $email, password: $password, returnSecureToken: true, tenantId: $tenant}')"

  local signin_code
  signin_code="$(curl -s -o "$signin_response" -w '%{http_code}' \
    -X POST -H "Content-Type: application/json" \
    -d "$signin_body" \
    "${IDP_BASE}/accounts:signInWithPassword?key=${IDP_API_KEY}")"
  rm -f "$signin_response"

  if [[ "$signin_code" == "200" ]]; then
    echo "    IDP user exists: ${email}"
    return 0
  fi

  # Create via admin API
  local access_token
  access_token="$(gcloud auth print-access-token)"
  local create_response
  create_response="$(mktemp)"
  local create_body
  create_body="$(jq -n \
    --arg email "$email" \
    --arg password "$E2E_PASSWORD" \
    '{email: $email, password: $password, emailVerified: true}')"

  local create_code
  create_code="$(curl -s -o "$create_response" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "$create_body" \
    "${IDP_BASE}/projects/${PROJECT_ID}/tenants/${TENANT_ID}/accounts")"

  if [[ "$create_code" -ge 200 && "$create_code" -lt 300 ]]; then
    echo "    IDP user created: ${email}"
  else
    echo "ERROR: Failed to create IDP user ${email} (HTTP ${create_code}): $(cat "$create_response")" >&2
    rm -f "$create_response"
    return 1
  fi
  rm -f "$create_response"
}

# idp_sign_in <email> → prints idToken on stdout, exits non-zero on failure
idp_sign_in() {
  local email="$1"
  local response_file
  response_file="$(mktemp)"

  local body
  body="$(jq -n \
    --arg email "$email" \
    --arg password "$E2E_PASSWORD" \
    --arg tenant "$TENANT_ID" \
    '{email: $email, password: $password, returnSecureToken: true, tenantId: $tenant}')"

  local http_code
  http_code="$(curl -s \
    -o "$response_file" \
    -w '%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${IDP_BASE}/accounts:signInWithPassword?key=${IDP_API_KEY}")"

  if [[ "$http_code" != "200" ]]; then
    echo "ERROR: IDP sign-in failed for ${email} (HTTP ${http_code}): $(cat "$response_file")" >&2
    rm -f "$response_file"
    return 1
  fi

  local token
  token="$(jq -r '.idToken' "$response_file")"
  rm -f "$response_file"

  if [[ -z "$token" || "$token" == "null" ]]; then
    echo "ERROR: IDP sign-in returned empty idToken for ${email}" >&2
    return 1
  fi

  echo "$token"
}

# Temp file used to pass HTTP status code out of api_call subshells.
# Must be set before calling api_call for the first time.
_API_STATUS_FILE="$(mktemp)"

# api_call <method> <path> [body] [token]
# Prints response body on stdout.
# Writes HTTP status code to $_API_STATUS_FILE so callers can read API_STATUS.
# Usage:
#   response="$(api_call GET /api/v1/foo "" "$token")"
#   read_api_status   # sets API_STATUS from file
api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"

  local url="${API_BASE_URL}${path}"
  local response_file
  response_file="$(mktemp)"

  local curl_args=(-s -o "$response_file" -w '%{http_code}' -X "$method")

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer ${token}")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local http_code
  http_code="$(curl "${curl_args[@]}" "$url")"
  # Write status to file so it survives subshell boundary
  echo "$http_code" > "$_API_STATUS_FILE"

  local response_body
  response_body="$(cat "$response_file")"
  rm -f "$response_file"

  echo "$response_body"
}

# read_api_status sets API_STATUS from the status file written by api_call.
# Call this immediately after each api_call invocation.
API_STATUS=""
read_api_status() {
  API_STATUS="$(cat "$_API_STATUS_FILE" 2>/dev/null || echo "")"
}

# ── Step 2: Sign in as admin ─────────────────────────────────────────────────

echo ""
echo "==> Step 2: Sign in as admin (${BOOTSTRAP_ADMIN_EMAIL})"
ensure_idp_user "$BOOTSTRAP_ADMIN_EMAIL"
ADMIN_TOKEN="$(idp_sign_in "$BOOTSTRAP_ADMIN_EMAIL")"
echo "    Admin sign-in OK"

# ── Step 3: Bootstrap admin user ─────────────────────────────────────────────

echo ""
echo "==> Step 3: Bootstrap admin user"
bootstrap_response="$(api_call POST /api/v1/auth/bootstrap "" "$ADMIN_TOKEN")"
read_api_status
if [[ "$API_STATUS" == "409" ]]; then
  echo "    Already bootstrapped — skipping"
elif [[ "$API_STATUS" -ge 200 && "$API_STATUS" -lt 300 ]]; then
  echo "    Bootstrap OK"
else
  echo "ERROR: Bootstrap failed (HTTP ${API_STATUS}): ${bootstrap_response}" >&2
  exit 1
fi

# ── Step 4: Create namespace ──────────────────────────────────────────────────

echo ""
echo "==> Step 4: Create namespace test-school"
ns_body='{"id":"test-school","display_name":"Test School"}'
ns_response="$(api_call POST /api/v1/namespaces "$ns_body" "$ADMIN_TOKEN")"
read_api_status
if [[ "$API_STATUS" == "409" ]]; then
  echo "    Namespace already exists — skipping"
elif [[ "$API_STATUS" -ge 200 && "$API_STATUS" -lt 300 ]]; then
  echo "    Namespace created"
else
  echo "ERROR: Namespace create failed (HTTP ${API_STATUS}): ${ns_response}" >&2
  exit 1
fi

# ── Step 5: Ensure instructor is set up ──────────────────────────────────────

echo ""
echo "==> Step 5: Ensure instructor is set up"
INSTRUCTOR_EMAIL="instructor@test.local"
ensure_idp_user "$INSTRUCTOR_EMAIL"
INSTRUCTOR_TOKEN="$(idp_sign_in "$INSTRUCTOR_EMAIL")"

# Check if instructor is already registered by calling GET /auth/me
me_response="$(api_call GET /api/v1/auth/me "" "$INSTRUCTOR_TOKEN")"
read_api_status
if [[ "$API_STATUS" == "200" ]]; then
  echo "    Instructor already registered — skipping invitation flow"
else
  echo "    Instructor not registered — creating invitation"

  # Create system invitation
  invite_body="$(jq -n \
    --arg email "$INSTRUCTOR_EMAIL" \
    '{email: $email, target_role: "instructor", namespace_id: "test-school"}')"
  invite_response="$(api_call POST /api/v1/system/invitations "$invite_body" "$ADMIN_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create invitation failed (HTTP ${API_STATUS}): ${invite_response}" >&2
    exit 1
  fi

  INVITATION_ID="$(echo "$invite_response" | jq -r '.id')"
  if [[ -z "$INVITATION_ID" || "$INVITATION_ID" == "null" ]]; then
    echo "ERROR: Could not extract invitation ID from response: ${invite_response}" >&2
    exit 1
  fi
  echo "    Invitation created (ID: ${INVITATION_ID})"

  # Accept invitation as instructor
  accept_body="$(jq -n \
    --arg token "$INVITATION_ID" \
    '{token: $token, display_name: "Test Instructor"}')"
  accept_response="$(api_call POST /api/v1/auth/accept-invite "$accept_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Accept invitation failed (HTTP ${API_STATUS}): ${accept_response}" >&2
    exit 1
  fi
  echo "    Invitation accepted — instructor registered"
fi

# ── Step 6: Create class (idempotent) ────────────────────────────────────────

echo ""
echo "==> Step 6: Create class"
CLASS_NAME="CS 101 - Introduction to Programming"

# List existing classes
classes_response="$(api_call GET /api/v1/classes "" "$INSTRUCTOR_TOKEN")"
read_api_status
if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
  echo "ERROR: List classes failed (HTTP ${API_STATUS}): ${classes_response}" >&2
  exit 1
fi

# Check if class already exists
CLASS_ID="$(echo "$classes_response" | jq -r \
  --arg name "$CLASS_NAME" \
  '.[] | select(.name == $name) | .id' | head -1)"

if [[ -n "$CLASS_ID" ]]; then
  echo "    Class already exists (ID: ${CLASS_ID}) — skipping"
else
  class_body="$(jq -n \
    --arg name "$CLASS_NAME" \
    '{name: $name, description: "Learn the basics of Python programming"}')"
  class_response="$(api_call POST /api/v1/classes "$class_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create class failed (HTTP ${API_STATUS}): ${class_response}" >&2
    exit 1
  fi
  CLASS_ID="$(echo "$class_response" | jq -r '.id')"
  echo "    Class created (ID: ${CLASS_ID})"
fi

# ── Step 7: Create section (idempotent) ──────────────────────────────────────

echo ""
echo "==> Step 7: Create section"
SECTION_NAME="Section A"

# List existing sections for this class
sections_response="$(api_call GET "/api/v1/classes/${CLASS_ID}/sections" "" "$INSTRUCTOR_TOKEN")"
read_api_status
if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
  echo "ERROR: List sections failed (HTTP ${API_STATUS}): ${sections_response}" >&2
  exit 1
fi

SECTION_ID=""
JOIN_CODE=""

SECTION_ID="$(echo "$sections_response" | jq -r \
  --arg name "$SECTION_NAME" \
  '.[] | select(.name == $name) | .id' | head -1)"

if [[ -n "$SECTION_ID" ]]; then
  JOIN_CODE="$(echo "$sections_response" | jq -r \
    --arg name "$SECTION_NAME" \
    '.[] | select(.name == $name) | .join_code' | head -1)"
  echo "    Section already exists (ID: ${SECTION_ID}, join_code: ${JOIN_CODE}) — skipping"
else
  section_body="$(jq -n \
    --arg name "$SECTION_NAME" \
    '{name: $name, semester: "Spring 2026"}')"
  section_response="$(api_call POST "/api/v1/classes/${CLASS_ID}/sections" "$section_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create section failed (HTTP ${API_STATUS}): ${section_response}" >&2
    exit 1
  fi
  SECTION_ID="$(echo "$section_response" | jq -r '.id')"
  JOIN_CODE="$(echo "$section_response" | jq -r '.join_code')"
  echo "    Section created (ID: ${SECTION_ID}, join_code: ${JOIN_CODE})"
fi

if [[ -z "$JOIN_CODE" || "$JOIN_CODE" == "null" ]]; then
  echo "ERROR: Could not obtain join_code for section" >&2
  exit 1
fi

# ── Step 8: Create problems (idempotent) ─────────────────────────────────────

echo ""
echo "==> Step 8: Create problems"

# List existing problems
problems_response="$(api_call GET /api/v1/problems "" "$INSTRUCTOR_TOKEN")"
read_api_status
if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
  echo "ERROR: List problems failed (HTTP ${API_STATUS}): ${problems_response}" >&2
  exit 1
fi

# Problem 1: Hello World
HELLO_WORLD_TITLE="Hello World"
HELLO_WORLD_ID="$(echo "$problems_response" | jq -r \
  --arg title "$HELLO_WORLD_TITLE" \
  '.[] | select(.title == $title) | .id' | head -1)"

if [[ -n "$HELLO_WORLD_ID" ]]; then
  echo "    Problem '${HELLO_WORLD_TITLE}' already exists (ID: ${HELLO_WORLD_ID}) — skipping"
else
  hw_body="$(jq -n \
    --arg class_id "$CLASS_ID" \
    '{
      title: "Hello World",
      description: "# Hello World\n\nWrite a program that prints \"Hello, World!\" to the console.\n\n## Instructions\n\n1. Use the `print()` function\n2. Make sure to spell it exactly right\n\n## Example Output\n\n```\nHello, World!\n```",
      starter_code: "# Write your code below\nprint(\"Hello, World!\")",
      class_id: $class_id,
      language: "python"
    }')"
  hw_response="$(api_call POST /api/v1/problems "$hw_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create problem 'Hello World' failed (HTTP ${API_STATUS}): ${hw_response}" >&2
    exit 1
  fi
  HELLO_WORLD_ID="$(echo "$hw_response" | jq -r '.id')"
  echo "    Problem '${HELLO_WORLD_TITLE}' created (ID: ${HELLO_WORLD_ID})"
fi

# Problem 2: Sum Two Numbers
SUM_TITLE="Sum Two Numbers"
SUM_ID="$(echo "$problems_response" | jq -r \
  --arg title "$SUM_TITLE" \
  '.[] | select(.title == $title) | .id' | head -1)"

if [[ -n "$SUM_ID" ]]; then
  echo "    Problem '${SUM_TITLE}' already exists (ID: ${SUM_ID}) — skipping"
else
  sum_body="$(jq -n \
    --arg class_id "$CLASS_ID" \
    '{
      title: "Sum Two Numbers",
      description: "# Sum Two Numbers\n\nWrite a program that reads two numbers from input and prints their sum.\n\n## Instructions\n\n1. Use `input()` to read two numbers\n2. Convert them to integers using `int()`\n3. Print the sum\n\n## Example\n\nInput:\n```\n5\n3\n```\n\nOutput:\n```\n8\n```",
      starter_code: "# Read two numbers and print their sum\na = int(input())\nb = int(input())\nprint(a + b)",
      class_id: $class_id,
      language: "python"
    }')"
  sum_response="$(api_call POST /api/v1/problems "$sum_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create problem 'Sum Two Numbers' failed (HTTP ${API_STATUS}): ${sum_response}" >&2
    exit 1
  fi
  SUM_ID="$(echo "$sum_response" | jq -r '.id')"
  echo "    Problem '${SUM_TITLE}' created (ID: ${SUM_ID})"
fi

# ── Step 9: Register students ────────────────────────────────────────────────

echo ""
echo "==> Step 9: Register students"

register_student() {
  local email="$1"
  local display_name="$2"

  echo "    Registering ${email} as '${display_name}'"
  local student_token
  student_token="$(idp_sign_in "$email")"

  local reg_body
  reg_body="$(jq -n \
    --arg join_code "$JOIN_CODE" \
    --arg display_name "$display_name" \
    '{join_code: $join_code, display_name: $display_name}')"
  local reg_response
  reg_response="$(api_call POST /api/v1/auth/register-student "$reg_body" "$student_token")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Register student '${email}' failed (HTTP ${API_STATUS}): ${reg_response}" >&2
    return 1
  fi
  echo "    Student '${display_name}' registered"
}

ensure_idp_user "student@test.local"
ensure_idp_user "student2@test.local"
register_student "student@test.local" "Alice Student"
register_student "student2@test.local" "Bob Student"

# ── Step 10: Start session (idempotent) ──────────────────────────────────────

echo ""
echo "==> Step 10: Start session"

# List existing sessions
sessions_response="$(api_call GET /api/v1/sessions "" "$INSTRUCTOR_TOKEN")"
read_api_status
if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
  echo "ERROR: List sessions failed (HTTP ${API_STATUS}): ${sessions_response}" >&2
  exit 1
fi

# Check if an active session already exists
active_session_id="$(echo "$sessions_response" | jq -r \
  '.[] | select(.status == "active") | .id' | head -1)"

if [[ -n "$active_session_id" ]]; then
  echo "    Active session already exists (ID: ${active_session_id}) — skipping"
else
  session_body="$(jq -n \
    --arg section_id "$SECTION_ID" \
    --arg problem_id "$SUM_ID" \
    '{section_id: $section_id, problem_id: $problem_id}')"
  session_response="$(api_call POST /api/v1/sessions "$session_body" "$INSTRUCTOR_TOKEN")"
  read_api_status
  if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
    echo "ERROR: Create session failed (HTTP ${API_STATUS}): ${session_response}" >&2
    exit 1
  fi
  session_id="$(echo "$session_response" | jq -r '.id')"
  echo "    Session started (ID: ${session_id})"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Staging seed complete."
exit 0
