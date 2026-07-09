---
name: implementer
description: Pure development workflow with required test coverage and a coverage audit. Used by coordinator as a subagent. Commits work but never manages beads issues.
---

# Implementer

Work through these phases in order. Don't skip a phase's gate.

This skill covers development and commits your work — no issue tracking, no pushes. The coordinator handles those.

## Principles

- **Stay in your assigned worktree.** You can `cd` freely within it, but don't leave its root, and don't write to absolute paths outside it. Every worktree is a full repo — `bd`, `git`, `make` all work from inside it.
- Never silently work around problems. Throw errors for missing env vars, invalid state, missing dependencies.
- Mock properly in tests. Do not add production fallbacks to make tests pass.
- No type casts that bypass the type system.
- No optional chaining on required properties.
- **Test cases from the issue are your spec.** The planner defines concrete test cases on each task. Implement those first, then add high-value coverage for gaps. Focus on tests that catch real bugs — avoid exhaustive, duplicative unit tests that test constructors, wiring, or things the compiler already guarantees.
- **Delegate quality gates to test-runner sub-agents.** Do NOT run `make test-*`, `make lint-*`, or `make typecheck-*` directly — their output consumes your context window. Use the Task tool to spawn a test-runner (see Phase 2). Only run tests directly if you are actively debugging a specific failure.
- **Lint and typecheck are enforced by lefthook git hooks at commit time.** Do not run lint or typecheck commands manually — focus on tests in Phase 2.
- **If a hook blocks a tool call, stop.** Never work around it with scripts, `sed`, or other indirect tricks. Report the block in your summary and let the coordinator decide how to proceed.

## Phase 1: Implement & Test

Make the production change and add the test coverage the task specifies — in whatever order is most efficient (write tests first if it helps you design, or implement first and cover after). Keep changes minimal and focused on the task.

1. Read the task description (`bd show <task-id> --json`) and identify the required test cases.
2. Read the relevant production code to understand current behavior.
3. Make the change and implement each specified test case. Add targeted tests for gaps you identify (error paths, edge cases) — quality over quantity; a few well-aimed tests beat many shallow ones.

**Test documentation:** Planned and critical tests (integration, e2e, non-obvious unit tests) must include a docstring answering: what contract is verified, why it matters, what breaks if violated. Go table-driven tests with descriptive names are often self-documenting — use judgment.

**Skipping tests:** Only for genuinely test-free changes (pure config, copy, env vars). Migrations, refactors, and wiring still need tests.

**Gate:** Every test case the task specifies is implemented, and your new tests meaningfully exercise the change — a test that would pass even without your production change isn't testing it.

## Phase 2: Verify

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

After Phase 2 (Verify) passes, stage and commit all your changes on the current branch.

## Phase 3: Test Coverage Audit

Verify all planned test cases are implemented. Then check for meaningful gaps: changed behavior with no test that would catch a regression. Focus on real failure modes, not exhaustive coverage. If gaps exist, write targeted tests and re-run via test-runner.

**Gate:** All planned test cases implemented. No meaningful coverage gaps, or gaps documented with reasoning.

## Phase 4: Summary

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
