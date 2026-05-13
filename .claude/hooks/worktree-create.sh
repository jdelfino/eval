#!/bin/bash
# Hook: WorktreeCreate — set up a worktree branched from the caller's HEAD.
# Fires when an agent spawns a subagent with isolation: "worktree".
# Stdout is consumed as the worktree path.

set -euo pipefail

INPUT=$(cat)

# Resolve the main repo root (follows symlinks through worktrees)
MAIN_REPO=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||')
[ -z "$MAIN_REPO" ] && MAIN_REPO=$(git rev-parse --show-toplevel 2>/dev/null)

NAME=$(echo "$INPUT" | jq -r '.name // empty')
[ -z "$NAME" ] && { echo ""; exit 0; }

WORKTREE_PATH="$MAIN_REPO/.claude/worktrees/$NAME"

# Branch from the caller's HEAD so subagent worktrees inherit the
# coordinator's feature branch.
BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

if [ ! -d "$WORKTREE_PATH" ]; then
  git -C "$MAIN_REPO" worktree add "$WORKTREE_PATH" -b "worktree-$NAME" "$BASE_BRANCH" >/dev/null 2>&1 || true
fi

# Symlink frontend deps so the worktree doesn't reinstall on every spawn.
[ ! -e "$WORKTREE_PATH/frontend/node_modules" ] && ln -s "$MAIN_REPO/frontend/node_modules" "$WORKTREE_PATH/frontend/node_modules" 2>/dev/null || true

echo "$WORKTREE_PATH"
