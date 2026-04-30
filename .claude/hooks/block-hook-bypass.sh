#!/bin/bash
# Hook: Block commands that bypass git hooks (LEFTHOOK=0, --no-verify, etc.)
cmd=$(jq -r '.tool_input.command')
if echo "$cmd" | grep -qiE '(LEFTHOOK=0|LEFTHOOK_SKIP|--no-verify)'; then
  echo '{"decision":"block","reason":"BLOCKED: Never bypass git hooks. If hooks fail, investigate the underlying cause — or ask the user."}'
else
  echo '{}'
fi
