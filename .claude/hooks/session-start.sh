#!/usr/bin/env bash
# SessionStart hook: detect stale worktrees/branches and direct agent to main.
#
# When /clear runs, the session's working directory doesn't change.
# If a previous agent was working in a worktree or feature branch,
# the new session inherits that state. This hook detects the problem
# and tells the agent to fix it before doing anything else.

set -euo pipefail

# Derive the main repo path from git's common dir (works from any worktree).
# git-common-dir returns the shared .git dir; its parent is the main checkout.
# From the main repo it returns ".git" (relative), so we resolve it.
git_common=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
main_repo=$(cd "$(dirname "$(git rev-parse --absolute-git-dir 2>/dev/null || git rev-parse --git-common-dir 2>/dev/null)")/../$(basename "$git_common")" 2>/dev/null && cd .. && pwd || echo "")

# Simpler: git-common-dir is always the .git of the main worktree
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
# STALE WORKTREE DETECTED — ACTION REQUIRED

You are starting in a worktree from a previous session.
  Current directory: $current_dir
  Branch: $current_branch
  Main repository: $main_repo

**You MUST immediately run this command before doing anything else:**
  cd $main_repo

Then confirm you are on the main branch. If not, run: git checkout main

Do NOT work in, commit to, or modify this worktree. It belongs to a previous session.

EOF
elif [ -n "$current_branch" ] && [ "$current_branch" != "main" ]; then
  cat <<EOF
# NOT ON MAIN BRANCH — ACTION REQUIRED

You are on branch '$current_branch' instead of 'main'.

**You MUST immediately run this command before doing anything else:**
  git checkout main

EOF
fi

# Always output AGENTS.md
cat "$main_repo/AGENTS.md"
