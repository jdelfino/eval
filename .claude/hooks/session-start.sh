#!/usr/bin/env bash
# SessionStart hook: detect worktrees/branches and warn agent.
#
# When /clear runs, the session's working directory doesn't change.
# If a previous agent was working in a worktree or feature branch,
# the new session inherits that state. This hook warns the agent
# so it can return to main — unless the user explicitly directs
# it to work in the current worktree.

set -euo pipefail

# Derive the main repo path from git's common dir (works from any worktree).
# git-common-dir is always the .git of the main worktree.
git_common=$(git rev-parse --git-common-dir 2>/dev/null || echo "")

if [ -n "$git_common" ]; then
  # Resolve to absolute path, then strip the trailing /.git
  main_repo=$(cd "$git_common" 2>/dev/null && pwd)
  main_repo="${main_repo%/.git}"
fi

git_dir=$(git rev-parse --git-dir 2>/dev/null || echo "")
current_branch=$(git branch --show-current 2>/dev/null || echo "")
current_dir=$(pwd)

in_worktree=false
if [ -n "$git_common" ] && [ -n "$git_dir" ] && [ "$git_common" != "$git_dir" ]; then
  in_worktree=true
fi

# In-worktree case is handled deterministically by mark-stale-worktree.sh +
# block-stale-worktree.sh. Only the stale-branch-in-main-checkout case needs a
# text warning here.
if [ "$in_worktree" = false ] && [ -n "$current_branch" ] && [ "$current_branch" != "main" ]; then
  cat <<EOF
CRITICAL FIRST INSTRUCTION: You are on branch '$current_branch' from a previous session.

Before doing ANYTHING else, run: git checkout main
Continuing on a stale branch will lead to wrong diffs and lost work.
Do NOT respond to the user's message until you have returned to main (unless the user explicitly asks you to work on this branch).

EOF
fi

# Refresh GitHub App token (expires hourly, sessions often start later)
"$main_repo/.devcontainer/setup-github-app.sh"

# Persist GH_TOKEN for all Bash tool calls in this session.
# CLAUDE_ENV_FILE is the only way to set env vars that survive across Bash calls.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  token=$(cat "$main_repo/.gh-app-token" 2>/dev/null || true)
  if [ -n "$token" ]; then
    echo "export GH_TOKEN='$token'" >> "$CLAUDE_ENV_FILE"
  fi
fi

# Inject up-to-date bd workflow guidance from the installed bd version.
# Project-specific guidance lives in CLAUDE.md (auto-loaded by Claude Code).
if command -v bd >/dev/null 2>&1; then
  bd prime 2>/dev/null || true
fi
