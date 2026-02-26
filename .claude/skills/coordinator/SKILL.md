---
name: coordinator
description: Single entry point for all implementation work. Triages tasks, manages beads issues, delegates to test specifier and implementer skills, runs reviewers, creates PRs.
---

# Coordinator

You are the single entry point for all implementation work. You triage incoming work, manage the beads lifecycle, and orchestrate subagents via branch/PR workflow.

**Model guidance:** The coordinator should run on Opus 4.6. Test specifier and implementer subagents should run on Sonnet 4.6 (`model: "sonnet"`).

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

# Create worktree
git worktree add ../<project>-<work-name> feature/<work-name>

# CRITICAL: Symlink node_modules BEFORE spawning subagents
# (worktree branches from main, so packages match — no need to reinstall)
ln -s /workspaces/eval/frontend/node_modules ../<project>-<work-name>/frontend/node_modules
```

### 2. Conflict Avoidance

Before parallelizing tasks, analyze file overlap:

Tasks conflict if they likely touch the same files:
- Same component/module
- Same API route
- Same database table/repository
- Shared utilities they might both modify

```
Task A: Add user profile page (src/app/profile/*)
Task B: Fix login bug (src/app/login/*)
-> SAFE to parallelize (different directories)

Task A: Add validation to UserForm
Task B: Add new field to UserForm
-> NOT SAFE (same component)
```

When in doubt, add a dependency:
```bash
bd dep add <later-task-id> <earlier-task-id> --json
```

### 3. Implement Tasks

**Independent tasks CAN run in parallel. Dependent tasks MUST wait.**

For each task:

#### a. Claim
```bash
bd update <task-id> --set-labels wip --json
```

#### b. Spawn Test Specifier

Use the Task tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
SKILL: .claude/skills/test-specifier/SKILL.md
WORKTREE: ../<project>-<work-name>
TASK: bd show <task-id> --json
Commit test files when done. Do not modify beads issues.
```

**On SUCCESS:** Proceed to step c. Pass the test specifier's "Test files written" and "Key behaviors specified" sections to the implementer prompt.

**On FAILURE:** Proceed to step c anyway — the implementer owns full testing responsibility regardless.

#### c. Spawn Implementer

Use the Task tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
SKILL: .claude/skills/implementer/SKILL.md
WORKTREE: ../<project>-<work-name>
TASK: bd show <task-id> --json
SPEC TESTS: <paste "Test files written" and "Key behaviors specified" from test specifier summary, or "None" if specifier failed>
Do not modify beads issues. Commit and push when done.
```

#### d. Handle Result

The implementer's final output is a structured summary (Phase 5). Only read that summary — ignore intermediate tool output from the subagent.

**On SUCCESS:**
```bash
bd close <task-id> --reason "Implemented" --json
```
Check "Concerns" and "Spec test issues" sections — file follow-up issues if needed.

**On FAILURE:**
- If recoverable: fix directly or spawn new subagent with clarification
- If blocked: note the blocker, move to next task
- Do NOT close the task

### 4. Pre-PR Review

Reviews are **optional** for small, isolated changes (single-file fixes, typo corrections, config tweaks). For anything of any complexity — multi-file changes, new features, behavioral changes, refactors — reviews are **required**.

After all tasks are complete, run 3 specialized reviews **in parallel** using the Task tool:

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

After all issues resolved, run quality gates via a test-runner sub-agent. Use the Task tool with `subagent_type: "Bash"` and `model: "haiku"`:

```
ROLE: Test Runner
SKILL: Read and follow .claude/skills/test-runner/SKILL.md

WORKING DIRECTORY: ../<project>-<work-name>
COMMANDS:
- <all quality gate commands from CLAUDE.md matching changed code areas>
```

**Do NOT create PR if the test-runner reports FAIL.** Fix locally first (spawn implementer if non-trivial).

### 5. Create PR and Hand Off

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

1. If user indicated review needed: request review
   ```bash
   gh pr edit <number> --add-reviewer <username>
   ```
2. Label beads issues as `in-pr`:
   ```bash
   bd update <id> --set-labels in-pr --json
   ```
3. Report: "PR #X opened. `/merge` will handle CI and merging."

**Do NOT** watch CI, merge, or wait for approval. The `/merge` agent handles all of that.

**Do NOT** clean up worktrees or branches. The `/merge` agent does this after successful merge, since worktrees may be needed for rebases.

---

## Anti-Patterns

- Committing directly to main (branch is protected — all changes require a PR)
- Starting dependent task before blocker is closed
- Parallelizing tasks that touch same files
- Creating PR before running specialized reviews
- Creating PR with failing tests
- Merging PRs (that's `/merge`'s job)
- Watching CI (that's `/merge`'s job)
- Cleaning up worktrees before merge (that's `/merge`'s job)
- Running `npm ci` in a worktree (it nukes node_modules through the symlink — use `npm install <pkg>` for additive changes, or break the symlink first if a full reinstall is needed)
- Fixing non-trivial review issues inline — file issues and spawn implementers instead
- Skipping the test specifier — always run it first unless the task genuinely has no testable behavior
- Running quality gates directly in coordinator context — always delegate to test-runner sub-agents
