#!/usr/bin/env bash
# Tests for block-no-verify.sh
# Run: bash .claude/hooks/test-block-no-verify.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/block-no-verify.sh"

PASS=0
FAIL=0

check() {
  local description="$1"
  local input_json="$2"
  local expected_decision="$3"

  actual=$(echo "$input_json" | bash "$HOOK")
  actual_decision=$(echo "$actual" | jq -r '.decision')

  if [ "$actual_decision" = "$expected_decision" ]; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description"
    echo "  Input:    $input_json"
    echo "  Expected: $expected_decision"
    echo "  Got:      $actual_decision (full: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# --- Should DENY ---

check "--no-verify is denied" \
  '{"tool_input": {"command": "git commit --no-verify -m \"test\""}}' \
  "deny"

check "LEFTHOOK=0 is denied" \
  '{"tool_input": {"command": "LEFTHOOK=0 git commit -m \"test\""}}' \
  "deny"

check "LEFTHOOK_DISABLE=1 is denied" \
  '{"tool_input": {"command": "LEFTHOOK_DISABLE=1 git commit -m \"test\""}}' \
  "deny"

check "LEFTHOOK=false is denied" \
  '{"tool_input": {"command": "LEFTHOOK=false git commit -m \"test\""}}' \
  "deny"

check "--no-verify anywhere in command is denied" \
  '{"tool_input": {"command": "cd /repo && git push --no-verify"}}' \
  "deny"

# --- Should ALLOW ---

check "normal git commit is allowed" \
  '{"tool_input": {"command": "git commit -m \"fix: something\""}}' \
  "allow"

check "git push without flags is allowed" \
  '{"tool_input": {"command": "git push origin main"}}' \
  "allow"

check "LEFTHOOK in a string that is not bypass is allowed" \
  '{"tool_input": {"command": "echo LEFTHOOK_DISABLE"}}' \
  "allow"

check "LEFTHOOK=1 is allowed (not a bypass)" \
  '{"tool_input": {"command": "LEFTHOOK=1 git commit -m \"test\""}}' \
  "allow"

check "make test is allowed" \
  '{"tool_input": {"command": "make test"}}' \
  "allow"

check "non-Bash tool (no tool_input.command) is allowed" \
  '{"tool_input": {}}' \
  "allow"

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
