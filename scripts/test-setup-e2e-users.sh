#!/usr/bin/env bash
# Tests for setup-e2e-users.sh
# Run from repo root: bash scripts/test-setup-e2e-users.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="$SCRIPT_DIR/setup-e2e-users.sh"

# Resolve real jq path at startup (before env -i strips PATH)
REAL_JQ="$(command -v jq)"

PASS=0
FAIL=0

# ── Test helpers ────────────────────────────────────────────────────────────

assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  shift 2
  local actual_exit=0
  "$@" > /dev/null 2>&1 || actual_exit=$?
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

# ── Mock infrastructure ──────────────────────────────────────────────────────
# We override curl and gcloud by prepending a temp directory of mock scripts
# to PATH. Each test case builds its own mock directory.
#
# IMPORTANT: mock jq must use an absolute path to the real jq binary because
# `command -v` hangs inside `env -i` stripped environments.

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

# make_mock_dir creates a fresh directory of mock scripts.
# Arguments: curl_mode (skip|create|error)
# The mock curl behaviour:
#   skip   → signInWithPassword returns 200 (user exists)
#   create → signInWithPassword returns 400+EMAIL_NOT_FOUND, admin signUp returns 200
#   error  → signInWithPassword returns 400+EMAIL_NOT_FOUND, admin signUp returns 500
make_mock_dir() {
  local curl_mode="$1"
  local dir
  dir="$(mktemp -d -p "$TMPDIR_ROOT")"

  # ── mock jq: delegate to real jq via absolute path ───────────────────────
  cat > "$dir/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
  chmod +x "$dir/jq"

  # ── mock gcloud ──────────────────────────────────────────────────────────
  cat > "$dir/gcloud" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"identity-platform config describe"* ]]; then
  echo "${MOCK_API_KEY:-mock-api-key}"
elif [[ "$*" == *"auth print-access-token"* ]]; then
  echo "${MOCK_ACCESS_TOKEN:-mock-token}"
fi
EOF
  chmod +x "$dir/gcloud"

  # ── mock curl ────────────────────────────────────────────────────────────
  local curl_mode_val="$curl_mode"
  cat > "$dir/curl" <<EOF
#!/usr/bin/env bash
# Mock curl — extracts -o <file> and URL from args

args=("\$@")
output_file=""
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-o" ]]; then
    output_file="\${args[\$((i+1))]}"
    break
  fi
done

url=""
for arg in "\${args[@]}"; do
  if [[ "\$arg" == http* ]]; then
    url="\$arg"
    break
  fi
done

MODE="${curl_mode_val}"

if [[ "\$url" == *"signInWithPassword"* ]]; then
  if [[ "\$MODE" == "skip" ]]; then
    [[ -n "\$output_file" ]] && printf '{"idToken":"fake-token","localId":"uid-123"}' > "\$output_file"
    printf '200'
  else
    [[ -n "\$output_file" ]] && printf '{"error":{"code":400,"message":"EMAIL_NOT_FOUND"}}' > "\$output_file"
    printf '400'
  fi
elif [[ "\$url" == *"/accounts" ]]; then
  if [[ "\$MODE" == "create" ]]; then
    [[ -n "\$output_file" ]] && printf '{"localId":"uid-456","email":"test@test.local"}' > "\$output_file"
    printf '200'
  else
    [[ -n "\$output_file" ]] && printf '{"error":{"code":500,"message":"INTERNAL_ERROR"}}' > "\$output_file"
    printf '500'
  fi
else
  [[ -n "\$output_file" ]] && printf '{"error":"unexpected url: %s"}' "\$url" > "\$output_file"
  printf '400'
fi
EOF
  chmod +x "$dir/curl"

  echo "$dir"
}

# Shared PATH suffix for all mock runs
SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# run_with_mock runs setup-e2e-users.sh inside env -i with the given mock dir and env vars.
# Usage: run_with_mock <mock_dir> VAR=val ...
run_with_mock() {
  local mock_dir="$1"
  shift
  env -i \
    PATH="${mock_dir}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    "$@" \
    bash "$SETUP_SCRIPT"
}

# ────────────────────────────────────────────────────────────────────────────
# 1. Missing required env vars → exit 1 + error message
# ────────────────────────────────────────────────────────────────────────────

MOCK_SKIP="$(make_mock_dir skip)"

assert_exit "Missing PROJECT_ID exits 1" 1 \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    TENANT_ID=t E2E_PASSWORD=p IDP_API_KEY=k \
    E2E_USERS='["a@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_exit "Missing TENANT_ID exits 1" 1 \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=p E2E_PASSWORD=pw IDP_API_KEY=k \
    E2E_USERS='["a@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_exit "Missing E2E_PASSWORD exits 1" 1 \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=p TENANT_ID=t IDP_API_KEY=k \
    E2E_USERS='["a@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_output_contains "Missing PROJECT_ID prints PROJECT_ID in error" "PROJECT_ID" \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    TENANT_ID=t E2E_PASSWORD=p IDP_API_KEY=k \
    bash "$SETUP_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# 2. Existing user → SKIP logged, exit 0
# ────────────────────────────────────────────────────────────────────────────

MOCK_SKIP="$(make_mock_dir skip)"

assert_exit "Existing user exits 0" 0 \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["exists@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_output_contains "Existing user logs SKIP" "SKIP" \
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["exists@test.local"]' \
    bash "$SETUP_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# 3. New user → CREATED logged, exit 0
# ────────────────────────────────────────────────────────────────────────────

MOCK_CREATE="$(make_mock_dir create)"

assert_exit "New user exits 0" 0 \
  env -i PATH="${MOCK_CREATE}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["new@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_output_contains "New user logs CREATED" "CREATED" \
  env -i PATH="${MOCK_CREATE}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["new@test.local"]' \
    bash "$SETUP_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# 4. signUp failure → ERROR logged + exit 1
# ────────────────────────────────────────────────────────────────────────────

MOCK_ERROR="$(make_mock_dir error)"

assert_exit "signUp failure exits 1" 1 \
  env -i PATH="${MOCK_ERROR}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["new@test.local"]' \
    bash "$SETUP_SCRIPT"

assert_output_contains "signUp failure logs ERROR" "ERROR" \
  env -i PATH="${MOCK_ERROR}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["new@test.local"]' \
    bash "$SETUP_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# 5. Custom E2E_USERS list → all emails processed
# ────────────────────────────────────────────────────────────────────────────

MOCK_SKIP="$(make_mock_dir skip)"

output=$(
  env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["a@test.local","b@test.local","c@test.local"]' \
    bash "$SETUP_SCRIPT" 2>&1 || true
)

if echo "$output" | grep -q "a@test.local" && \
   echo "$output" | grep -q "b@test.local" && \
   echo "$output" | grep -q "c@test.local"; then
  echo "PASS: Custom E2E_USERS — all 3 emails processed"
  PASS=$((PASS + 1))
else
  echo "FAIL: Custom E2E_USERS — not all emails appeared in output"
  echo "  Output was: $output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 6. IDP_API_KEY set → gcloud identity-platform NOT called
# ────────────────────────────────────────────────────────────────────────────

MOCK_SKIP="$(make_mock_dir skip)"
GCLOUD_CALLED_FILE="$(mktemp -p "$TMPDIR_ROOT")"

cat > "${MOCK_SKIP}/gcloud" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"identity-platform config describe"* ]]; then
  echo "GCLOUD_IDP_CALLED" >> "${GCLOUD_CALLED_FILE}"
  echo "should-not-be-used"
elif [[ "\$*" == *"auth print-access-token"* ]]; then
  echo "mock-token"
fi
EOF
chmod +x "${MOCK_SKIP}/gcloud"

env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
  PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
  IDP_API_KEY=explicit-api-key \
  E2E_USERS='["a@test.local"]' \
  bash "$SETUP_SCRIPT" > /dev/null 2>&1 || true

if grep -q "GCLOUD_IDP_CALLED" "$GCLOUD_CALLED_FILE" 2>/dev/null; then
  echo "FAIL: IDP_API_KEY set but gcloud identity-platform was still called"
  FAIL=$((FAIL + 1))
else
  echo "PASS: IDP_API_KEY set → gcloud identity-platform not called"
  PASS=$((PASS + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 7. IDP_API_KEY NOT set → gcloud identity-platform IS called to fetch key
# ────────────────────────────────────────────────────────────────────────────

MOCK_CREATE="$(make_mock_dir create)"
GCLOUD_IDP_CALLED_FILE="$(mktemp -p "$TMPDIR_ROOT")"

cat > "${MOCK_CREATE}/gcloud" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"identity-platform config describe"* ]]; then
  echo "GCLOUD_IDP_CALLED" >> "${GCLOUD_IDP_CALLED_FILE}"
  echo "auto-fetched-api-key"
elif [[ "\$*" == *"auth print-access-token"* ]]; then
  echo "mock-token"
fi
EOF
chmod +x "${MOCK_CREATE}/gcloud"

env -i PATH="${MOCK_CREATE}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
  PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
  E2E_USERS='["a@test.local"]' \
  bash "$SETUP_SCRIPT" > /dev/null 2>&1 || true

if grep -q "GCLOUD_IDP_CALLED" "$GCLOUD_IDP_CALLED_FILE" 2>/dev/null; then
  echo "PASS: IDP_API_KEY not set → gcloud identity-platform called to auto-fetch key"
  PASS=$((PASS + 1))
else
  echo "FAIL: IDP_API_KEY not set but gcloud identity-platform was NOT called"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 8. Idempotent re-run: run twice with skip mode, still exit 0 both times
# ────────────────────────────────────────────────────────────────────────────

MOCK_SKIP="$(make_mock_dir skip)"

run1_exit=0
run2_exit=0

env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
  PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
  IDP_API_KEY=explicit-api-key \
  E2E_USERS='["a@test.local","b@test.local"]' \
  bash "$SETUP_SCRIPT" > /dev/null 2>&1 || run1_exit=$?

env -i PATH="${MOCK_SKIP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
  PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
  IDP_API_KEY=explicit-api-key \
  E2E_USERS='["a@test.local","b@test.local"]' \
  bash "$SETUP_SCRIPT" > /dev/null 2>&1 || run2_exit=$?

if [ "$run1_exit" -eq 0 ] && [ "$run2_exit" -eq 0 ]; then
  echo "PASS: Idempotent re-run — both runs exit 0"
  PASS=$((PASS + 1))
else
  echo "FAIL: Idempotent re-run — run1=$run1_exit run2=$run2_exit (expected both 0)"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 9. Mixed list: one existing + one new → SKIP + CREATED, exit 0
# ────────────────────────────────────────────────────────────────────────────

MOCK_MIXED="$(mktemp -d -p "$TMPDIR_ROOT")"
COUNTER_FILE="$(mktemp -p "$TMPDIR_ROOT")"
echo "0" > "$COUNTER_FILE"

cat > "$MOCK_MIXED/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
chmod +x "$MOCK_MIXED/jq"

cat > "$MOCK_MIXED/gcloud" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"auth print-access-token"* ]]; then echo "mock-token"; fi
EOF
chmod +x "$MOCK_MIXED/gcloud"

cat > "$MOCK_MIXED/curl" <<EOF
#!/usr/bin/env bash
args=("\$@")
output_file=""
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-o" ]]; then
    output_file="\${args[\$((i+1))]}"
    break
  fi
done
url=""
for arg in "\${args[@]}"; do
  if [[ "\$arg" == http* ]]; then url="\$arg"; break; fi
done

# 1st signIn → skip(200); 2nd signIn → not-found(400); signUp → create(200)
if [[ "\$url" == *"signInWithPassword"* ]]; then
  COUNT=\$(cat "${COUNTER_FILE}")
  COUNT=\$((COUNT + 1))
  echo "\$COUNT" > "${COUNTER_FILE}"
  if [[ "\$COUNT" -eq 1 ]]; then
    [[ -n "\$output_file" ]] && printf '{"idToken":"t","localId":"u1"}' > "\$output_file"
    printf '200'
  else
    [[ -n "\$output_file" ]] && printf '{"error":{"message":"EMAIL_NOT_FOUND"}}' > "\$output_file"
    printf '400'
  fi
elif [[ "\$url" == *"/accounts" ]]; then
  [[ -n "\$output_file" ]] && printf '{"localId":"u2"}' > "\$output_file"
  printf '200'
else
  printf '400'
fi
EOF
chmod +x "$MOCK_MIXED/curl"

mixed_exit=0
mixed_output=$(
  env -i PATH="${MOCK_MIXED}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project TENANT_ID=test-tenant E2E_PASSWORD=test-pass \
    IDP_API_KEY=explicit-api-key \
    E2E_USERS='["exists@test.local","new@test.local"]' \
    bash "$SETUP_SCRIPT" 2>&1
) || mixed_exit=$?

if echo "$mixed_output" | grep -q "SKIP" && \
   echo "$mixed_output" | grep -q "CREATED" && \
   [ "$mixed_exit" -eq 0 ]; then
  echo "PASS: Mixed list — SKIP + CREATED logged, exit 0"
  PASS=$((PASS + 1))
else
  echo "FAIL: Mixed list — expected SKIP+CREATED+exit0, got exit=${mixed_exit}"
  echo "  Output: $mixed_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Results
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
