#!/usr/bin/env bash
# Tests for smoke-test.sh structure and auth-roundtrip behavior.
# Run from repo root: bash scripts/test-smoke-test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_SCRIPT="$SCRIPT_DIR/smoke-test.sh"

PASS=0
FAIL=0

# ── Test helpers ────────────────────────────────────────────────────────────

assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  shift 2
  local actual_exit=0
  "$@" >/dev/null 2>&1 || actual_exit=$?
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

assert_output_contains() {
  local desc="$1"
  local pattern="$2"
  shift 2
  local output
  output=$("$@" 2>&1 || true)
  if echo "$output" | grep -qE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (output did not contain '$pattern')"
    echo "  Output was: $output"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1"
  local pattern="$2"
  if ! grep -qE "$pattern" "$SMOKE_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (smoke-test.sh still contains '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$SMOKE_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (smoke-test.sh does not contain '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# ────────────────────────────────────────────────────────────────────────────
# Structure: executor sandbox code removed
# ────────────────────────────────────────────────────────────────────────────

assert_not_contains \
  "check_executor_sandbox function is removed" \
  "check_executor_sandbox"

assert_not_contains \
  "EXECUTOR_TEST_SCRIPT variable is removed" \
  "EXECUTOR_TEST_SCRIPT"

assert_not_contains \
  "cleanup_smoke_pods trap is removed" \
  "cleanup_smoke_pods"

assert_not_contains \
  "kubectl run pod invocation is removed" \
  "kubectl run"

# ────────────────────────────────────────────────────────────────────────────
# Structure: kubectl-gated conditional is removed
# ────────────────────────────────────────────────────────────────────────────

assert_not_contains \
  "kubectl-gated conditional is removed" \
  "command -v kubectl"

# ────────────────────────────────────────────────────────────────────────────
# Structure: check_auth_roundtrip reads from env vars not kubectl
# ────────────────────────────────────────────────────────────────────────────

assert_contains \
  "check_auth_roundtrip reads FIREBASE_API_KEY env var" \
  "FIREBASE_API_KEY"

assert_contains \
  "check_auth_roundtrip reads SMOKE_TEST_PASSWORD env var" \
  "SMOKE_TEST_PASSWORD"

assert_not_contains \
  "check_auth_roundtrip no longer uses kubectl to read api_key" \
  'kubectl get configmap frontend-config'

assert_not_contains \
  "check_auth_roundtrip no longer uses kubectl to read password" \
  'kubectl get secret smoke-test-secrets'

# ────────────────────────────────────────────────────────────────────────────
# Behavior: missing FIREBASE_API_KEY exits 1 with clear error
# We need to run only the check_auth_roundtrip function in isolation.
# We source smoke-test.sh with mocked curl and only call check_auth_roundtrip.
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR="$(mktemp -d -p "$TMPDIR_ROOT")"

# Mock curl to never be called (we expect failure before curl)
cat > "$MOCK_DIR/curl" <<'EOF'
#!/usr/bin/env bash
echo "curl-called-unexpectedly" >&2
exit 1
EOF
chmod +x "$MOCK_DIR/curl"

# Source smoke-test.sh to get check_auth_roundtrip, then call it directly.
# We run it in a subshell with no FIREBASE_API_KEY set.
missing_api_key_exit=0
missing_api_key_output=$(
  env -i \
    PATH="${MOCK_DIR}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    SMOKE_TEST_PASSWORD=somepassword \
    bash -c "
      source '$SMOKE_SCRIPT' 2>/dev/null || true
      check_auth_roundtrip
    " 2>&1
) || missing_api_key_exit=$?

if [ "$missing_api_key_exit" -ne 0 ]; then
  echo "PASS: Missing FIREBASE_API_KEY causes check_auth_roundtrip to fail"
  PASS=$((PASS + 1))
else
  echo "FAIL: Missing FIREBASE_API_KEY did not cause check_auth_roundtrip to fail (exit 0)"
  echo "  Output was: $missing_api_key_output"
  FAIL=$((FAIL + 1))
fi

if echo "$missing_api_key_output" | grep -qiE "FIREBASE_API_KEY|api.key|missing|required"; then
  echo "PASS: Missing FIREBASE_API_KEY prints helpful error mentioning FIREBASE_API_KEY"
  PASS=$((PASS + 1))
else
  echo "FAIL: Missing FIREBASE_API_KEY error message does not mention FIREBASE_API_KEY"
  echo "  Output was: $missing_api_key_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: missing SMOKE_TEST_PASSWORD exits 1 with clear error
# ────────────────────────────────────────────────────────────────────────────

missing_password_exit=0
missing_password_output=$(
  env -i \
    PATH="${MOCK_DIR}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    FIREBASE_API_KEY=some-api-key \
    bash -c "
      source '$SMOKE_SCRIPT' 2>/dev/null || true
      check_auth_roundtrip
    " 2>&1
) || missing_password_exit=$?

if [ "$missing_password_exit" -ne 0 ]; then
  echo "PASS: Missing SMOKE_TEST_PASSWORD causes check_auth_roundtrip to fail"
  PASS=$((PASS + 1))
else
  echo "FAIL: Missing SMOKE_TEST_PASSWORD did not cause check_auth_roundtrip to fail (exit 0)"
  echo "  Output was: $missing_password_output"
  FAIL=$((FAIL + 1))
fi

if echo "$missing_password_output" | grep -qiE "SMOKE_TEST_PASSWORD|password|missing|required"; then
  echo "PASS: Missing SMOKE_TEST_PASSWORD prints helpful error mentioning SMOKE_TEST_PASSWORD"
  PASS=$((PASS + 1))
else
  echo "FAIL: Missing SMOKE_TEST_PASSWORD error message does not mention SMOKE_TEST_PASSWORD"
  echo "  Output was: $missing_password_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: with both env vars set, check_auth_roundtrip calls IDP API
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR2="$(mktemp -d -p "$TMPDIR_ROOT")"

# Real jq for JSON parsing
REAL_JQ="$(command -v jq)"

cat > "$MOCK_DIR2/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
chmod +x "$MOCK_DIR2/jq"

cat > "$MOCK_DIR2/gcloud" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"auth print-access-token"* ]]; then
  echo "mock-token"
fi
EOF
chmod +x "$MOCK_DIR2/gcloud"

# Mock curl: signInWithPassword returns 200 with idToken
cat > "$MOCK_DIR2/curl" <<'EOF'
#!/usr/bin/env bash
args=("$@")
output_file=""
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "-o" ]]; then
    output_file="${args[$((i+1))]}"
    break
  fi
done
url=""
for arg in "${args[@]}"; do
  if [[ "$arg" == http* ]]; then url="$arg"; break; fi
done

if [[ "$url" == *"signInWithPassword"* ]]; then
  [[ -n "$output_file" ]] && printf '{"idToken":"fake-id-token","localId":"uid-123"}' > "$output_file"
  printf '200'
elif [[ "$url" == *"/api/v1/auth/me"* ]]; then
  printf '404'
else
  printf '200'
fi
EOF
chmod +x "$MOCK_DIR2/curl"

with_creds_exit=0
with_creds_output=$(
  env -i \
    PATH="${MOCK_DIR2}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    FIREBASE_API_KEY=test-api-key \
    SMOKE_TEST_PASSWORD=test-password \
    SMOKE_TEST_URL=https://eval.delquillan.com \
    GCP_PROJECT_ID=test-project \
    BASE_URL=https://eval.delquillan.com \
    bash -c "
      source '$SMOKE_SCRIPT' 2>/dev/null || true
      check_auth_roundtrip
    " 2>&1
) || with_creds_exit=$?

if [ "$with_creds_exit" -eq 0 ]; then
  echo "PASS: check_auth_roundtrip succeeds with FIREBASE_API_KEY + SMOKE_TEST_PASSWORD set"
  PASS=$((PASS + 1))
else
  echo "FAIL: check_auth_roundtrip failed even with both env vars set (exit $with_creds_exit)"
  echo "  Output was: $with_creds_output"
  FAIL=$((FAIL + 1))
fi

if echo "$with_creds_output" | grep -qiE "Auth round-trip OK|round.trip"; then
  echo "PASS: check_auth_roundtrip outputs success message"
  PASS=$((PASS + 1))
else
  echo "FAIL: check_auth_roundtrip did not output success message"
  echo "  Output was: $with_creds_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Structure: auth round-trip is always run (not gated on kubectl or GCP_PROJECT_ID)
# ────────────────────────────────────────────────────────────────────────────

assert_not_contains \
  "auth round-trip not gated on GCP_PROJECT_ID conditional" \
  'GCP_PROJECT_ID.*gcloud.*check_auth_roundtrip'

assert_not_contains \
  "auth skip message for kubectl is removed" \
  'skip_check.*Auth round-trip.*kubectl'

# ────────────────────────────────────────────────────────────────────────────
# Results
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
