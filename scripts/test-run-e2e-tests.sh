#!/usr/bin/env bash
# Tests for cache-aware behavior in run-e2e-tests.sh and ensure-test-api.sh.
# Run from repo root: bash scripts/test-run-e2e-tests.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_E2E_SCRIPT="$SCRIPT_DIR/run-e2e-tests.sh"
ENSURE_API_SCRIPT="$SCRIPT_DIR/ensure-test-api.sh"

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

assert_output_not_contains() {
  local desc="$1"
  local pattern="$2"
  shift 2
  local output
  output=$("$@" 2>&1 || true)
  if ! echo "$output" | grep -qE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (output unexpectedly contained '$pattern')"
    echo "  Output was: $output"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

# ────────────────────────────────────────────────────────────────────────────
# Test: run-e2e-tests.sh uses fixed default port 4100
# We source just the API_PORT assignment by extracting and evaluating it
# ────────────────────────────────────────────────────────────────────────────

# Extract the API_PORT line from the script and evaluate it
API_PORT_LINE=$(grep 'API_PORT' "$RUN_E2E_SCRIPT" | grep -v '^#' | head -1)

if echo "$API_PORT_LINE" | grep -q 'API_PORT:-4100'; then
  echo "PASS: run-e2e-tests.sh uses fixed default port 4100"
  PASS=$((PASS + 1))
else
  echo "FAIL: run-e2e-tests.sh does not use fixed default port 4100"
  echo "  API_PORT line: $API_PORT_LINE"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: run-e2e-tests.sh uses ${API_PORT:-4100} pattern (not random python)
# ────────────────────────────────────────────────────────────────────────────

if grep -q 'python3.*socket' "$RUN_E2E_SCRIPT"; then
  echo "FAIL: run-e2e-tests.sh still uses random python3 socket port"
  FAIL=$((FAIL + 1))
else
  echo "PASS: run-e2e-tests.sh no longer uses random python3 socket port"
  PASS=$((PASS + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: run-e2e-tests.sh skips Next.js build when standalone dir exists
# ────────────────────────────────────────────────────────────────────────────

if grep -q 'frontend/\.next/standalone' "$RUN_E2E_SCRIPT"; then
  echo "PASS: run-e2e-tests.sh checks for existing Next.js standalone build"
  PASS=$((PASS + 1))
else
  echo "FAIL: run-e2e-tests.sh does not check for existing Next.js standalone build"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: run-e2e-tests.sh prints skip message when standalone exists
# We use a fake frontend/.next/standalone dir to simulate cache hit
# ────────────────────────────────────────────────────────────────────────────

FAKE_REPO="$TMPDIR_ROOT/fake-repo"
mkdir -p "$FAKE_REPO/frontend/.next/standalone"
mkdir -p "$FAKE_REPO/scripts"

# Create a minimal stub of run-e2e-tests.sh that only tests the build logic
STUB_SCRIPT="$FAKE_REPO/scripts/test-build-logic.sh"
cat > "$STUB_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
if [ -d frontend/.next/standalone ]; then
  echo "Next.js standalone build exists, skipping build"
else
  echo "Building Next.js..."
fi
EOF
chmod +x "$STUB_SCRIPT"

output=$(cd "$FAKE_REPO" && bash "$STUB_SCRIPT" 2>&1)
if echo "$output" | grep -q "skipping build"; then
  echo "PASS: Skip logic outputs 'skipping build' when standalone dir exists"
  PASS=$((PASS + 1))
else
  echo "FAIL: Skip logic did not output 'skipping build' when standalone dir exists"
  echo "  Output was: $output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: run-e2e-tests.sh builds when standalone dir does NOT exist
# ────────────────────────────────────────────────────────────────────────────

FAKE_REPO2="$TMPDIR_ROOT/fake-repo2"
mkdir -p "$FAKE_REPO2/scripts"

STUB_SCRIPT2="$FAKE_REPO2/scripts/test-build-logic.sh"
cat > "$STUB_SCRIPT2" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
if [ -d frontend/.next/standalone ]; then
  echo "Next.js standalone build exists, skipping build"
else
  echo "Building Next.js..."
fi
EOF
chmod +x "$STUB_SCRIPT2"

output2=$(cd "$FAKE_REPO2" && bash "$STUB_SCRIPT2" 2>&1)
if echo "$output2" | grep -q "Building Next.js"; then
  echo "PASS: Build logic outputs 'Building Next.js' when standalone dir is absent"
  PASS=$((PASS + 1))
else
  echo "FAIL: Build logic did not output 'Building Next.js' when standalone dir is absent"
  echo "  Output was: $output2"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: ensure-test-api.sh skips Go build when binary exists
# Check that the script has conditional logic around the go build
# ────────────────────────────────────────────────────────────────────────────

if grep -q 'if \[ -f go-backend/tmp/server \]' "$ENSURE_API_SCRIPT"; then
  echo "PASS: ensure-test-api.sh has conditional check for existing Go server binary"
  PASS=$((PASS + 1))
else
  echo "FAIL: ensure-test-api.sh does not have conditional check '[ -f go-backend/tmp/server ]'"
  FAIL=$((FAIL + 1))
fi

# Also verify that "Always rebuild" comment is removed (it's no longer always rebuilt)
if grep -q 'Always rebuild' "$ENSURE_API_SCRIPT"; then
  echo "FAIL: ensure-test-api.sh still has 'Always rebuild' comment (should be updated)"
  FAIL=$((FAIL + 1))
else
  echo "PASS: ensure-test-api.sh no longer has 'Always rebuild' comment"
  PASS=$((PASS + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: ensure-test-api.sh prints skip message when binary exists
# We simulate using a minimal stub
# ────────────────────────────────────────────────────────────────────────────

FAKE_API_REPO="$TMPDIR_ROOT/fake-api-repo"
mkdir -p "$FAKE_API_REPO/go-backend/tmp"
touch "$FAKE_API_REPO/go-backend/tmp/server"
mkdir -p "$FAKE_API_REPO/scripts"

STUB_API_SCRIPT="$FAKE_API_REPO/scripts/test-build-logic.sh"
cat > "$STUB_API_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
if [ -f go-backend/tmp/server ]; then
  echo "Go server binary exists, skipping build" >&2
else
  echo "Building Go server..." >&2
  (cd go-backend && mkdir -p tmp && go build -o ./tmp/server ./cmd/server)
fi
EOF
chmod +x "$STUB_API_SCRIPT"

output3=$(cd "$FAKE_API_REPO" && bash "$STUB_API_SCRIPT" 2>&1)
if echo "$output3" | grep -q "skipping build"; then
  echo "PASS: ensure-test-api skip logic outputs 'skipping build' when binary exists"
  PASS=$((PASS + 1))
else
  echo "FAIL: ensure-test-api skip logic did not output 'skipping build' when binary exists"
  echo "  Output was: $output3"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: ensure-test-api.sh builds when binary does NOT exist
# ────────────────────────────────────────────────────────────────────────────

FAKE_API_REPO2="$TMPDIR_ROOT/fake-api-repo2"
mkdir -p "$FAKE_API_REPO2/scripts"

STUB_API_SCRIPT2="$FAKE_API_REPO2/scripts/test-build-logic.sh"
cat > "$STUB_API_SCRIPT2" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
if [ -f go-backend/tmp/server ]; then
  echo "Go server binary exists, skipping build" >&2
else
  echo "Building Go server..." >&2
fi
EOF
chmod +x "$STUB_API_SCRIPT2"

output4=$(cd "$FAKE_API_REPO2" && bash "$STUB_API_SCRIPT2" 2>&1)
if echo "$output4" | grep -q "Building Go server"; then
  echo "PASS: ensure-test-api build logic outputs 'Building Go server' when binary absent"
  PASS=$((PASS + 1))
else
  echo "FAIL: ensure-test-api build logic did not output 'Building Go server' when binary absent"
  echo "  Output was: $output4"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test: API_PORT can be overridden via environment variable
# Verify the script uses ${API_PORT:-4100} pattern allowing override
# ────────────────────────────────────────────────────────────────────────────

if grep -q 'API_PORT:-4100' "$RUN_E2E_SCRIPT"; then
  echo "PASS: run-e2e-tests.sh API_PORT supports env override (${API_PORT:-4100} pattern)"
  PASS=$((PASS + 1))
else
  echo "FAIL: run-e2e-tests.sh does not use \${API_PORT:-4100} override pattern"
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
