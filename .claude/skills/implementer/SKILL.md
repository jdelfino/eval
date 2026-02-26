---
name: implementer
description: Pure development workflow with test-first development and coverage review. Used by coordinator as a subagent. Never manages beads issues or commits.
---

# Implementer

Follow these phases **in strict order**. Do not skip phases. Do not proceed until the current phase's gate is satisfied.

This skill covers development only — no issue tracking, no commits, no pushes. The coordinator handles those.

## Principles

- Never silently work around problems. Throw errors for missing env vars, invalid state, missing dependencies.
- Mock properly in tests. Do not add production fallbacks to make tests pass.
- No type casts that bypass the type system.
- No optional chaining on required properties.
- **Every production code change requires tests.** No exceptions for migrations, refactors, copy-paste, or "just wiring things up." If you wrote or modified production code, you must write tests for it. Never defer tests to a follow-up issue.
- **Delegate quality gates to test-runner sub-agents.** Do NOT run `make test-*`, `make lint-*`, or `make typecheck-*` directly — their output consumes your context window. Use the Task tool to spawn a test-runner (see Phase 3). Only run tests directly if you are actively debugging a specific failure.

## Spec Tests

A test specifier may have run before you and committed **behavioral tests** — tests that encode the planner's intent as executable assertions. These are a head start, not a complete specification. You still own full testing responsibility.

If spec tests exist in the worktree:
- Read them first to understand expected behavior and implementation hints
- Do NOT modify them — if one appears wrong, flag it in Phase 5 under "Spec test issues"
- They must pass along with all other tests in Phase 3
- They do NOT reduce your obligation to write thorough tests in Phase 1

## Phase 1: Write Failing Tests

Write tests for the behavior you are about to change or add. Do this **before** touching any production code.

**This phase is NOT optional.** Common excuses that do NOT exempt you from writing tests:
- "It's just a migration" — migrated code has new integration points that need testing
- "It's just wiring up an API client" — API client calls, error handling, and auth headers need tests
- "The old code didn't have tests" — that's a reason to add them, not skip them
- "I'll add tests later" — no, tests ship with the code, always
- "The spec tests already cover it" — spec tests encode intent, not complete coverage. Write your own tests for the behavior you're implementing.

1. Read the relevant production code to understand current behavior
2. Write new test cases that describe the desired behavior after your change
3. Verify your new tests fail by delegating to a test-runner sub-agent (see Phase 3)

**Gate:** Your new tests **fail** (or, for pure deletions/removals, you can write tests asserting the old behavior is gone — these will pass after implementation). If your new tests already pass, they are not testing anything new. Rewrite them.

## Phase 2: Implement

Make the production code changes. Keep changes minimal and focused on the task.

## Phase 3: Verify

**Delegate quality gate runs to a test-runner sub-agent** to preserve your context window. Do NOT run these commands directly with the Bash tool — test output is verbose and wastes context you need for later phases. Use the Task tool with `subagent_type: "Bash"` and `model: "haiku"`:

```
ROLE: Test Runner
SKILL: Read and follow .claude/skills/test-runner/SKILL.md

WORKING DIRECTORY: <worktree-path>
COMMANDS:
- <commands from Quality Gates table in CLAUDE.md matching changed code>

For example, for Go backend changes: make test-api, make lint-api
For frontend changes: make test-frontend, make lint-frontend, make typecheck-frontend
For store changes, also: make test-integration-store
```

**Gate:** Sub-agent reports PASS (including any spec tests). If FAIL, read the error summary, fix the issue, and re-delegate. Only run quality gates directly in your own context if you need to debug a failure interactively.

## Phase 4: Test Coverage Audit

Evaluate whether your tests actually cover the changes you made. Do NOT re-read files you already have in context from writing them.

1. List changed files: `git diff --name-only`
2. For each changed production file, evaluate from what you already know:
   - What behavior changed? (new feature, bug fix, removed feature, refactored logic)
   - Do your tests cover: happy path, error paths, edge cases, regressions?
   - Are integration tests needed? (persistence, API routes, auth, cross-layer data flow)
3. If gaps exist: write the missing tests, then re-run quality gates via test-runner sub-agent (same as Phase 3).

**Gate:** No coverage gaps remain, or gaps are documented with reasoning (e.g., "Changes were purely deletions; added regression tests in Phase 1 confirming removed elements no longer render").

## Phase 5: Summary

**This must be the very last thing you output.** The coordinator reads your result — keep it concise to avoid polluting its context.

Produce exactly this and nothing else after it:

```
IMPLEMENTATION RESULT: SUCCESS | FAILURE

Task: <task-id or "N/A" if not provided>
Commit: <full commit hash, or "N/A" on failure>

## What changed
- <1 bullet per logical change, max 5>

## Files modified
- <path> — <what changed in 1 phrase>

## Test coverage
- <1 bullet per test file added/modified, what it covers>

## Spec test issues
- <any spec tests that appear incorrect, with reasoning — or "None">

## Concerns
- <anything the coordinator should know, or "None">
```

If implementation failed, replace "What changed" with:

```
## Error
<what went wrong — 1-3 sentences>

## Attempted
- <what you tried>
```
