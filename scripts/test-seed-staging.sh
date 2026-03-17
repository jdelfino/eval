#!/usr/bin/env bash
# Tests for seed-staging.sh
# Run from repo root: bash scripts/test-seed-staging.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_SCRIPT="$SCRIPT_DIR/seed-staging.sh"

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

assert_contains() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$SEED_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (seed-staging.sh does not contain '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

# ── Mock infrastructure ──────────────────────────────────────────────────────

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# make_mock_dir creates a directory with mock curl, jq, gcloud, and bash setup-e2e-users stub.
# The mock curl simulates a full happy-path staging API:
#   - IDP signInWithPassword -> 200 with idToken
#   - GET /api/v1/auth/me (instructor check) -> configurable (200=exists, 401=not exists)
#   - POST /api/v1/auth/bootstrap -> configurable (200=fresh, 409=already done)
#   - POST /api/v1/namespaces -> configurable (201=created, 409=exists)
#   - POST /api/v1/system/invitations -> 201 with invitation id
#   - POST /api/v1/auth/accept-invite -> 200
#   - GET /api/v1/classes -> configurable (empty list or existing)
#   - POST /api/v1/classes -> 201 with class id
#   - POST /api/v1/classes/.../sections -> 201 with section id + join_code
#   - POST /api/v1/problems -> 201 with problem id
#   - GET /api/v1/sessions -> configurable (empty or existing active session)
#   - POST /api/v1/sessions -> 201
make_mock_dir() {
  local dir
  dir="$(mktemp -d -p "$TMPDIR_ROOT")"

  # mock jq: delegate to real jq
  cat > "$dir/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
  chmod +x "$dir/jq"

  # mock gcloud
  cat > "$dir/gcloud" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"identity-platform config describe"* ]]; then
  echo "${MOCK_API_KEY:-mock-api-key}"
elif [[ "$*" == *"auth print-access-token"* ]]; then
  echo "${MOCK_ACCESS_TOKEN:-mock-token}"
fi
EOF
  chmod +x "$dir/gcloud"

  # stub setup-e2e-users.sh: write a simple stub into mock dir that just succeeds
  mkdir -p "$dir/scripts"
  cat > "$dir/scripts/setup-e2e-users.sh" <<'EOF'
#!/usr/bin/env bash
echo "MOCK: setup-e2e-users.sh called"
exit 0
EOF
  chmod +x "$dir/scripts/setup-e2e-users.sh"

  # mock curl: full API simulation
  cat > "$dir/curl" <<'CURL_EOF'
#!/usr/bin/env bash
# Mock curl for seed-staging.sh tests

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
  if [[ "$arg" == http* ]]; then
    url="$arg"
    break
  fi
done

# Determine HTTP method
method="GET"
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "-X" ]]; then
    method="${args[$((i+1))]}"
    break
  fi
done

write_body() {
  [[ -n "$output_file" ]] && printf '%s' "$1" > "$output_file"
}

# IDP sign-in
if [[ "$url" == *"signInWithPassword"* ]]; then
  write_body '{"idToken":"mock-idtoken","localId":"mock-uid-123"}'
  printf '200'
  exit 0
fi

# GET /auth/me (instructor existence check)
if [[ "$url" == *"/api/v1/auth/me"* && "$method" == "GET" ]]; then
  write_body '{"id":"mock-uid","email":"instructor@test.local","role":"instructor"}'
  printf "${MOCK_INSTRUCTOR_ME_CODE:-401}"
  exit 0
fi

# POST /auth/bootstrap
if [[ "$url" == *"/api/v1/auth/bootstrap"* ]]; then
  write_body '{"message":"bootstrapped"}'
  printf "${MOCK_BOOTSTRAP_CODE:-200}"
  exit 0
fi

# POST /namespaces
if [[ "$url" == *"/api/v1/namespaces"* && "$method" == "POST" ]]; then
  write_body '{"id":"test-school","display_name":"Test School"}'
  printf "${MOCK_NAMESPACE_CODE:-201}"
  exit 0
fi

# POST /system/invitations
if [[ "$url" == *"/api/v1/system/invitations"* && "$method" == "POST" ]]; then
  write_body '{"id":"mock-invitation-uuid-1234"}'
  printf '201'
  exit 0
fi

# POST /auth/accept-invite
if [[ "$url" == *"/api/v1/auth/accept-invite"* ]]; then
  write_body '{"id":"mock-instructor-uid","role":"instructor"}'
  printf '200'
  exit 0
fi

# GET /classes/.../sections (list sections — must check before /classes)
if [[ "$url" == *"/api/v1/classes/"*"/sections"* && "$method" == "GET" ]]; then
  write_body "${MOCK_SECTIONS_LIST:-[]}"
  printf '200'
  exit 0
fi

# POST /classes/.../sections (create section — must check before /classes)
if [[ "$url" == *"/api/v1/classes/"*"/sections"* && "$method" == "POST" ]]; then
  write_body '{"id":"mock-section-uuid-9012","name":"Section A","join_code":"MOCK-CODE"}'
  printf '201'
  exit 0
fi

# GET /classes (list)
if [[ "$url" == *"/api/v1/classes"* && "$method" == "GET" ]]; then
  write_body "${MOCK_CLASSES_LIST:-[]}"
  printf '200'
  exit 0
fi

# POST /classes
if [[ "$url" == *"/api/v1/classes"* && "$method" == "POST" ]]; then
  write_body '{"id":"mock-class-uuid-5678","name":"CS 101 - Introduction to Programming"}'
  printf '201'
  exit 0
fi

# GET /problems (list)
if [[ "$url" == *"/api/v1/problems"* && "$method" == "GET" ]]; then
  write_body "${MOCK_PROBLEMS_LIST:-[]}"
  printf '200'
  exit 0
fi

# POST /problems
if [[ "$url" == *"/api/v1/problems"* && "$method" == "POST" ]]; then
  write_body '{"id":"mock-problem-uuid-3456","title":"Hello World"}'
  printf '201'
  exit 0
fi

# GET /sessions (list)
if [[ "$url" == *"/api/v1/sessions"* && "$method" == "GET" ]]; then
  write_body "${MOCK_SESSIONS_LIST:-[]}"
  printf '200'
  exit 0
fi

# POST /sessions
if [[ "$url" == *"/api/v1/sessions"* && "$method" == "POST" ]]; then
  write_body '{"id":"mock-session-uuid-7890","status":"active"}'
  printf '201'
  exit 0
fi

# POST /auth/register-student
if [[ "$url" == *"/api/v1/auth/register-student"* ]]; then
  write_body '{"id":"mock-student-uid","role":"student"}'
  printf '200'
  exit 0
fi

# Unknown URL
write_body "{\"error\":\"unexpected url: $url\"}"
printf '500'
CURL_EOF
  chmod +x "$dir/curl"

  echo "$dir"
}

# run_with_mock runs seed-staging.sh inside env -i with the given mock dir and env vars.
# The mock dir must contain a "scripts" subdirectory with setup-e2e-users.sh
# We set the SCRIPT_DIR in the seed script by putting the scripts/ stub in mock_dir/scripts/
# But the seed script itself lives in scripts/ so we patch by prepending mock scripts subdir to PATH
# instead. Actually we inject mock_dir as SEED_SCRIPT_DIR override via env var.
# The cleanest approach: override the scripts path by linking/copying the mock from the dir.
run_with_mock() {
  local mock_dir="$1"
  shift
  # We need the scripts/ directory path to be mockable.
  # The seed script calls: bash "$(dirname "$0")/setup-e2e-users.sh"
  # So we place a mock setup-e2e-users.sh in mock_dir and set SCRIPT_DIR override via
  # symlink trick: put seed-staging.sh copy next to mock setup-e2e-users.sh
  local run_dir="$mock_dir/scripts"
  mkdir -p "$run_dir"
  # Copy real seed script to run dir so dirname resolves correctly
  cp "$SEED_SCRIPT" "$run_dir/seed-staging.sh"

  env -i \
    PATH="${mock_dir}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    "$@" \
    bash "$run_dir/seed-staging.sh"
}

# ────────────────────────────────────────────────────────────────────────────
# 1. Missing required env vars → exit 1 + error message
# ────────────────────────────────────────────────────────────────────────────

MOCK_HAPPY="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_exit "Missing PROJECT_ID exits 1" 1 \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    TENANT_ID=t E2E_PASSWORD=p API_BASE_URL=http://fake IDP_API_KEY=k \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_output_contains "Missing PROJECT_ID error mentions PROJECT_ID" "PROJECT_ID" \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    TENANT_ID=t E2E_PASSWORD=p API_BASE_URL=http://fake IDP_API_KEY=k \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_exit "Missing TENANT_ID exits 1" 1 \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=p E2E_PASSWORD=pw API_BASE_URL=http://fake IDP_API_KEY=k \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_exit "Missing E2E_PASSWORD exits 1" 1 \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=p TENANT_ID=t API_BASE_URL=http://fake IDP_API_KEY=k \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_exit "Missing API_BASE_URL exits 1" 1 \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=p TENANT_ID=t E2E_PASSWORD=pw IDP_API_KEY=k \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

assert_exit "Missing BOOTSTRAP_ADMIN_EMAIL exits 1" 1 \
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=p TENANT_ID=t E2E_PASSWORD=pw API_BASE_URL=http://fake IDP_API_KEY=k \
    bash "${MOCK_HAPPY}/scripts/seed-staging.sh"

# ────────────────────────────────────────────────────────────────────────────
# 2. Happy path (fresh DB) → exits 0, logs key steps
# ────────────────────────────────────────────────────────────────────────────

MOCK_FRESH="$(make_mock_dir)"
# Prep: copy seed script next to mock setup-e2e-users.sh
cp "$SEED_SCRIPT" "${MOCK_FRESH}/scripts/seed-staging.sh"

fresh_exit=0
fresh_output=$(
  env -i \
    PATH="${MOCK_FRESH}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=test-project \
    TENANT_ID=test-tenant \
    E2E_PASSWORD=test-pass \
    API_BASE_URL=https://staging.example.com \
    IDP_API_KEY=test-api-key \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    bash "${MOCK_FRESH}/scripts/seed-staging.sh" 2>&1
) || fresh_exit=$?

if [ "$fresh_exit" -eq 0 ]; then
  echo "PASS: Happy path (fresh DB) exits 0"
  PASS=$((PASS + 1))
else
  echo "FAIL: Happy path (fresh DB) exited $fresh_exit"
  echo "  Output: $fresh_output"
  FAIL=$((FAIL + 1))
fi

# Verify bootstrap was called
if echo "$fresh_output" | grep -qiE "bootstrap"; then
  echo "PASS: Happy path logs bootstrap step"
  PASS=$((PASS + 1))
else
  echo "FAIL: Happy path did not log bootstrap step"
  echo "  Output: $fresh_output"
  FAIL=$((FAIL + 1))
fi

# Verify namespace was created
if echo "$fresh_output" | grep -qiE "namespace|test-school"; then
  echo "PASS: Happy path logs namespace step"
  PASS=$((PASS + 1))
else
  echo "FAIL: Happy path did not log namespace step"
  echo "  Output: $fresh_output"
  FAIL=$((FAIL + 1))
fi

# Verify class was created
if echo "$fresh_output" | grep -qiE "class|CS 101"; then
  echo "PASS: Happy path logs class step"
  PASS=$((PASS + 1))
else
  echo "FAIL: Happy path did not log class step"
  echo "  Output: $fresh_output"
  FAIL=$((FAIL + 1))
fi

# Verify session was started
if echo "$fresh_output" | grep -qiE "session"; then
  echo "PASS: Happy path logs session step"
  PASS=$((PASS + 1))
else
  echo "FAIL: Happy path did not log session step"
  echo "  Output: $fresh_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. Idempotent re-run (already seeded DB) → exits 0
# ────────────────────────────────────────────────────────────────────────────

MOCK_IDEMPOTENT="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_IDEMPOTENT}/scripts/seed-staging.sh"

# Simulate an already-seeded state:
# - bootstrap returns 409
# - namespace returns 409
# - instructor GET /auth/me returns 200 (already exists, skip invite flow)
# - classes list returns existing class
# - sections list returns existing section (with join_code)
# - problems list returns existing problems (both Hello World and Sum Two Numbers)
# - sessions list returns existing active session
EXISTING_CLASS='[{"id":"existing-class-uuid","name":"CS 101 - Introduction to Programming"}]'
EXISTING_SECTION='[{"id":"existing-section-uuid","name":"Section A","join_code":"EXISTING-JOIN-CODE"}]'
EXISTING_PROBLEMS='[{"id":"existing-hw-uuid","title":"Hello World"},{"id":"existing-sum-uuid","title":"Sum Two Numbers"}]'
EXISTING_SESSION='[{"id":"existing-session-uuid","status":"active"}]'

idempotent_exit=0
idempotent_output=$(
  env -i \
    PATH="${MOCK_IDEMPOTENT}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=test-project \
    TENANT_ID=test-tenant \
    E2E_PASSWORD=test-pass \
    API_BASE_URL=https://staging.example.com \
    IDP_API_KEY=test-api-key \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    MOCK_BOOTSTRAP_CODE=409 \
    MOCK_NAMESPACE_CODE=409 \
    MOCK_INSTRUCTOR_ME_CODE=200 \
    MOCK_CLASSES_LIST="$EXISTING_CLASS" \
    MOCK_SECTIONS_LIST="$EXISTING_SECTION" \
    MOCK_PROBLEMS_LIST="$EXISTING_PROBLEMS" \
    MOCK_SESSIONS_LIST="$EXISTING_SESSION" \
    bash "${MOCK_IDEMPOTENT}/scripts/seed-staging.sh" 2>&1
) || idempotent_exit=$?

if [ "$idempotent_exit" -eq 0 ]; then
  echo "PASS: Idempotent re-run exits 0"
  PASS=$((PASS + 1))
else
  echo "FAIL: Idempotent re-run exited $idempotent_exit"
  echo "  Output: $idempotent_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 4. Bootstrap already done (409) → continues without error
# ────────────────────────────────────────────────────────────────────────────

MOCK_409="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_409}/scripts/seed-staging.sh"

bootstrap_409_exit=0
bootstrap_409_output=$(
  env -i \
    PATH="${MOCK_409}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    PROJECT_ID=test-project \
    TENANT_ID=test-tenant \
    E2E_PASSWORD=test-pass \
    API_BASE_URL=https://staging.example.com \
    IDP_API_KEY=test-api-key \
    BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
    MOCK_BOOTSTRAP_CODE=409 \
    bash "${MOCK_409}/scripts/seed-staging.sh" 2>&1
) || bootstrap_409_exit=$?

if [ "$bootstrap_409_exit" -eq 0 ]; then
  echo "PASS: Bootstrap 409 (already done) continues without error"
  PASS=$((PASS + 1))
else
  echo "FAIL: Bootstrap 409 caused exit $bootstrap_409_exit"
  echo "  Output: $bootstrap_409_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 5. Instructor already exists (GET /auth/me → 200) → skips invite flow
# ────────────────────────────────────────────────────────────────────────────

MOCK_INST_EXISTS="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_INST_EXISTS}/scripts/seed-staging.sh"

# Track if invite endpoint was called
INVITE_CALL_FILE="$(mktemp -p "$TMPDIR_ROOT")"

# Override curl to track invitation calls
cat > "${MOCK_INST_EXISTS}/curl" <<CURL_EOF
#!/usr/bin/env bash
REAL_JQ="${REAL_JQ}"
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
method="GET"
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-X" ]]; then method="\${args[\$((i+1))]}"; break; fi
done

write_body() { [[ -n "\$output_file" ]] && printf '%s' "\$1" > "\$output_file"; }

if [[ "\$url" == *"signInWithPassword"* ]]; then
  write_body '{"idToken":"mock-idtoken","localId":"mock-uid"}'
  printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/me"* && "\$method" == "GET" ]]; then
  write_body '{"id":"uid","email":"instructor@test.local","role":"instructor"}'
  printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/system/invitations"* && "\$method" == "POST" ]]; then
  echo "INVITE_CALLED" >> "${INVITE_CALL_FILE}"
  write_body '{"id":"inv-uuid"}'
  printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/bootstrap"* ]]; then
  write_body '{}'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/namespaces"* && "\$method" == "POST" ]]; then
  write_body '{"id":"test-school"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "POST" ]]; then
  write_body '{"id":"sec-uuid","name":"Section A","join_code":"JOIN-CODE"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "POST" ]]; then
  write_body '{"id":"cls-uuid","name":"CS 101"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "POST" ]]; then
  write_body '{"id":"prob-uuid","title":"Hello World"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "POST" ]]; then
  write_body '{"id":"sess-uuid","status":"active"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/register-student"* ]]; then
  write_body '{"id":"stu-uid"}'; printf '200'; exit 0
fi
write_body "{\"error\":\"unexpected: \$url \$method\"}"
printf '500'
CURL_EOF
chmod +x "${MOCK_INST_EXISTS}/curl"

env -i \
  PATH="${MOCK_INST_EXISTS}:${SYSTEM_PATH}" \
  HOME="${HOME:-/root}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  PROJECT_ID=test-project \
  TENANT_ID=test-tenant \
  E2E_PASSWORD=test-pass \
  API_BASE_URL=https://staging.example.com \
  IDP_API_KEY=test-api-key \
  BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
  bash "${MOCK_INST_EXISTS}/scripts/seed-staging.sh" > /dev/null 2>&1 || true

if grep -q "INVITE_CALLED" "$INVITE_CALL_FILE" 2>/dev/null; then
  echo "FAIL: Instructor exists (GET /auth/me → 200) but invitation was still created"
  FAIL=$((FAIL + 1))
else
  echo "PASS: Instructor exists → invitation flow skipped"
  PASS=$((PASS + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 6. join_code is extracted from section create response (not hardcoded)
# ────────────────────────────────────────────────────────────────────────────

MOCK_JOINCODE="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_JOINCODE}/scripts/seed-staging.sh"

JOIN_CODE_USED_FILE="$(mktemp -p "$TMPDIR_ROOT")"

cat > "${MOCK_JOINCODE}/curl" <<CURL_EOF
#!/usr/bin/env bash
REAL_JQ="${REAL_JQ}"
args=("\$@")
output_file=""
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-o" ]]; then output_file="\${args[\$((i+1))]}"; break; fi
done
url=""
for arg in "\${args[@]}"; do
  if [[ "\$arg" == http* ]]; then url="\$arg"; break; fi
done
method="GET"
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-X" ]]; then method="\${args[\$((i+1))]}"; break; fi
done

write_body() { [[ -n "\$output_file" ]] && printf '%s' "\$1" > "\$output_file"; }

if [[ "\$url" == *"signInWithPassword"* ]]; then
  write_body '{"idToken":"mock-idtoken","localId":"mock-uid"}'
  printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/me"* && "\$method" == "GET" ]]; then
  write_body '{}'; printf '401'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/bootstrap"* ]]; then
  write_body '{}'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/namespaces"* && "\$method" == "POST" ]]; then
  write_body '{"id":"test-school"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/system/invitations"* && "\$method" == "POST" ]]; then
  write_body '{"id":"inv-uuid"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/accept-invite"* ]]; then
  write_body '{"id":"uid"}'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "POST" ]]; then
  # Return a UNIQUE join code — tests verify it is actually used in register-student call
  write_body '{"id":"sec-uuid","name":"Section A","join_code":"UNIQUE-TEST-CODE-XYZ"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "POST" ]]; then
  write_body '{"id":"cls-uuid","name":"CS 101"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "POST" ]]; then
  write_body '{"id":"prob-uuid","title":"Hello World"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "POST" ]]; then
  write_body '{"id":"sess-uuid","status":"active"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/register-student"* ]]; then
  # Record the request body so we can verify join_code
  for i in "\${!args[@]}"; do
    if [[ "\${args[\$i]}" == "-d" ]]; then
      echo "\${args[\$((i+1))]}" >> "${JOIN_CODE_USED_FILE}"
      break
    fi
  done
  write_body '{"id":"stu-uid"}'; printf '200'; exit 0
fi
write_body "{\"error\":\"unexpected: \$url \$method\"}"
printf '500'
CURL_EOF
chmod +x "${MOCK_JOINCODE}/curl"

env -i \
  PATH="${MOCK_JOINCODE}:${SYSTEM_PATH}" \
  HOME="${HOME:-/root}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  PROJECT_ID=test-project \
  TENANT_ID=test-tenant \
  E2E_PASSWORD=test-pass \
  API_BASE_URL=https://staging.example.com \
  IDP_API_KEY=test-api-key \
  BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
  bash "${MOCK_JOINCODE}/scripts/seed-staging.sh" > /dev/null 2>&1 || true

if grep -q "UNIQUE-TEST-CODE-XYZ" "$JOIN_CODE_USED_FILE" 2>/dev/null; then
  echo "PASS: join_code from section response is used in register-student calls"
  PASS=$((PASS + 1))
else
  echo "FAIL: register-student calls did not use the server-generated join_code"
  if [ -f "$JOIN_CODE_USED_FILE" ]; then
    echo "  register-student bodies: $(cat "$JOIN_CODE_USED_FILE")"
  else
    echo "  (register-student was never called)"
  fi
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 7. Structure: key required patterns present in script
# ────────────────────────────────────────────────────────────────────────────

assert_contains \
  "Script calls setup-e2e-users.sh" \
  "setup-e2e-users\.sh"

assert_contains \
  "Script uses signInWithPassword IDP endpoint" \
  "signInWithPassword"

assert_contains \
  "Script has bootstrap endpoint call" \
  "auth/bootstrap"

assert_contains \
  "Script has namespace create call" \
  "api/v1/namespaces"

assert_contains \
  "Script has system invitations call" \
  "system/invitations"

assert_contains \
  "Script has accept-invite call" \
  "auth/accept-invite"

assert_contains \
  "Script has classes create call" \
  "api/v1/classes"

assert_contains \
  "Script has sections create call" \
  "sections"

assert_contains \
  "Script has problems create call" \
  "api/v1/problems"

assert_contains \
  "Script has register-student call" \
  "register-student"

assert_contains \
  "Script has sessions create call" \
  "api/v1/sessions"

# ────────────────────────────────────────────────────────────────────────────
# 8. Both students are registered (Alice and Bob)
# ────────────────────────────────────────────────────────────────────────────

MOCK_STUDENTS="$(make_mock_dir)"
cp "$SEED_SCRIPT" "${MOCK_STUDENTS}/scripts/seed-staging.sh"
STUDENTS_FILE="$(mktemp -p "$TMPDIR_ROOT")"

cat > "${MOCK_STUDENTS}/curl" <<CURL_EOF
#!/usr/bin/env bash
REAL_JQ="${REAL_JQ}"
args=("\$@")
output_file=""
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-o" ]]; then output_file="\${args[\$((i+1))]}"; break; fi
done
url=""
for arg in "\${args[@]}"; do
  if [[ "\$arg" == http* ]]; then url="\$arg"; break; fi
done
method="GET"
for i in "\${!args[@]}"; do
  if [[ "\${args[\$i]}" == "-X" ]]; then method="\${args[\$((i+1))]}"; break; fi
done

write_body() { [[ -n "\$output_file" ]] && printf '%s' "\$1" > "\$output_file"; }

if [[ "\$url" == *"signInWithPassword"* ]]; then
  write_body '{"idToken":"mock-idtoken","localId":"mock-uid"}'
  printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/me"* && "\$method" == "GET" ]]; then
  write_body '{}'; printf '401'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/bootstrap"* ]]; then
  write_body '{}'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/namespaces"* && "\$method" == "POST" ]]; then
  write_body '{"id":"test-school"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/system/invitations"* && "\$method" == "POST" ]]; then
  write_body '{"id":"inv-uuid"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/accept-invite"* ]]; then
  write_body '{"id":"uid"}'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes/"*"/sections"* && "\$method" == "POST" ]]; then
  write_body '{"id":"sec-uuid","name":"Section A","join_code":"JCODE"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/classes"* && "\$method" == "POST" ]]; then
  write_body '{"id":"cls-uuid","name":"CS 101"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/problems"* && "\$method" == "POST" ]]; then
  write_body '{"id":"prob-uuid","title":"Hello World"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "GET" ]]; then
  write_body '[]'; printf '200'; exit 0
fi
if [[ "\$url" == *"/api/v1/sessions"* && "\$method" == "POST" ]]; then
  write_body '{"id":"sess-uuid","status":"active"}'; printf '201'; exit 0
fi
if [[ "\$url" == *"/api/v1/auth/register-student"* ]]; then
  for i in "\${!args[@]}"; do
    if [[ "\${args[\$i]}" == "-d" ]]; then
      echo "\${args[\$((i+1))]}" >> "${STUDENTS_FILE}"
      break
    fi
  done
  write_body '{"id":"stu-uid"}'; printf '200'; exit 0
fi
write_body "{\"error\":\"unexpected: \$url \$method\"}"
printf '500'
CURL_EOF
chmod +x "${MOCK_STUDENTS}/curl"

env -i \
  PATH="${MOCK_STUDENTS}:${SYSTEM_PATH}" \
  HOME="${HOME:-/root}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  PROJECT_ID=test-project \
  TENANT_ID=test-tenant \
  E2E_PASSWORD=test-pass \
  API_BASE_URL=https://staging.example.com \
  IDP_API_KEY=test-api-key \
  BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
  bash "${MOCK_STUDENTS}/scripts/seed-staging.sh" > /dev/null 2>&1 || true

alice_registered=false
bob_registered=false
if grep -q "Alice Student" "$STUDENTS_FILE" 2>/dev/null; then alice_registered=true; fi
if grep -q "Bob Student" "$STUDENTS_FILE" 2>/dev/null; then bob_registered=true; fi

if $alice_registered; then
  echo "PASS: Alice Student is registered"
  PASS=$((PASS + 1))
else
  echo "FAIL: Alice Student was not registered"
  FAIL=$((FAIL + 1))
fi

if $bob_registered; then
  echo "PASS: Bob Student is registered"
  PASS=$((PASS + 1))
else
  echo "FAIL: Bob Student was not registered"
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
