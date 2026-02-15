#!/usr/bin/env bash
set -euo pipefail

# Post-deploy smoke tests for production.
# Verifies all services are responding through the ingress, frontend config
# is properly injected, and authentication works end-to-end.
#
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# Environment:
#   SMOKE_TEST_URL      (default: https://eval.delquillan.com)
#   SMOKE_TEST_TIMEOUT  (default: 90)  — max seconds to wait per check
#   SMOKE_TEST_INTERVAL (default: 5)   — seconds between retries
#   GCP_PROJECT_ID      — required for auth test (skipped if absent)

BASE_URL="${1:-${SMOKE_TEST_URL:-https://eval.delquillan.com}}"
TIMEOUT="${SMOKE_TEST_TIMEOUT:-90}"
INTERVAL="${SMOKE_TEST_INTERVAL:-5}"
MAX_ATTEMPTS=$(( TIMEOUT / INTERVAL ))

TOTAL=0
FAILURES=()
SKIPPED=()

# --- Helpers ---

retry_check() {
  local description="$1"
  local url="$2"
  local check_fn="$3"  # function name to call with (http_code, body_file)

  TOTAL=$(( TOTAL + 1 ))
  echo "Checking ${description} at ${url} ..."
  local body_file
  body_file=$(mktemp)
  trap "rm -f '$body_file'" RETURN

  local http_code
  for i in $(seq 1 "$MAX_ATTEMPTS"); do
    http_code=$(curl -s -o "$body_file" -w '%{http_code}' "$url" 2>/dev/null || echo "000")

    if $check_fn "$http_code" "$body_file"; then
      echo "  PASS: ${description}"
      return 0
    fi

    echo "  Attempt ${i}/${MAX_ATTEMPTS} (HTTP ${http_code}), retrying in ${INTERVAL}s..."
    sleep "$INTERVAL"
  done

  echo "  FAIL: ${description} (last HTTP ${http_code})"
  FAILURES+=("$description")
  return 0  # don't exit early — test all checks
}

run_check() {
  local description="$1"
  local check_fn="$2"  # function name that handles its own HTTP calls

  TOTAL=$(( TOTAL + 1 ))
  echo "Checking ${description} ..."

  if $check_fn; then
    echo "  PASS: ${description}"
  else
    echo "  FAIL: ${description}"
    FAILURES+=("$description")
  fi
}

skip_check() {
  local description="$1"
  local reason="$2"
  TOTAL=$(( TOTAL + 1 ))
  SKIPPED+=("$description")
  echo "Checking ${description} ..."
  echo "  SKIP: ${reason}"
}

# --- Check functions ---

check_frontend() {
  local http_code="$1" body_file="$2"
  [[ "$http_code" == "200" ]] && grep -q '_next' "$body_file" 2>/dev/null
}

check_api() {
  local http_code="$1"
  [[ "$http_code" == "401" || "$http_code" == "403" ]]
}

check_centrifugo() {
  local http_code="$1"
  # Centrifugo is reachable if we get anything other than 502/503/504/000
  [[ "$http_code" != "000" && "$http_code" != "502" && "$http_code" != "503" && "$http_code" != "504" ]]
}

check_no_placeholders() {
  # Fetch all JS chunks linked from the frontend page and check for
  # unreplaced __NEXT_PUBLIC_*__ placeholders.
  local body_file
  body_file=$(mktemp)
  local http_code
  http_code=$(curl -s -o "$body_file" -w '%{http_code}' "${BASE_URL}/" 2>/dev/null || echo "000")

  if [[ "$http_code" != "200" ]]; then
    echo "  ERROR: Frontend returned HTTP ${http_code}"
    rm -f "$body_file"
    return 1
  fi

  # Check the HTML page itself
  if grep -qo '__NEXT_PUBLIC_[A-Z_]*__' "$body_file" 2>/dev/null; then
    echo "  ERROR: Found unreplaced placeholder(s) in frontend HTML:"
    grep -o '__NEXT_PUBLIC_[A-Z_]*__' "$body_file" | sort -u | while read -r p; do
      echo "    - $p"
    done
    rm -f "$body_file"
    return 1
  fi

  # Also check the JS chunks referenced in the page
  local js_urls
  js_urls=$(grep -oE '"/_next/static/[^"]*\.js"' "$body_file" | tr -d '"' | head -5)
  rm -f "$body_file"

  for js_path in $js_urls; do
    local js_body
    js_body=$(mktemp)
    curl -s -o "$js_body" "${BASE_URL}${js_path}" 2>/dev/null || continue

    if grep -qo '__NEXT_PUBLIC_[A-Z_]*__' "$js_body" 2>/dev/null; then
      echo "  ERROR: Found unreplaced placeholder(s) in ${js_path}:"
      grep -o '__NEXT_PUBLIC_[A-Z_]*__' "$js_body" | sort -u | while read -r p; do
        echo "    - $p"
      done
      rm -f "$js_body"
      return 1
    fi
    rm -f "$js_body"
  done

  return 0
}

# --- Executor sandbox tests ---
# Validates the nsjail sandbox is correctly configured in production.
# These checks can ONLY run in production — CI skips them because nsjail
# requires privileged mode + proper kernel capabilities.
#
# Uses kubectl exec + python3 to reach the executor service from inside the
# cluster. This works through Connect Gateway (unlike port-forward).

executor_curl() {
  # Runs a code-execution request against the executor service from inside
  # the cluster.  Uses an ephemeral pod + kubectl logs instead of kubectl exec,
  # because Connect Gateway does not support the WebSocket upgrade that exec
  # requires.
  local code="$1"
  local pod_name="smoke-exec-$$-${RANDOM}"

  # The pod needs the go-api label so the executor NetworkPolicy allows ingress.
  kubectl run "$pod_name" \
    --image=python:3.12-slim \
    --restart=Never \
    --labels=app=go-api \
    --override-type=merge \
    --overrides='{"spec":{"tolerations":[{"operator":"Exists"}]}}' \
    -- python3 -c "
import urllib.request, json, sys
payload = json.loads(sys.argv[1])
req = urllib.request.Request('http://executor:8081/execute',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        sys.stdout.write(r.read().decode())
except Exception as e:
    print(json.dumps({'error': str(e), 'success': False}))
    sys.exit(1)
" "$code" >/dev/null 2>&1 || {
    echo "  ERROR: failed to create smoke-test pod" >&2
    return 1
  }

  # Wait for the pod to finish (Succeeded or Failed), then grab logs.
  local phase=""
  for i in $(seq 1 30); do
    phase=$(kubectl get pod "$pod_name" -o jsonpath='{.status.phase}' 2>/dev/null)
    if [[ "$phase" == "Succeeded" || "$phase" == "Failed" ]]; then
      break
    fi
    sleep 2
  done

  local resp
  resp=$(kubectl logs "$pod_name" 2>/dev/null)
  kubectl delete pod "$pod_name" --ignore-not-found >/dev/null 2>&1 &

  if [[ "$phase" != "Succeeded" && "$phase" != "Failed" ]]; then
    echo "  ERROR: smoke-test pod did not complete (phase=${phase})" >&2
    return 1
  fi
  if [[ -z "$resp" ]]; then
    echo "  ERROR: empty response from executor" >&2
    return 1
  fi
  echo "$resp"
}

check_executor_execution() {
  local resp
  resp=$(executor_curl '{"code":"print(\"sandbox-ok\")"}') || return 1
  local success output
  success=$(echo "$resp" | jq -r '.success')
  output=$(echo "$resp" | jq -r '.output')
  if [[ "$success" != "true" || "$output" != *"sandbox-ok"* ]]; then
    echo "  ERROR: Expected successful execution, got success=${success} output=${output}"
    return 1
  fi
}

check_executor_timeout() {
  local resp
  resp=$(executor_curl '{"code":"import time; time.sleep(60)","timeout_ms":1000}') || return 1
  local success
  success=$(echo "$resp" | jq -r '.success')
  if [[ "$success" != "false" ]]; then
    echo "  ERROR: Expected timeout (success=false), got success=${success}"
    return 1
  fi
}

check_executor_network_isolation() {
  local resp
  resp=$(executor_curl '{"code":"import socket; s=socket.socket(); s.connect((\"8.8.8.8\",53)); print(\"CONNECTED\")"}') || return 1
  local success output
  success=$(echo "$resp" | jq -r '.success')
  output=$(echo "$resp" | jq -r '.output')
  if [[ "$success" == "true" && "$output" == *"CONNECTED"* ]]; then
    echo "  ERROR: Network should be blocked but code connected to external host"
    return 1
  fi
}

check_executor_filesystem_isolation() {
  local resp
  resp=$(executor_curl '{"code":"print(open(\"/etc/passwd\").read())"}') || return 1
  local success
  success=$(echo "$resp" | jq -r '.success')
  if [[ "$success" != "false" ]]; then
    echo "  ERROR: Should not be able to read /etc/passwd in sandbox"
    return 1
  fi
}

check_executor_memory_limit() {
  local resp
  resp=$(executor_curl '{"code":"x = \"A\" * (512 * 1024 * 1024); print(\"allocated\")"}') || {
    echo "  ERROR: executor_curl failed for memory limit test"
    return 1
  }
  local success output error_field
  success=$(echo "$resp" | jq -r '.success')
  output=$(echo "$resp" | jq -r '.output')
  error_field=$(echo "$resp" | jq -r '.error')
  if [[ "$success" == "true" && "$output" == *"allocated"* ]]; then
    echo "  ERROR: 512MB allocation should be blocked by memory limit"
    return 1
  fi
  echo "    memory limit enforced (success=${success}, error=${error_field})"
}

check_executor_sandbox() {
  local failed=0

  echo "  [1/5] Basic execution..."
  if check_executor_execution; then
    echo "    OK"
  else
    failed=1
  fi

  echo "  [2/5] Timeout enforcement..."
  if check_executor_timeout; then
    echo "    OK"
  else
    failed=1
  fi

  echo "  [3/5] Network isolation..."
  if check_executor_network_isolation; then
    echo "    OK"
  else
    failed=1
  fi

  echo "  [4/5] Filesystem isolation..."
  if check_executor_filesystem_isolation; then
    echo "    OK"
  else
    failed=1
  fi

  echo "  [5/5] Memory limit..."
  if check_executor_memory_limit; then
    echo "    OK"
  else
    failed=1
  fi

  return "$failed"
}

# --- Auth round-trip test ---
# Validates the full authentication pipeline: Firebase API key → Identity
# Platform sign-in → JWT → Go API middleware.
#
# Uses a persistent smoke-test user (created on first run, reused forever).
# The deploy SA only needs firebaseauth.users.create — no delete, no get,
# no list. Password is stored in a k8s Secret managed by Terraform.

SMOKE_TEST_EMAIL="smoke-test@eval-internal.test"
IDP_API="https://identitytoolkit.googleapis.com/v1"

check_auth_roundtrip() {
  # 1. Read credentials from the cluster
  local api_key password
  api_key=$(kubectl get configmap frontend-config -o jsonpath='{.data.NEXT_PUBLIC_FIREBASE_API_KEY}' 2>/dev/null) || {
    echo "  ERROR: Could not read Firebase API key from frontend-config ConfigMap"
    return 1
  }
  password=$(kubectl get secret smoke-test-secrets -o jsonpath='{.data.SMOKE_TEST_PASSWORD}' 2>/dev/null | base64 -d) || {
    echo "  ERROR: Could not read SMOKE_TEST_PASSWORD from smoke-test-secrets Secret"
    return 1
  }

  # 2. Try to sign in (works if user already exists from a previous deploy)
  local signin_body signin_response signin_code
  signin_body="{\"email\":\"${SMOKE_TEST_EMAIL}\",\"password\":\"${password}\",\"returnSecureToken\":true}"
  signin_response=$(mktemp)
  signin_code=$(curl -s -o "$signin_response" -w '%{http_code}' -X POST \
    -H "Content-Type: application/json" \
    -d "$signin_body" \
    "${IDP_API}/accounts:signInWithPassword?key=${api_key}" 2>/dev/null)

  # 3. If user doesn't exist yet, create it and retry sign-in
  #    EMAIL_NOT_FOUND: legacy API response for missing user
  #    INVALID_LOGIN_CREDENTIALS: current API response (prevents email enumeration)
  if [[ "$signin_code" == "400" ]] && grep -qE "EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS" "$signin_response" 2>/dev/null; then
    echo "  Smoke-test user not found, creating..."
    local token create_response create_code
    token=$(gcloud auth print-access-token 2>/dev/null)
    create_response=$(mktemp)
    create_code=$(curl -s -o "$create_response" -w '%{http_code}' -X POST \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -H "x-goog-user-project: ${GCP_PROJECT_ID}" \
      -d "{\"email\":\"${SMOKE_TEST_EMAIL}\",\"password\":\"${password}\",\"emailVerified\":true}" \
      "${IDP_API}/projects/${GCP_PROJECT_ID}/accounts" 2>/dev/null)
    if [[ "$create_code" -lt 200 || "$create_code" -ge 300 ]]; then
      echo "  ERROR: Failed to create smoke-test user (HTTP ${create_code}): $(cat "$create_response")"
      rm -f "$create_response" "$signin_response"
      return 1
    fi
    rm -f "$create_response"

    # Retry sign-in
    signin_code=$(curl -s -o "$signin_response" -w '%{http_code}' -X POST \
      -H "Content-Type: application/json" \
      -d "$signin_body" \
      "${IDP_API}/accounts:signInWithPassword?key=${api_key}" 2>/dev/null)
  fi

  if [[ "$signin_code" != "200" ]]; then
    echo "  ERROR: signInWithPassword failed (HTTP ${signin_code}): $(cat "$signin_response")"
    rm -f "$signin_response"
    return 1
  fi

  local id_token
  id_token=$(jq -r '.idToken // empty' "$signin_response" 2>/dev/null)
  rm -f "$signin_response"
  if [[ -z "$id_token" ]]; then
    echo "  ERROR: Could not extract idToken from sign-in response"
    return 1
  fi

  # 4. Call the API with the JWT — expect 401 or 404 (no DB row),
  #    NOT 500 (which would indicate auth middleware is broken)
  local api_code
  api_code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${id_token}" \
    "${BASE_URL}/api/v1/auth/me" 2>/dev/null || echo "000")

  if [[ "$api_code" == "500" || "$api_code" == "502" || "$api_code" == "503" || "$api_code" == "000" ]]; then
    echo "  ERROR: API returned ${api_code} with valid JWT (expected 401 or 404)"
    return 1
  fi

  echo "  Auth round-trip OK (API returned ${api_code} for smoke-test user)"
  return 0
}

# --- Run checks ---

echo "Smoke testing ${BASE_URL} (timeout ${TIMEOUT}s per check)"
echo ""

retry_check "Frontend" "${BASE_URL}/" check_frontend
run_check   "Frontend config (no placeholders)" check_no_placeholders
retry_check "Go API" "${BASE_URL}/api/v1/auth/me" check_api
retry_check "Centrifugo" "${BASE_URL}/connection/websocket" check_centrifugo

# Executor sandbox and auth tests require kubectl
if command -v kubectl &>/dev/null; then
  run_check "Executor sandbox" check_executor_sandbox

  if [[ -n "${GCP_PROJECT_ID:-}" ]] && command -v gcloud &>/dev/null; then
    run_check "Auth round-trip" check_auth_roundtrip
  else
    skip_check "Auth round-trip" "requires GCP_PROJECT_ID and gcloud"
  fi
else
  skip_check "Executor sandbox" "requires kubectl"
  skip_check "Auth round-trip" "requires kubectl, GCP_PROJECT_ID, and gcloud"
fi

# --- Summary ---

echo ""
echo "=============================="
PASSED=$(( TOTAL - ${#FAILURES[@]} - ${#SKIPPED[@]} ))
echo "Smoke tests: ${PASSED} passed, ${#FAILURES[@]} failed, ${#SKIPPED[@]} skipped (${TOTAL} total)"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

echo "All smoke tests passed."
