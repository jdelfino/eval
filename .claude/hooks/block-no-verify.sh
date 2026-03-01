#!/usr/bin/env bash
# PreToolUse hook: block git hook bypass attempts.
# Claude Code passes JSON on stdin with the tool input.
# We check tool_input.command for forbidden patterns.

set -euo pipefail

input=$(cat)

# Extract the command field; empty string if not present or on parse error
command=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

# Strip quoted strings so we only match flags, not string content
# (e.g., a PR body that mentions --no-verify shouldn't trigger a block)
stripped=$(printf '%s' "$command" | sed -E "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g")

# Check for forbidden bypass patterns
if printf '%s' "$stripped" | grep -qE '(--no-verify|LEFTHOOK=0(\s|$)|LEFTHOOK_DISABLE=1(\s|$)|LEFTHOOK=false(\s|$))'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Bypassing git hooks is not allowed. Remove --no-verify / LEFTHOOK=0 / LEFTHOOK_DISABLE=1 / LEFTHOOK=false from the command."}}
EOF
  exit 0
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
