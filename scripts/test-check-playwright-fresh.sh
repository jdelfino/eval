#!/usr/bin/env bash
# Tests for scripts/check-playwright-fresh.sh
#
# Verifies the pre-push gate that blocks pushes when Playwright e2e specs have
# changed but the last-run result is missing, has non-"passed" status, or is
# older than any changed spec.
#
# The hook script does not rely on lefthook's {push_files} or git's pre-push
# stdin protocol. Instead, it determines the diff base via:
#   1. @{push} (rare on new branches)
#   2. @{u} (rare on new branches)
#   3. closest remote ref ancestor (the common case for new branches)
#
# All tests build minimal git repos under $TMPDIR_ROOT, set synthetic remote
# refs via `git update-ref refs/remotes/origin/<name>`, and invoke the hook
# from inside the repo.
#
# Run from repo root: bash scripts/test-check-playwright-fresh.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-playwright-fresh.sh"

PASS=0
FAIL=0

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

# ── Git repo helpers ──────────────────────────────────────────────────────────

# init_repo NAME
# Creates a minimal git repo at $TMPDIR_ROOT/NAME with the hook installed.
# Sets GIT_REPO.
init_repo() {
  local name="$1"
  GIT_REPO="$TMPDIR_ROOT/$name"
  mkdir -p "$GIT_REPO/frontend/e2e" "$GIT_REPO/frontend/test-results" "$GIT_REPO/scripts"
  cp "$SCRIPT" "$GIT_REPO/scripts/check-playwright-fresh.sh"
  git -C "$GIT_REPO" init -q -b main
  git -C "$GIT_REPO" config user.email "test@test.com"
  git -C "$GIT_REPO" config user.name "Test"
}

# commit_file REPO FILEPATH MESSAGE
# Creates/modifies FILEPATH (relative to repo) and commits.
# Prints the new commit sha.
commit_file() {
  local repo="$1"
  local file="$2"
  local msg="$3"
  mkdir -p "$repo/$(dirname "$file")"
  printf 'content for %s\n%s\n' "$file" "$RANDOM" >> "$repo/$file"
  git -C "$repo" add "$file"
  git -C "$repo" commit -q -m "$msg"
  git -C "$repo" rev-parse HEAD
}

# set_remote_ref REPO NAME SHA
# Creates refs/remotes/origin/NAME → SHA without needing a real remote.
set_remote_ref() {
  git -C "$1" update-ref "refs/remotes/origin/$2" "$3"
}

# run_hook REPO → exit code (stdout/stderr suppressed)
run_hook() {
  local repo="$1"
  local exit_code=0
  (cd "$repo" && bash scripts/check-playwright-fresh.sh) >/dev/null 2>&1 \
    || exit_code=$?
  echo "$exit_code"
}

# run_hook_output REPO → combined stdout+stderr
run_hook_output() {
  local repo="$1"
  (cd "$repo" && bash scripts/check-playwright-fresh.sh) 2>&1 || true
}

# assert_exit DESC EXPECTED_EXIT REPO
assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  local repo="$3"
  local actual_exit
  actual_exit=$(run_hook "$repo")
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

# assert_output_contains DESC PATTERN REPO
assert_output_contains() {
  local desc="$1"
  local pattern="$2"
  local repo="$3"
  local output
  output=$(run_hook_output "$repo")
  if echo "$output" | grep -qE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (pattern not found: $pattern)"
    echo "  Output: $output"
    FAIL=$((FAIL + 1))
  fi
}

# write_last_run REPO STATUS
write_last_run() {
  local repo="$1"
  local status="$2"
  printf '{"status":"%s"}\n' "$status" > "$repo/frontend/test-results/.last-run.json"
}

# ────────────────────────────────────────────────────────────────────────────
# Test 1: branch with no e2e changes → exit 0
# ────────────────────────────────────────────────────────────────────────────

init_repo "no_e2e_changes"
BASE_SHA=$(commit_file "$GIT_REPO" "frontend/e2e/old.spec.ts" "base with spec")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/src/foo.ts" "non-spec change" >/dev/null

assert_exit \
  "branch with no e2e changes → exit 0" \
  0 "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 2 (TASK CASE): redesign-style base.
# feature branch off origin/redesign where origin/redesign is behind
# origin/main on e2e specs; branch itself does NOT touch any e2e spec.
# Closest-ancestor heuristic must pick origin/redesign, not origin/main.
# ────────────────────────────────────────────────────────────────────────────

init_repo "redesign_repro"
A_SHA=$(commit_file "$GIT_REPO" "README" "A: base")
# Build redesign-line: A → B (no e2e additions)
B_SHA=$(commit_file "$GIT_REPO" "frontend/src/x.ts" "B: redesign tip")
# Feature branch off B: B → D (no e2e additions)
commit_file "$GIT_REPO" "frontend/src/y.ts" "D: feature commit" >/dev/null
# Build divergent main-line off A
git -C "$GIT_REPO" checkout -q -b tmp-main "$A_SHA"
C_SHA=$(commit_file "$GIT_REPO" "frontend/e2e/main-only.spec.ts" "C: main adds e2e spec")
git -C "$GIT_REPO" checkout -q main
# Wire remote refs.
set_remote_ref "$GIT_REPO" main "$C_SHA"
set_remote_ref "$GIT_REPO" redesign "$B_SHA"

assert_exit \
  "[task] branch off redesign (no e2e changes) ignores main's e2e diff → exit 0" \
  0 "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 3 (TASK CASE): e2e change + missing .last-run.json → exit 1
# ────────────────────────────────────────────────────────────────────────────

init_repo "stale_no_lastrun"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add new spec" >/dev/null

assert_exit \
  "[task] e2e change + missing .last-run.json → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "[task] missing .last-run.json → error mentions make test-e2e" \
  "make test-e2e" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 4 (TASK CASE): e2e change + status=passed + fresh JSON → exit 0
# ────────────────────────────────────────────────────────────────────────────

init_repo "fresh_passed"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add new spec" >/dev/null
touch -d "10 seconds ago" "$GIT_REPO/frontend/e2e/new.spec.ts"
write_last_run "$GIT_REPO" "passed"

assert_exit \
  "[task] e2e change + status=passed + JSON newer than spec → exit 0" \
  0 "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 5: status=failed → exit 1, message contains "failed"
# ────────────────────────────────────────────────────────────────────────────

init_repo "status_failed"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add spec" >/dev/null
touch -d "10 seconds ago" "$GIT_REPO/frontend/e2e/new.spec.ts"
write_last_run "$GIT_REPO" "failed"

assert_exit \
  "status=failed → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "status=failed → message includes 'failed'" \
  "'failed'" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 6: status=interrupted → exit 1, message contains "interrupted"
# ────────────────────────────────────────────────────────────────────────────

init_repo "status_interrupted"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add spec" >/dev/null
touch -d "10 seconds ago" "$GIT_REPO/frontend/e2e/new.spec.ts"
write_last_run "$GIT_REPO" "interrupted"

assert_exit \
  "status=interrupted → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "status=interrupted → message includes 'interrupted'" \
  "'interrupted'" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 7: spec mtime newer than .last-run.json → exit 1, lists stale spec
# ────────────────────────────────────────────────────────────────────────────

init_repo "stale_mtime"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add spec" >/dev/null
# Write .last-run.json first (older), then sleep + touch spec (newer)
write_last_run "$GIT_REPO" "passed"
touch -d "20 seconds ago" "$GIT_REPO/frontend/test-results/.last-run.json"
touch "$GIT_REPO/frontend/e2e/new.spec.ts"

assert_exit \
  "spec newer than .last-run.json → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "stale spec → error lists the stale spec" \
  "frontend/e2e/new.spec.ts" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 8: status field absent → exit 1, mentions "missing or unreadable"
# ────────────────────────────────────────────────────────────────────────────

init_repo "status_absent"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add spec" >/dev/null
touch -d "10 seconds ago" "$GIT_REPO/frontend/e2e/new.spec.ts"
printf '{}\n' > "$GIT_REPO/frontend/test-results/.last-run.json"

assert_exit \
  "status field absent → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "status absent → message says missing or unreadable" \
  "missing or unreadable" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 9: deleted spec (in diff but not on disk) → exit 0
# ────────────────────────────────────────────────────────────────────────────

init_repo "deleted_spec"
commit_file "$GIT_REPO" "frontend/e2e/will-delete.spec.ts" "base with spec" >/dev/null
BASE_SHA=$(git -C "$GIT_REPO" rev-parse HEAD)
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
git -C "$GIT_REPO" rm -q "frontend/e2e/will-delete.spec.ts"
git -C "$GIT_REPO" commit -q -m "delete spec"
write_last_run "$GIT_REPO" "passed"

assert_exit \
  "deleted spec → exit 0" \
  0 "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 10: no remote refs → exit 0 (cannot determine base; skip)
# ────────────────────────────────────────────────────────────────────────────

init_repo "no_remotes"
commit_file "$GIT_REPO" "frontend/e2e/new.spec.ts" "add spec, no remote" >/dev/null
# Do NOT set any refs/remotes/origin/*

assert_exit \
  "no remote refs → exit 0 (cannot determine base, skip)" \
  0 "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 11: two specs, one stale, one fresh → exit 1, lists only the stale one
# ────────────────────────────────────────────────────────────────────────────

init_repo "multi_one_stale"
BASE_SHA=$(commit_file "$GIT_REPO" "README" "base")
set_remote_ref "$GIT_REPO" main "$BASE_SHA"
commit_file "$GIT_REPO" "frontend/e2e/a.spec.ts" "spec a" >/dev/null
commit_file "$GIT_REPO" "frontend/e2e/b.spec.ts" "spec b" >/dev/null
touch -d "30 seconds ago" "$GIT_REPO/frontend/e2e/a.spec.ts"
write_last_run "$GIT_REPO" "passed"
touch -d "20 seconds ago" "$GIT_REPO/frontend/test-results/.last-run.json"
touch "$GIT_REPO/frontend/e2e/b.spec.ts"

assert_exit \
  "two specs, one stale → exit 1" \
  1 "$GIT_REPO"
assert_output_contains \
  "two specs, one stale → b.spec.ts listed" \
  "b.spec.ts" \
  "$GIT_REPO"

# ────────────────────────────────────────────────────────────────────────────
# Test 12: lefthook.yml structural assertions — playwright-fresh entry no
# longer uses glob: or {push_files} since the script computes its own diff.
# ────────────────────────────────────────────────────────────────────────────

REPO_LEFTHOOK="$(cd "$SCRIPT_DIR/.." && pwd)/lefthook.yml"

# Extract the playwright-fresh stanza using awk so the assertion isn't
# constrained to a fixed context window.
playwright_stanza=$(awk '
  /^[[:space:]]*playwright-fresh:[[:space:]]*$/ { in_stanza=1; print; next }
  in_stanza && /^[[:space:]]*[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_stanza=0 }
  in_stanza { print }
' "$REPO_LEFTHOOK")

if echo "$playwright_stanza" | grep -q 'run:.*check-playwright-fresh.sh'; then
  echo "PASS: lefthook.yml playwright-fresh references the hook script"
  PASS=$((PASS + 1))
else
  echo "FAIL: lefthook.yml playwright-fresh does not reference the hook script"
  FAIL=$((FAIL + 1))
fi

if echo "$playwright_stanza" | grep -q 'push_files'; then
  echo "FAIL: lefthook.yml playwright-fresh still references push_files"
  FAIL=$((FAIL + 1))
else
  echo "PASS: lefthook.yml playwright-fresh does not pass push_files"
  PASS=$((PASS + 1))
fi

if echo "$playwright_stanza" | grep -q 'glob:'; then
  echo "FAIL: lefthook.yml playwright-fresh still has a glob filter"
  FAIL=$((FAIL + 1))
else
  echo "PASS: lefthook.yml playwright-fresh has no glob (script does its own scoping)"
  PASS=$((PASS + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test 13: check-playwright-fresh.sh is executable
# ────────────────────────────────────────────────────────────────────────────

if [ -x "$SCRIPT" ]; then
  echo "PASS: check-playwright-fresh.sh is executable"
  PASS=$((PASS + 1))
else
  echo "FAIL: check-playwright-fresh.sh is not executable"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Test 14: block-hook-bypass.sh blocks the per-hook env-var exclusion token.
# Avoid putting the literal token on this line by assembling it from parts —
# the blocker would otherwise reject a Bash invocation of this very test.
# ────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BYPASS_HOOK="$REPO_ROOT/.claude/hooks/block-hook-bypass.sh"

# Assemble the token from concatenation so this script source doesn't trip
# the blocker if someone bash-invokes the test via a Claude Code Bash tool.
TOKEN_LIT="LEFTHOOK_EXC""LUDE"
synthetic_input=$(printf '{"tool_input":{"command":"%s=playwright-fresh git push"}}' "$TOKEN_LIT")
result=$(echo "$synthetic_input" | bash "$BYPASS_HOOK")

if echo "$result" | grep -q '"decision":"block"'; then
  echo "PASS: block-hook-bypass.sh blocks the per-hook exclusion token"
  PASS=$((PASS + 1))
else
  echo "FAIL: block-hook-bypass.sh did not block the per-hook exclusion token"
  echo "  Result: $result"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
