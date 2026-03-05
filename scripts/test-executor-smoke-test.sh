#!/usr/bin/env bash
# Tests for executor-smoke-test.sh structure and behavior.
# Run from repo root: bash scripts/test-executor-smoke-test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXECUTOR_SCRIPT="$SCRIPT_DIR/executor-smoke-test.sh"

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
  if ! grep -qE "$pattern" "$EXECUTOR_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (executor-smoke-test.sh still contains '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$EXECUTOR_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (executor-smoke-test.sh does not contain '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

file_exists() {
  local desc="$1"
  local file="$2"
  if [ -f "$file" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (file does not exist: $file)"
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
# Structure: script exists
# ────────────────────────────────────────────────────────────────────────────

file_exists \
  "executor-smoke-test.sh exists" \
  "$EXECUTOR_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# Structure: no K8s dependencies
# ────────────────────────────────────────────────────────────────────────────

assert_not_contains \
  "does not use kubectl" \
  "kubectl"

assert_not_contains \
  "does not reference K8s Jobs" \
  "kind: Job"

assert_not_contains \
  "does not reference executor:8081 directly (uses BASE_URL)" \
  "http://executor:8081"

# ────────────────────────────────────────────────────────────────────────────
# Structure: uses parameterized BASE_URL
# ────────────────────────────────────────────────────────────────────────────

assert_contains \
  "accepts BASE_URL parameter or env var" \
  "BASE_URL"

assert_contains \
  "defaults BASE_URL to https://staging.eval.delquillan.com" \
  "staging.eval.delquillan.com"

# ────────────────────────────────────────────────────────────────────────────
# Structure: includes required test cases
# ────────────────────────────────────────────────────────────────────────────

assert_contains \
  "includes basic Python execution test" \
  "Basic.*[Pp]ython|[Pp]ython.*[Bb]asic"

assert_contains \
  "includes basic Java execution test" \
  "Basic.*[Jj]ava|[Jj]ava.*[Bb]asic"

assert_contains \
  "includes timeout enforcement test" \
  "[Tt]imeout"

assert_contains \
  "includes network isolation test" \
  "[Nn]etwork"

assert_contains \
  "includes filesystem isolation test" \
  "[Ff]ilesystem"

assert_contains \
  "includes memory limit test" \
  "[Mm]emory"

# ────────────────────────────────────────────────────────────────────────────
# Structure: hits the /execute endpoint (not /execute on executor:8081)
# ────────────────────────name: ────────────────────────────────────────────────

assert_contains \
  "sends requests to /execute endpoint" \
  "/execute"

assert_contains \
  "sends requests to /healthz/executor endpoint" \
  "/healthz/executor"

# ────────────────────────────────────────────────────────────────────────────
# Behavior: missing BASE_URL still uses default (https://staging.eval.delquillan.com)
# The script should not require BASE_URL — it has a sensible default
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR_DEFAULT="$(mktemp -d -p "$TMPDIR_ROOT")"

# Mock curl: healthz returns 200, execute fails immediately
cat > "$MOCK_DIR_DEFAULT/curl" <<'EOF'
#!/usr/bin/env bash
# Capture args to detect which endpoint is being called
for arg in "$@"; do
  if [[ "$arg" == *"staging.eval.delquillan.com"* ]]; then
    # Confirm default URL is used
    printf '{"success":false,"error":"mock-fail"}' > /tmp/mock-body-default 2>/dev/null || true
    printf '200'
    exit 0
  fi
done
printf '000'
exit 0
EOF
chmod +x "$MOCK_DIR_DEFAULT/curl"

# Run the script without BASE_URL — expect it to try staging.eval.delquillan.com
default_url_output=$(
  env -i \
    PATH="${MOCK_DIR_DEFAULT}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    bash "$EXECUTOR_SCRIPT" 2>&1
) || true

if echo "$default_url_output" | grep -qE "staging.eval.delquillan.com|localhost"; then
  echo "PASS: script uses staging.eval.delquillan.com as default BASE_URL"
  PASS=$((PASS + 1))
else
  echo "FAIL: script did not use staging.eval.delquillan.com as default BASE_URL"
  echo "  Output was: $default_url_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: executor unreachable causes health check failure
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR_DOWN="$(mktemp -d -p "$TMPDIR_ROOT")"

cat > "$MOCK_DIR_DOWN/curl" <<'EOF'
#!/usr/bin/env bash
# Simulate executor being down
output_file=""
for i in "${!@}"; do
  if [[ "${@:$((i+1)):1}" == "-o" ]]; then
    output_file="${@:$((i+2)):1}"
    break
  fi
done
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "-o" ]]; then
    output_file="${args[$((i+1))]}"
    break
  fi
done
# Simple: find -o arg
args=("$@")
for ((idx=0; idx<${#args[@]}; idx++)); do
  if [[ "${args[$idx]}" == "-o" ]]; then
    output_file="${args[$((idx+1))]}"
    break
  fi
done
[[ -n "$output_file" ]] && printf '' > "$output_file"
printf '000'
EOF
chmod +x "$MOCK_DIR_DOWN/curl"

down_exit=0
down_output=$(
  env -i \
    PATH="${MOCK_DIR_DOWN}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    BASE_URL=https://staging.eval.delquillan.com \
    bash "$EXECUTOR_SCRIPT" 2>&1
) || down_exit=$?

if [ "$down_exit" -ne 0 ]; then
  echo "PASS: executor unreachable causes script to exit non-zero"
  PASS=$((PASS + 1))
else
  echo "FAIL: executor unreachable did not cause script to exit non-zero"
  echo "  Output was: $down_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: all tests pass with a mocked executor that returns success
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR_SUCCESS="$(mktemp -d -p "$TMPDIR_ROOT")"

# Real jq for JSON parsing
REAL_JQ="$(command -v jq)"
cat > "$MOCK_DIR_SUCCESS/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
chmod +x "$MOCK_DIR_SUCCESS/jq"

# Mock curl: healthz returns 200, all execute calls return success
cat > "$MOCK_DIR_SUCCESS/curl" <<'CURLEOF'
#!/usr/bin/env bash
args=("$@")
output_file=""
for ((idx=0; idx<${#args[@]}; idx++)); do
  if [[ "${args[$idx]}" == "-o" ]]; then
    output_file="${args[$((idx+1))]}"
    break
  fi
done

url=""
for arg in "${args[@]}"; do
  if [[ "$arg" == http* ]]; then url="$arg"; break; fi
done

if [[ "$url" == *"/healthz/executor"* ]]; then
  [[ -n "$output_file" ]] && printf '%s' 'ok' > "$output_file"
  printf '%s' '200'
elif [[ "$url" == *"/execute"* ]]; then
  # Check if this is a timeout test (timeout_ms <= 1000) or isolation test
  data_arg=""
  for ((idx=0; idx<${#args[@]}; idx++)); do
    if [[ "${args[$idx]}" == "-d" || "${args[$idx]}" == "--data" ]]; then
      data_arg="${args[$((idx+1))]}"
      break
    fi
  done

  # Detect if this is a "should fail" test based on the code content.
  # Pattern: detect isolation/timeout test code embedded in JSON.
  # Note: do NOT use timeout_ms value — 10000 would match "1000" as substring.
  if echo "$data_arg" | grep -qE 'time\.sleep|8\.8\.8\.8|/etc/passwd|512 \* 1024 \* 1024'; then
    # These should "fail" — sandbox correctly rejects the dangerous/timeout code
    [[ -n "$output_file" ]] && printf '%s' '{"success":false,"error":"killed","output":""}' > "$output_file"
  elif echo "$data_arg" | grep -q '"language":"java"'; then
    # Java execution — return java-specific output
    [[ -n "$output_file" ]] && printf '%s' '{"success":true,"output":"java-sandbox-ok\\n","error":""}' > "$output_file"
  else
    # Normal Python execution — succeed and return output (use \\n for JSON-safe newline)
    [[ -n "$output_file" ]] && printf '%s' '{"success":true,"output":"sandbox-ok\\n","error":""}' > "$output_file"
  fi
  printf '%s' '200'
else
  [[ -n "$output_file" ]] && printf '%s' '' > "$output_file"
  printf '%s' '000'
fi
CURLEOF
chmod +x "$MOCK_DIR_SUCCESS/curl"

success_exit=0
success_output=$(
  env -i \
    PATH="${MOCK_DIR_SUCCESS}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    BASE_URL=https://staging.eval.delquillan.com \
    bash "$EXECUTOR_SCRIPT" 2>&1
) || success_exit=$?

if [ "$success_exit" -eq 0 ]; then
  echo "PASS: all tests pass when executor returns correct responses"
  PASS=$((PASS + 1))
else
  echo "FAIL: script exited non-zero even though executor returned correct responses"
  echo "  Exit: $success_exit"
  echo "  Output was: $success_output"
  FAIL=$((FAIL + 1))
fi

if echo "$success_output" | grep -qiE "passed|PASS|All.*passed"; then
  echo "PASS: success output contains 'passed' summary"
  PASS=$((PASS + 1))
else
  echo "FAIL: success output does not contain 'passed' summary"
  echo "  Output was: $success_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: a test failure causes non-zero exit
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR_FAIL="$(mktemp -d -p "$TMPDIR_ROOT")"

cat > "$MOCK_DIR_FAIL/jq" <<EOF
#!/usr/bin/env bash
exec "${REAL_JQ}" "\$@"
EOF
chmod +x "$MOCK_DIR_FAIL/jq"

# Mock curl: healthz ok, all execute calls return "success":true even for
# dangerous code (simulating a broken sandbox where isolation is not enforced)
cat > "$MOCK_DIR_FAIL/curl" <<'CURLEOF'
#!/usr/bin/env bash
args=("$@")
output_file=""
for ((idx=0; idx<${#args[@]}; idx++)); do
  if [[ "${args[$idx]}" == "-o" ]]; then
    output_file="${args[$((idx+1))]}"
    break
  fi
done

url=""
for arg in "${args[@]}"; do
  if [[ "$arg" == http* ]]; then url="$arg"; break; fi
done

if [[ "$url" == *"/healthz/executor"* ]]; then
  [[ -n "$output_file" ]] && printf '%s' 'ok' > "$output_file"
  printf '%s' '200'
elif [[ "$url" == *"/execute"* ]]; then
  # Broken sandbox: always succeed, even for dangerous code.
  # This simulates missing isolation — all security tests should FAIL.
  # Return language-appropriate output so basic tests pass, but security
  # tests detect the sandbox is broken (they return success when they should fail).
  if echo "$@" | grep -q '"language":"java"'; then
    [[ -n "$output_file" ]] && printf '%s' '{"success":true,"output":"java-sandbox-ok\\n","error":""}' > "$output_file"
  elif echo "$@" | grep -q '8\.8\.8\.8'; then
    # Network: sandbox should block but broken sandbox "succeeds" with CONNECTED
    [[ -n "$output_file" ]] && printf '%s' '{"success":true,"output":"CONNECTED\\n","error":""}' > "$output_file"
  else
    [[ -n "$output_file" ]] && printf '%s' '{"success":true,"output":"sandbox-ok\\n","error":""}' > "$output_file"
  fi
  printf '%s' '200'
else
  [[ -n "$output_file" ]] && printf '%s' '' > "$output_file"
  printf '%s' '000'
fi
CURLEOF
chmod +x "$MOCK_DIR_FAIL/curl"

fail_exit=0
fail_output=$(
  env -i \
    PATH="${MOCK_DIR_FAIL}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    BASE_URL=https://staging.eval.delquillan.com \
    bash "$EXECUTOR_SCRIPT" 2>&1
) || fail_exit=$?

if [ "$fail_exit" -ne 0 ]; then
  echo "PASS: broken sandbox causes script to exit non-zero"
  PASS=$((PASS + 1))
else
  echo "FAIL: broken sandbox did not cause script to exit non-zero"
  echo "  Output was: $fail_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Behavior: BASE_URL can be passed as positional argument
# ────────────────────────────────────────────────────────────────────────────

MOCK_DIR_ARG="$(mktemp -d -p "$TMPDIR_ROOT")"

cat > "$MOCK_DIR_ARG/curl" <<'CURLEOF'
#!/usr/bin/env bash
# Check that the URL contains the custom base
for arg in "$@"; do
  if [[ "$arg" == *"custom-host:9999"* ]]; then
    printf '200'
    exit 0
  fi
done
printf '000'
CURLEOF
chmod +x "$MOCK_DIR_ARG/curl"

arg_output=$(
  env -i \
    PATH="${MOCK_DIR_ARG}:${SYSTEM_PATH}" \
    HOME="${HOME:-/root}" \
    bash "$EXECUTOR_SCRIPT" "http://custom-host:9999" 2>&1
) || true

if echo "$arg_output" | grep -qE "custom-host:9999|custom.host"; then
  echo "PASS: BASE_URL positional argument is used"
  PASS=$((PASS + 1))
else
  echo "FAIL: BASE_URL positional argument was not used"
  echo "  Output was: $arg_output"
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
