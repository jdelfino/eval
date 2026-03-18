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
- **Test cases from the issue are your spec.** The planner defines concrete test cases on each task. Implement those first, then add high-value coverage for gaps. Focus on tests that catch real bugs — avoid exhaustive, duplicative unit tests that test constructors, wiring, or things the compiler already guarantees.
- **Delegate quality gates to test-runner sub-agents.** Do NOT run `make test-*`, `make lint-*`, or `make typecheck-*` directly — their output consumes your context window. Use the Task tool to spawn a test-runner (see Phase 3). Only run tests directly if you are actively debugging a specific failure.
- **Lint and typecheck are enforced by lefthook git hooks at commit time.** Do not run lint or typecheck commands manually — focus on tests in Phase 3.

## Phase 1: Write Failing Tests

Implement the **test cases defined in the task issue** before touching production code. These are your acceptance criteria — they define what "done" looks like.

1. Read the task description (`bd show <task-id> --json`) and identify the test cases
2. Read the relevant production code to understand current behavior
3. Implement each specified test case
4. Add additional high-value tests for gaps you identify (error paths, edge cases) — but focus on quality over quantity. A few well-targeted tests beat many shallow ones.
5. Verify your new tests fail by delegating to a test-runner sub-agent (see Phase 3)

**Test documentation:** Planned and critical tests (integration, e2e, and non-obvious unit tests) must include a docstring or block comment answering:
- **What** behavioral contract is being verified?
- **Why** does it matter to correctness?
- **What breaks** if this contract is violated?

Go table-driven tests with descriptive names are often self-documenting — use judgment on whether a docstring adds value.

**Skipping tests:** Tests can be skipped only for genuinely test-free changes — pure config, copy, environment variables. This should be rare. Migrations, refactors, and wiring changes still need tests.

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
- <test commands from the Quality Gates table in CLAUDE.md matching changed code>
```

**Only run `test-*` commands.** Lint, typecheck, and import checks are enforced automatically by pre-commit hooks — do not run them here. Pre-push hooks also re-run unit tests as a safety net, but you must run them here first for the TDD feedback loop.

**Gate:** Sub-agent reports PASS. If FAIL, read the error summary, fix the issue, and re-delegate. Only run quality gates directly in your own context if you need to debug a failure interactively.

## Phase 4: Test Coverage Audit

Check whether all planned test cases were implemented and whether any meaningful gaps remain. Do NOT re-read files you already have in context from writing them.

1. Verify all test cases from the task issue are implemented
2. For each changed production file, evaluate from what you already know:
   - What behavior changed?
   - Are there meaningful gaps not covered by the planned tests? (error paths, edge cases, regressions)
   - Would an additional test catch a real bug, or would it just be exhaustive coverage?
3. If meaningful gaps exist: write targeted tests, then re-run quality gates via test-runner sub-agent (same as Phase 3).

Do NOT pad coverage with low-value unit tests. A missing test for a real failure mode is a gap; a missing test for a constructor or a getter is not.

**Gate:** All planned test cases implemented. No meaningful coverage gaps remain, or gaps are documented with reasoning.

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
