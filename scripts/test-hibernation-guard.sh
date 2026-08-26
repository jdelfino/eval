#!/usr/bin/env bash
# Tests for the `hibernate` regex used by the hibernation-check guard job in
# .github/workflows/deploy-pipeline.yaml.
#
# The workflow greps prod tfvars for a bare `hibernate = true` line to decide
# whether to skip the build/deploy jobs. This proves the regex matches only
# genuine `hibernate = true` assignments — not a commented-out line, not
# `hibernate = false` — across whitespace variations (issue test case 3), and
# that the pattern tested here is the exact one shipped in the workflow, so
# the two cannot silently drift apart.
#
# Run from repo root: bash scripts/test-hibernation-guard.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKFLOW_FILE="$REPO_ROOT/.github/workflows/deploy-pipeline.yaml"

# Must match the pattern in the hibernation-check job's `run:` step verbatim.
# Section 1 below asserts that verbatim match so this test and the workflow
# cannot drift apart.
GUARD_PATTERN='^[[:space:]]*hibernate[[:space:]]*=[[:space:]]*true'

PASS=0
FAIL=0

# ── Test helpers ────────────────────────────────────────────────────────────

assert_matches() {
  local desc="$1" fixture="$2"
  if grep -qE "$GUARD_PATTERN" "$fixture"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (pattern did not match fixture)"
    echo "  Fixture: $(cat "$fixture")"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_matches() {
  local desc="$1" fixture="$2"
  if ! grep -qE "$GUARD_PATTERN" "$fixture"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (pattern matched fixture but should not have)"
    echo "  Fixture: $(cat "$fixture")"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

make_fixture() {
  local name="$1" content="$2"
  local path="${TMPDIR_ROOT}/${name}.tfvars"
  printf '%s\n' "$content" > "$path"
  echo "$path"
}

# ────────────────────────────────────────────────────────────────────────────
# 1. The pattern under test is the exact pattern shipped in the workflow. If
#    someone edits one without the other, this test fails — that is the
#    point (issue test case 4's "workflow YAML still parses" is validated
#    separately by validate-deploy-pipeline.py; this guards the regex text).
# ────────────────────────────────────────────────────────────────────────────

if grep -qF -- "$GUARD_PATTERN" "$WORKFLOW_FILE"; then
  echo "PASS: guard pattern appears verbatim in deploy-pipeline.yaml"
  PASS=$((PASS + 1))
else
  echo "FAIL: guard pattern not found verbatim in deploy-pipeline.yaml — test and workflow have drifted"
  echo "  Expected substring: $GUARD_PATTERN"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 2. Commented-out and false forms must NOT match (issue test case 3).
# ────────────────────────────────────────────────────────────────────────────

COMMENTED="$(make_fixture commented '# hibernate = true')"
assert_not_matches "Commented-out '# hibernate = true' does not match" "$COMMENTED"

FALSE_VAL="$(make_fixture false-val 'hibernate = false')"
assert_not_matches "'hibernate = false' does not match" "$FALSE_VAL"

# ────────────────────────────────────────────────────────────────────────────
# 3. Genuine true assignments must match, regardless of spacing.
# ────────────────────────────────────────────────────────────────────────────

NORMAL="$(make_fixture normal 'hibernate = true')"
assert_matches "'hibernate = true' matches" "$NORMAL"

NO_SPACES="$(make_fixture no-spaces 'hibernate=true')"
assert_matches "'hibernate=true' (no spaces) matches" "$NO_SPACES"

EXTRA_SPACES="$(make_fixture extra-spaces 'hibernate  =  true')"
assert_matches "'hibernate  =  true' (extra spaces) matches" "$EXTRA_SPACES"

# ────────────────────────────────────────────────────────────────────────────
# 4. Realistic shape: a commented explanatory line right next to the real
#    (currently false) assignment — this is exactly what
#    infrastructure/terraform/environments/prod/terraform.tfvars looks like.
#    Neither line may cause a false positive.
# ────────────────────────────────────────────────────────────────────────────

MIXED="$(make_fixture mixed '# When true, scales GKE to zero nodes and hibernate = true means the flag is on
hibernate = false')"
assert_not_matches "Commented mention of 'hibernate = true' + real 'hibernate = false' does not match" "$MIXED"

# ────────────────────────────────────────────────────────────────────────────
# 3. validate-deploy-pipeline.py rejects a duplicate job-level `if:` key.
#
#    The guard is applied by ANDing a condition into each job's existing
#    `if:`. Adding a second `if:` key instead is the natural mistake, and
#    PyYAML's safe_load does not raise on duplicate mapping keys — it keeps
#    the last value silently, so the guard would vanish with everything
#    still appearing to parse. validate-deploy-pipeline.py installs a loader
#    that rejects duplicates; nothing exercised it, because the real
#    workflow has no duplicates to catch.
# ────────────────────────────────────────────────────────────────────────────

VALIDATOR="$REPO_ROOT/scripts/validate-deploy-pipeline.py"
DUP_FIXTURE="$(mktemp -d)/dup-pipeline.yaml"
trap 'rm -rf "$(dirname "$DUP_FIXTURE")"' EXIT

python3 - "$WORKFLOW_FILE" "$DUP_FIXTURE" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
# Give build-push-go-api a second `if:` key, leaving its original intact.
s = s.replace("  build-push-go-api:\n", "  build-push-go-api:\n    if: always()\n", 1)
open(dst, "w").write(s)
PY

dup_exit=0
dup_output=$(python3 "$VALIDATOR" "$DUP_FIXTURE" 2>&1) || dup_exit=$?

if [ "$dup_exit" -ne 0 ] && echo "$dup_output" | grep -qi 'duplicate key'; then
  echo "PASS: validator rejects a duplicate job-level 'if:' key"
  PASS=$((PASS + 1))
else
  echo "FAIL: validator accepted a duplicate 'if:' key (exit $dup_exit)"
  echo "  Output: $dup_output"
  FAIL=$((FAIL + 1))
fi

# The unmodified workflow must still pass, or the check above proves nothing.
clean_exit=0
clean_output=$(python3 "$VALIDATOR" "$WORKFLOW_FILE" 2>&1) || clean_exit=$?

if [ "$clean_exit" -eq 0 ]; then
  echo "PASS: validator accepts the real deploy-pipeline.yaml"
  PASS=$((PASS + 1))
else
  echo "FAIL: validator rejected the real workflow (exit $clean_exit)"
  echo "  Output: $clean_output"
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
