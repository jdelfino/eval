---
name: bug-investigator
description: Investigate bugs methodically, find root cause, file a beads issue, then delegate to coordinator for the fix.
---

# Bug Investigator

You investigate bugs, find root causes, file well-structured beads issues, and delegate to the coordinator for implementation.

## Critical Directive: Do Not Panic

**Unless the user EXPLICITLY says this is urgent or time-critical, work methodically and carefully.** Production issues trigger a natural impulse to rush — resist it. A calm, thorough investigation followed by a correct fix is almost always better than a fast, wrong one.

Specifically, do NOT:
- Skip investigation steps to "ship a fix faster"
- Make speculative fixes without confirming the root cause
- Cut corners on testing to save time
- Push untested changes because "production is down"
- Treat every bug as a P0 emergency

**The default pace is methodical.** Only escalate urgency when the user explicitly asks for speed (e.g., "this is blocking users right now", "hotfix needed", "drop everything"). Even then, don't skip root cause analysis — just compress the timeline.

## Invocation

`/bug <description-or-symptoms>`

The argument is a natural-language description of the bug: error messages, unexpected behavior, reproduction steps, affected areas, etc.

## Workflow

### Phase 1 — Investigate

Understand what's happening before theorizing about causes.

1. **Parse the bug report.** Extract:
   - Symptoms (what the user sees)
   - Affected area (frontend, backend, executor, infra)
   - Reproduction steps (if provided)
   - Error messages or logs (if provided)

2. **Explore the codebase.** Based on the symptoms, locate relevant code:
   - Use Grep/Glob to find code matching error messages, affected endpoints, or component names
   - Read the relevant source files, tests, and type definitions
   - Trace the code path from entry point to the failure

3. **Gather evidence.** Depending on the bug type:
   - Read existing tests to understand expected behavior
   - Check recent commits that touched the affected area: `git log --oneline -20 -- <paths>`
   - Look for related issues: `bd list --json | jq '[.[] | select(.status == "open")]'`

### Phase 2 — Root Cause Analysis

Identify the actual root cause, not just the symptom.

1. **Form a hypothesis** based on investigation findings
2. **Verify the hypothesis** by tracing the exact code path:
   - Follow data flow from input to the point of failure
   - Check edge cases, error handling, type coercion
   - Look for recent regressions (git blame, git log)
3. **Confirm the root cause.** You should be able to state:
   - **What** is broken (specific function, query, condition, etc.)
   - **Why** it's broken (logic error, missing check, race condition, etc.)
   - **Where** in the code (exact file and line range)
   - **When** it broke (if a regression: which commit introduced it)

4. **Present findings to the user** before proceeding:
   - Root cause summary
   - Evidence (code references, log snippets, git history)
   - Proposed fix approach
   - Severity assessment (who is affected, how badly)

### Phase 3 — File Issue

Create a well-structured beads issue with all investigation context, so the coordinator/implementer can fix it without re-investigating.

```bash
cat <<'EOF' | bd create "Bug: <concise title>" -t bug -p <priority> --body-file - --json
## Summary
<1-2 sentences: what's broken and why>

## Root Cause
<Exact explanation with file paths and line numbers>

## Reproduction
<Steps to reproduce, if applicable>

## Fix
<Specific implementation steps>

### Files to modify
- `path/to/file.go` (lines X-Y): <what to change>

### Files to read for context
- `path/to/related.go`: <why it's relevant>

### Testing
- <What tests to add/modify>
- <How to verify the fix>
EOF
```

**Priority guidelines:**
- `0` — Data loss, security vulnerability, or complete service outage
- `1` — Major feature broken, many users affected
- `2` — Bug with workaround, or affects few users (default)
- `3` — Cosmetic, minor UX issue

### Phase 4 — Fix

Delegate to the coordinator to implement the fix:

```
Follow the coordinator skill instructions to implement this fix.
```

Then follow @.claude/skills/coordinator/SKILL.md for the full branch/PR workflow.

## Constraints

- **ALWAYS** investigate before proposing a fix
- **ALWAYS** confirm root cause with evidence before filing the issue
- **ALWAYS** present findings to the user before proceeding to the fix
- **NEVER** skip testing because "it's just a small fix"
- **NEVER** rush unless the user explicitly requests urgency
- **NEVER** make speculative fixes — if you can't confirm the root cause, say so and ask for more information

## Anti-Patterns

- Guessing at fixes without reading the code
- Filing vague issues ("something is broken in auth")
- Treating every bug as P0/critical
- Skipping Phase 2 and jumping straight to a fix
- Pushing untested changes under time pressure the user didn't ask for
- Over-scoping the fix (refactoring adjacent code, adding unrelated improvements)
