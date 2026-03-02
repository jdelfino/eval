---
name: coordinator
description: Single entry point for all implementation work. Triages tasks, manages beads issues, delegates to implementer skill, runs reviewers, creates PRs.
---

# Coordinator

You are the single entry point for all implementation work. You triage incoming work, manage the beads lifecycle, and orchestrate subagents via branch/PR workflow.

**Model guidance:** The coordinator should run on Opus 4.6. Implementer subagents should run on Sonnet 4.6 (`model: "sonnet"`).

**IMPORTANT:** The main branch is protected. All changes MUST go through a feature branch and PR. Direct commits to main are not allowed.

## Phase 1: Triage

### 1. Parse Input

The input is either a beads ID or an ad-hoc description.

**If beads ID:**
```bash
bd show <id> --json
```

If it's an epic, also fetch subtasks:
```bash
bd list --parent <id> --json
```

**If ad-hoc description (no beads ID):**
Create a beads issue first:
```bash
bd create "<description>" -t <task|bug|feature> -p 2 --json
```

---

## Branch Mode

All work uses branches and PRs. Uses worktrees and subagents.

### 1. Setup

```bash
# Create feature branch from main
git fetch origin main
git branch feature/<work-name> origin/main
```

### 2. Implement Tasks

**Follow the dependency graph from beads.** Spawn all currently-unblocked tasks in parallel. When a task completes, check if any blocked tasks are now unblocked and spawn those.

For each task:

#### a. Claim
```bash
bd update <task-id> --set-labels wip --json
```

#### b. Create Per-Task Worktree

```bash
git branch feature/<work-name>/<task-id> feature/<work-name>
git worktree add ../<project>-<task-id> feature/<work-name>/<task-id>
ln -s /workspaces/eval/frontend/node_modules ../<project>-<task-id>/frontend/node_modules
```

#### c. Spawn Implementer Subagent

Use the Task tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
ROLE: Implementer
SKILL: Read and follow .claude/skills/implementer/SKILL.md

WORKTREE: ../<project>-<task-id>
TASK: <task-id>
Read the task description: bd show <task-id> --json

CONSTRAINTS:
- Work ONLY in the worktree path above
- Do NOT modify beads issues
- Commit and push your work when implementer phases are complete
- Phase 5 of the implementer skill produces a structured summary — that is your final output
```

#### d. Handle Result

The implementer's final output is a structured summary (Phase 5). Only read that summary — ignore intermediate tool output from the subagent.

**On SUCCESS:** integrate into the feature branch (sequential — do NOT run in parallel with other integrations).

**Try fast-path rebase first** (inline bash — no subagent):

```bash
cd ../<project>-<task-id>
git rebase <target-branch> && \
  git branch -f <target-branch> HEAD && \
  git worktree remove ../<project>-<task-id> --force 2>/dev/null; \
  git branch -D <source-branch> 2>/dev/null; \
  echo "REBASE: OK"
```

If the rebase command fails (conflict), abort and fall back to a rebase subagent:

```bash
git rebase --abort
```

Then spawn the rebase subagent to resolve conflicts:

```
ROLE: Rebase Agent (Conflict Resolution)
SKILL: Read and follow .claude/skills/rebase/SKILL.md

SOURCE: <source-branch>
TARGET: <target-branch>
WORKTREE: ../<project>-<task-id>
CLEANUP: true
BEADS_IDS: <comma-separated task IDs whose changes are on the source branch>
```

**After successful integration** (either path):
```bash
bd close <task-id> --reason "Implemented" --json
```
Check the "Concerns" section — file follow-up issues if needed.

**On rebase subagent FAILURE:**
- Spawn a new implementer in a fresh worktree to resolve the conflict
- If blocked: note the blocker, move to next task
- Do NOT close the task

### 3. Pre-PR Review

Reviews are **optional** for small, isolated changes (single-file fixes, typo corrections, config tweaks). For anything of any complexity — multi-file changes, new features, behavioral changes, refactors — reviews are **required**.

After all tasks are merged into the feature branch, create a worktree for the feature branch to use for reviews and the test-runner:

```bash
git worktree add ../<project>-<work-name> feature/<work-name>
ln -s /workspaces/eval/frontend/node_modules ../<project>-<work-name>/frontend/node_modules
```

Then run 3 specialized reviews **in parallel** using the Task tool:

**Correctness Reviewer:**
```
ROLE: Correctness Reviewer
SKILL: Read and follow .claude/skills/reviewer-correctness/SKILL.md

WORKTREE: ../<project>-<work-name>
BASE: origin/main
SUMMARY: <what this PR implements>
```

**Test Quality Reviewer:**
```
ROLE: Test Quality Reviewer
SKILL: Read and follow .claude/skills/reviewer-tests/SKILL.md

WORKTREE: ../<project>-<work-name>
BASE: origin/main
SUMMARY: <what this PR implements>
```

**Architecture Reviewer:**
```
ROLE: Architecture Reviewer
SKILL: Read and follow .claude/skills/reviewer-architecture/SKILL.md

WORKTREE: ../<project>-<work-name>
BASE: origin/main
SUMMARY: <what this PR implements>
REFERENCE DIRS: <key directories in the existing codebase to compare against>
```

**Handle review results:**

- **Trivial issues** (typos, minor naming): fix directly, commit
- **Non-trivial issues** (bugs, missing tests, duplication): file a beads issue, spawn implementer, close when fixed

After all issues resolved, run quality gates via a test-runner sub-agent. **Only run integration tests here** — unit tests and contract coverage are handled by pre-push hooks when pushing in Phase 4. Use the Task tool with `subagent_type: "Bash"` and `model: "haiku"`:

```
ROLE: Test Runner
SKILL: Read and follow .claude/skills/test-runner/SKILL.md

WORKING DIRECTORY: ../<project>-<work-name>
COMMANDS:
- <integration test commands matching changed code — see Hooks section below>
```

**Skip the test-runner entirely** if no integration tests are needed (e.g., frontend-only changes with no store layer involvement). **Do NOT create PR if the test-runner reports FAIL.** Fix locally first (spawn implementer if non-trivial).

### 4. Create PR and Hand Off

```bash
cd ../<project>-<work-name>
git push -u origin feature/<work-name>

gh pr create --title "<type>: <title>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Changes
<list of significant changes>

## Test plan
- [ ] Tests pass
- [ ] <manual verification steps if any>

Beads: <comma-separated list of all beads issue IDs included in this PR>

Generated with Claude Code
EOF
)"
```

**After creating the PR:**

1. **Check for skill/agent config changes.** PRs that modify agent behavior MUST have human review before merging — agents must not modify their own instructions without human oversight:
   ```bash
   SKILL_CHANGES=$(gh pr diff <number> --name-only | grep -E '\.claude/(skills/|settings\.json|hooks/)' || true)
   if [ -n "$SKILL_CHANGES" ]; then
     gh pr edit <number> --add-label "human-review-required"
   fi
   ```
   If skill changes are detected, ALWAYS report this prominently and ask the user to review or assign a reviewer.

2. If user indicated review needed, or skill changes were detected: request review
   ```bash
   gh pr edit <number> --add-reviewer <username>
   ```
3. Label beads issues as `in-pr`:
   ```bash
   bd update <id> --set-labels in-pr --json
   ```
4. Report: "PR #X opened. `/merge` will handle CI and merging."

**Do NOT** watch CI, merge, or wait for approval. The `/merge` agent handles all of that.

**Do NOT** clean up worktrees or branches. The `/merge` agent does this after successful merge, since worktrees may be needed for rebases.

---

## Anti-Patterns

- Committing directly to main (branch is protected — all changes require a PR)
- Starting dependent task before blocker is closed
- Creating PR before running specialized reviews
- Creating PR with failing tests
- Merging PRs (that's `/merge`'s job)
- Watching CI (that's `/merge`'s job)
- Cleaning up worktrees before merge (that's `/merge`'s job)
- Running integrations in parallel (must be sequential for linear history)
- Spawning a rebase subagent when there are no conflicts (use inline fast-path first)
- Fixing non-trivial review issues inline — file issues and spawn implementers instead
- Running quality gates directly in coordinator context — always delegate to test-runner sub-agents
- Merging PRs that touch `.claude/skills/`, `.claude/settings.json`, or `.claude/hooks/` without human review — these modify agent behavior and require explicit human approval

## Hooks — What's Automatic vs Manual

Lefthook git hooks run quality gates automatically. Do NOT duplicate these in test-runner prompts.

**Pre-commit hooks (automatic at commit time) — never run manually:**
- `make lint-api`, `make lint-executor`, `make lint-frontend`
- `make typecheck-frontend`
- `make check-api-imports`

**Pre-push hooks (automatic at push time) — never run in coordinator test-runner:**
- `make test-api`, `make test-executor`, `make test-frontend`
- `make check-contract-coverage`

**Integration tests (NOT in hooks) — run in coordinator test-runner when relevant:**
- `make test-integration-store` — store/DB changes
- `make test-integration-realtime` — realtime/Centrifugo changes
- `make test-integration-api` — API handler changes
- `make test-integration-contract` — API contract changes

Note: implementer subagents DO run unit tests (`make test-api`, etc.) for TDD feedback before committing. Pre-push hooks re-running them is an accepted safety net, not wasteful duplication.
