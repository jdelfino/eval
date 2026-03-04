#!/usr/bin/env bash
# SessionStart hook: detect stale worktrees/branches and direct agent to main.
#
# When /clear runs, the session's working directory doesn't change.
# If a previous agent was working in a worktree or feature branch,
# the new session inherits that state. This hook detects the problem
# and tells the agent to fix it before doing anything else.

set -euo pipefail

MAIN_REPO="/workspaces/eval"

# Detect if we're in a linked worktree (not the main checkout)
git_common=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
git_dir=$(git rev-parse --git-dir 2>/dev/null || echo "")
current_branch=$(git branch --show-current 2>/dev/null || echo "")
current_dir=$(pwd)

in_worktree=false
if [ -n "$git_common" ] && [ -n "$git_dir" ] && [ "$git_common" != "$git_dir" ]; then
  in_worktree=true
fi

if [ "$in_worktree" = true ]; then
  cat <<EOF
# STALE WORKTREE DETECTED — ACTION REQUIRED

You are starting in a worktree from a previous session.
  Current directory: $current_dir
  Branch: $current_branch
  Main repository: $MAIN_REPO

**You MUST immediately run this command before doing anything else:**
  cd $MAIN_REPO

Then confirm you are on the main branch. If not, run: git checkout main

Do NOT work in, commit to, or modify this worktree. It belongs to a previous session.

EOF
elif [ "$current_dir" != "$MAIN_REPO" ] && [[ "$current_dir" == /workspaces/eval-* ]]; then
  # We're in a directory that looks like a worktree but git disagrees
  # (e.g., orphaned worktree directory)
  cat <<EOF
# STALE WORKING DIRECTORY DETECTED — ACTION REQUIRED

You are starting in what appears to be a previous session's worktree.
  Current directory: $current_dir
  Main repository: $MAIN_REPO

**You MUST immediately run this command before doing anything else:**
  cd $MAIN_REPO

EOF
elif [ -n "$current_branch" ] && [ "$current_branch" != "main" ]; then
  cat <<EOF
# NOT ON MAIN BRANCH — ACTION REQUIRED

You are on branch '$current_branch' instead of 'main'.

**You MUST immediately run this command before doing anything else:**
  git checkout main

EOF
fi

# Always output AGENTS.md (use absolute path so it works from any directory)
cat "$MAIN_REPO/AGENTS.md"
