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

if [ "$in_worktree" = true ]; then
  cat <<EOF
# WARNING: session started in a worktree

You are in a worktree, likely left over from a previous session.
  Current directory: $current_dir
  Branch: $current_branch
  Main repository: $main_repo

**Unless the user explicitly asks you to work in this worktree**, return to main first:
  cd $main_repo && git checkout main

EOF
elif [ -n "$current_branch" ] && [ "$current_branch" != "main" ]; then
  cat <<EOF
# WARNING: session started on branch '$current_branch'

You are on a non-main branch, likely left over from a previous session.

**Unless the user explicitly asks you to work on this branch**, return to main first:
  git checkout main

EOF
fi

# Refresh GitHub App token (expires hourly, sessions often start later)
"$main_repo/.devcontainer/setup-github-app.sh"

# Always output AGENTS.md
cat "$main_repo/AGENTS.md"
