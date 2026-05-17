#!/usr/bin/env bash
# Tests for scripts/check-playwright-fresh.sh
#
# Verifies the pre-push gate that blocks pushes when Playwright e2e specs have
# changed but the last-run result is missing, failed, or older than the specs.
#
# Run from repo root: bash scripts/test-check-playwright-fresh.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-playwright-fresh.sh"

PASS=0
FAIL=0

# ── Test helpers ─────────────────────────────────────────────────────────────

# assert_exit DESC EXPECTED_EXIT FAKE_REPO [args...]
# Runs check-playwright-fresh.sh from FAKE_REPO directory with given args.
assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  local repo="$3"
  shift 3
  local actual_exit=0
  (cd "$repo" && bash scripts/check-playwright-fresh.sh "$@") >/dev/null 2>&1 \
    || actual_exit=$?
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

# assert_output_contains DESC PATTERN FAKE_REPO [args...]
assert_output_contains() {
  local desc="$1"
  local pattern="$2"
  local repo="$3"
  shift 3
  local output
  output=$((cd "$repo" && bash scripts/check-playwright-fresh.sh "$@") 2>&1 || true)
  if echo "$output" | grep -qE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (output did not contain '$pattern')"
    echo "  Output was: $output"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

# Helper: create a fake repo with the given setup
# Sets FAKE_REPO to the new directory
make_fake_repo() {
  local name="$1"
  FAKE_REPO="$TMPDIR_ROOT/$name"
  mkdir -p "$FAKE_REPO/frontend/e2e"
  mkdir -p "$FAKE_REPO/frontend/test-results"
  mkdir -p "$FAKE_REPO/scripts"
  cp "$SCRIPT" "$FAKE_REPO/scripts/check-playwright-fresh.sh"
}

# ────────────────────────────────────────────────────────────────────────────
# Test: no spec args → exit 0 (defensive: lefthook should not call us, but if
# it does with no spec files we should not fail)
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "no_args"
assert_exit \
  "no spec args → exit 0" \
  0 "$FAKE_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test: non-spec args only (after filtering) → exit 0
# The script should skip non e2e/*.spec.ts paths
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "non_spec_args"
mkdir -p "$FAKE_REPO/frontend/src/components"
touch "$FAKE_REPO/frontend/src/components/Foo.tsx"
assert_exit \
  "only non-spec args after filtering → exit 0" \
  0 "$FAKE_REPO" \
  "frontend/src/components/Foo.tsx"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 1:
# .last-run.json absent → exit non-zero with clear message pointing at make test-e2e
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "no_json"
# Remove the test-results dir to ensure .last-run.json is absent
rm -rf "$FAKE_REPO/frontend/test-results"
touch "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"

assert_exit \
  "missing .last-run.json → exits non-zero" \
  1 "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

assert_output_contains \
  "missing .last-run.json → message mentions make test-e2e" \
  "make test-e2e" \
  "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 4:
# .last-run.json present but status is "failed" → exit non-zero, shows status
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "failed_status"
touch "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"
printf '{"status":"failed","startTime":"2026-05-17T00:00:00Z"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
# Make JSON newer than spec to isolate status check
touch -t 202605172359 "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605170100 "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"

assert_exit \
  "status=failed → exits non-zero" \
  1 "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

assert_output_contains \
  "status=failed → message includes actual status" \
  "failed" \
  "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 4 (variant): status "interrupted" → exit non-zero
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "interrupted_status"
touch "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"
printf '{"status":"interrupted"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605172359 "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605170100 "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"

assert_exit \
  "status=interrupted → exits non-zero" \
  1 "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 2:
# .last-run.json present, status="passed", but a spec is NEWER than the JSON
# → exit non-zero, lists offending spec, mentions make test-e2e
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "stale_json"
printf '{"status":"passed"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
# JSON is old, spec is newer
touch -t 202605170100 "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605172359 "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"

assert_exit \
  "spec newer than .last-run.json → exits non-zero" \
  1 "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

assert_output_contains \
  "spec newer than .last-run.json → lists offending spec" \
  "critical-paths.spec.ts" \
  "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

assert_output_contains \
  "spec newer than .last-run.json → mentions make test-e2e" \
  "make test-e2e" \
  "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 2 (multiple specs, one stale):
# Lists only the stale spec, not the fresh one
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "multiple_one_stale"
printf '{"status":"passed"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605170600 "$FAKE_REPO/frontend/test-results/.last-run.json"
# spec A is old (fresh), spec B is newer (stale)
touch -t 202605170100 "$FAKE_REPO/frontend/e2e/spec-a.spec.ts"
touch -t 202605172359 "$FAKE_REPO/frontend/e2e/spec-b.spec.ts"

assert_exit \
  "one of two specs newer than JSON → exits non-zero" \
  1 "$FAKE_REPO" \
  "frontend/e2e/spec-a.spec.ts" \
  "frontend/e2e/spec-b.spec.ts"

assert_output_contains \
  "one stale spec → lists the stale spec" \
  "spec-b.spec.ts" \
  "$FAKE_REPO" \
  "frontend/e2e/spec-a.spec.ts" \
  "frontend/e2e/spec-b.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 3:
# .last-run.json present, status="passed", JSON is newer than spec → exit 0
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "fresh_json"
printf '{"status":"passed"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
# JSON is newer than spec
touch -t 202605172359 "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605170100 "$FAKE_REPO/frontend/e2e/critical-paths.spec.ts"

assert_exit \
  "status=passed, JSON newer than spec → exit 0" \
  0 "$FAKE_REPO" \
  "frontend/e2e/critical-paths.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Acceptance criteria 3 (multiple specs all fresh):
# All specs older than JSON → exit 0
# ────────────────────────────────────────────────────────────────────────────

make_fake_repo "all_fresh"
printf '{"status":"passed"}' \
  > "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605172359 "$FAKE_REPO/frontend/test-results/.last-run.json"
touch -t 202605170100 "$FAKE_REPO/frontend/e2e/spec-a.spec.ts"
touch -t 202605170200 "$FAKE_REPO/frontend/e2e/spec-b.spec.ts"

assert_exit \
  "all specs older than JSON → exit 0" \
  0 "$FAKE_REPO" \
  "frontend/e2e/spec-a.spec.ts" \
  "frontend/e2e/spec-b.spec.ts"

# ────────────────────────────────────────────────────────────────────────────
# Script is executable
# ────────────────────────────────────────────────────────────────────────────

if [ -x "$SCRIPT" ]; then
  echo "PASS: check-playwright-fresh.sh is executable"
  PASS=$((PASS + 1))
else
  echo "FAIL: check-playwright-fresh.sh is not executable"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# lefthook.yml has the playwright-fresh entry
# ────────────────────────────────────────────────────────────────────────────

LEFTHOOK="$SCRIPT_DIR/../lefthook.yml"

if grep -q 'playwright-fresh' "$LEFTHOOK"; then
  echo "PASS: lefthook.yml contains playwright-fresh entry"
  PASS=$((PASS + 1))
else
  echo "FAIL: lefthook.yml does not contain playwright-fresh entry"
  FAIL=$((FAIL + 1))
fi

if grep -q 'frontend/e2e/\*\.spec\.ts' "$LEFTHOOK"; then
  echo "PASS: lefthook.yml has correct glob for e2e specs"
  PASS=$((PASS + 1))
else
  echo "FAIL: lefthook.yml does not have glob 'frontend/e2e/*.spec.ts'"
  FAIL=$((FAIL + 1))
fi

if grep -q 'check-playwright-fresh.sh' "$LEFTHOOK"; then
  echo "PASS: lefthook.yml references check-playwright-fresh.sh"
  PASS=$((PASS + 1))
else
  echo "FAIL: lefthook.yml does not reference check-playwright-fresh.sh"
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
