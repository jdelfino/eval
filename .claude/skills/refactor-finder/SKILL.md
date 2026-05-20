---
name: refactor-finder
description: Autonomous codebase cruft discovery. Scans for duplication, dead code, leaky abstractions, pattern divergence, and complexity. Files findings as beads issues. Invoked via /refactor-finder.
user_invocable: true
---

# Refactor Finder

You are a refactor-finder agent. Your job is to autonomously discover refactoring opportunities across the codebase and file findings as beads issues for future work.

## Relation to reviewer-architecture

reviewer-architecture catches duplication, pattern divergence, and leaky abstractions in PR diffs at review time. refactor-finder catches those same categories (plus dead code, complexity, test smells) across already-merged code at discovery time. They are complementary: one is reactive on changes; the other is proactive on accumulated cruft. Do not collapse them.

## Invocation

`/refactor-finder [scope]`

- If given a scope argument (path or topic): focus reconnaissance and deep-dive on that scope
- If no scope: scan the whole repo via signal-driven reconnaissance, then surface ranked candidates for user selection

---

## Phase 1 — Reconnaissance

Run a cheap, whole-codebase signal pass to identify candidate scopes. If invoked with a scope argument, restrict these commands to that path. Otherwise scan from the repo root.

### Signal collection

**File size outliers** — surface files in the top percentile by LOC:
```bash
find . \( -name "*.go" -o -name "*.ts" -o -name "*.tsx" -o -name "*.py" \) | \
  xargs wc -l 2>/dev/null | sort -rn | head -30
```

**Function/method density** — files with many top-level definitions suggest either a god-object or legitimate hub:
```bash
# Go: count top-level func declarations per file
find . -name "*.go" | xargs grep -c "^func " 2>/dev/null | sort -t: -k2 -rn | head -20
# TS/TSX: count function/class/const exports per file
find . \( -name "*.ts" -o -name "*.tsx" \) | xargs grep -c "^export " 2>/dev/null | sort -t: -k2 -rn | head -20
```

**Git churn** — frequently modified files are hot spots for complexity:
```bash
git log --pretty=format: --name-only --since=6.months | sort | uniq -c | sort -rn | head -30
```

**Long-untouched files** — stale code that may contain dead or obsolete logic:
```bash
# Surface files last touched more than 6 months ago (sample from large/interesting files)
git log -1 --format="%cd %H" --date=short -- <file>
```

**TODO/FIXME density** — acknowledged but unresolved debt:
```bash
grep -rn "TODO\|FIXME\|XXX\|HACK" \
  --include="*.go" --include="*.ts" --include="*.tsx" --include="*.py" \
  . | grep -v node_modules | grep -v ".git"
```

**Deep nesting** — heuristic for complexity:
```bash
grep -rn "^\s\{20,\}" --include="*.go" --include="*.ts" --include="*.tsx" . | \
  grep -v node_modules | grep -v ".git" | head -30
```

### Output of Phase 1

Aggregate the signals into ranked candidate **scopes** — described in whatever form fits the codebase: a directory, a feature, a file cluster, a code path. The scope is whatever a human would point at and say "go look there." No imposed taxonomy or slug naming. Each candidate entry should include:
- Scope description (path, prose, or both — whatever fits)
- Signals that flagged it (LOC, churn count, TODO count, nesting hits, etc.)

---

## Phase 2 — Selection

Present the Phase 1 ranked candidate scopes to the user. Do NOT impose a taxonomy — describe each scope as the agent naturally would.

### Present candidates to user

Use AskUserQuestion with up to 4 options per call. Present the top ranked candidates with rationale:

```
Option label example: "executor sandbox setup — 4 files >500 LOC, 12 TODO markers, low churn"
```

Ask the user to pick 1-2 scopes to deep-dive. Do NOT proceed to Phase 3 without user selection.

---

## Phase 3 — Deep-dive (3 parallel sub-scanners)

Spawn 3 parallel subagents via the Task/Agent tool. Use **inline ROLE prompt blocks** — do NOT use a `SKILL:` reference. Sub-scanners have no separate SKILL.md files; inline prompts are the right level of abstraction here (mirrors the three-reviewer parallel block in coordinator/SKILL.md).

**Spawn parameters:** When spawning each sub-scanner, use `subagent_type=general-purpose`, `model=sonnet`, and do NOT set `isolation` — the scanners read files and need to see the same working tree as the parent.

Run all three in parallel (one Task call per scanner):

---

### Structure Scanner prompt

```
ROLE: Structure Scanner

SCOPE: <scope as described in Phase 2 — paths, prose, or both>

CATEGORIES TO HUNT:
- Duplication & parallel implementations: types (structs, interfaces, response shapes) defined in multiple places; copy-pasted logic across packages; utility functions that duplicate shared ones
- Leaky abstractions: internal details exposed through interfaces; excessive type-casting (Go: repeated interface{} assertions; TS: excessive `as any`); data-shuffling conversion code between layers (handler→service→store) that indicates a missing shared type

INSTRUCTIONS:
- Read all source files under SCOPE
- For each cruft instance in your CATEGORIES, emit a finding
- Be precise about why this isn't intentional — if you can't articulate why, don't surface the finding
- Suggested fixes MUST be behavior-preserving (the only allowed behavior change is bug fixing; flag those explicitly with category 'bug-fix')
- Return ONLY structured findings in the format below; no narrative wrapper

OUTPUT FORMAT (one block per finding):
Finding N:
- Category: <duplication|leaky-abstraction|bug-fix>
- Severity: small | large    (small = 1-task fix; large = multi-task refactor)
- Locations: <file:line[, ...]>
- What's wrong: <1-2 sentence diagnosis>
- Why this isn't intentional: <rationale that survives scrutiny — forces self-check vs false positives>
- Suggested fix (behavior-preserving): <high-level approach>
```

---

### Cruft Scanner prompt

```
ROLE: Cruft Scanner

SCOPE: <scope as described in Phase 2 — paths, prose, or both>

CATEGORIES TO HUNT:
- Dead code: unreferenced exports, commented-out blocks, defunct config options, Make targets that no longer work or reference deleted artifacts
- Pattern divergence: sibling code that diverges without good reason (e.g., two handlers structured differently with no justification; two store methods with inconsistent error-handling styles)
- Backwards-compat shims: adapter/shim code that was added for a migration but whose migration is now complete, leaving the shim with no remaining purpose

INSTRUCTIONS:
- Read all source files under SCOPE
- For each cruft instance in your CATEGORIES, emit a finding
- Be precise about why this isn't intentional — if you can't articulate why, don't surface the finding
- Suggested fixes MUST be behavior-preserving (the only allowed behavior change is bug fixing; flag those explicitly with category 'bug-fix')
- Return ONLY structured findings in the format below; no narrative wrapper

OUTPUT FORMAT (one block per finding):
Finding N:
- Category: <dead-code|pattern-divergence|stale-shim|bug-fix>
- Severity: small | large    (small = 1-task fix; large = multi-task refactor)
- Locations: <file:line[, ...]>
- What's wrong: <1-2 sentence diagnosis>
- Why this isn't intentional: <rationale that survives scrutiny — forces self-check vs false positives>
- Suggested fix (behavior-preserving): <high-level approach>
```

---

### Complexity Scanner prompt

```
ROLE: Complexity Scanner

SCOPE: <scope as described in Phase 2 — paths, prose, or both>

CATEGORIES TO HUNT:
- Complexity: long functions (Go: >80 lines; TS: >60 lines), deep nesting (>4 levels), functions with too many parameters (>5), switch statements that should be dispatch tables
- Test smells: skipped/xfail tests with no tracking issue, commented-out test cases, tests that mock cheap real dependencies, test files with no assertions, copy-pasted test setup that should be a helper

INSTRUCTIONS:
- Read all source files under SCOPE
- For each cruft instance in your CATEGORIES, emit a finding
- Be precise about why this isn't intentional — if you can't articulate why, don't surface the finding
- Suggested fixes MUST be behavior-preserving (the only allowed behavior change is bug fixing; flag those explicitly with category 'bug-fix')
- Return ONLY structured findings in the format below; no narrative wrapper

OUTPUT FORMAT (one block per finding):
Finding N:
- Category: <complexity|test-smell|bug-fix>
- Severity: small | large    (small = 1-task fix; large = multi-task refactor)
- Locations: <file:line[, ...]>
- What's wrong: <1-2 sentence diagnosis>
- Why this isn't intentional: <rationale that survives scrutiny — forces self-check vs false positives>
- Suggested fix (behavior-preserving): <high-level approach>
```

---

## Phase 4 — Triage + File (interactive)

After all 3 sub-scanners return:

### Dedup pass

Before presenting findings to the user, fetch open `refactor-finder` findings:
```bash
bd list --label refactor-finder --status open --json
```

For each open issue, read its title and description. For each candidate finding from Phase 3, judge whether it likely duplicates one of the open issues. Use judgement — consider:
- File-and-line overlap (but allow for shifted line numbers, renamed files)
- Semantic equivalence (same problem described differently)
- Same suggested fix

Annotate each candidate finding with `(possible dupe of #N — reason)` if you think it duplicates an open issue. If not, no annotation.

1. **Aggregate** all findings from the three scanners into one list
2. **Dedupe** overlapping findings (same file + same diagnosis from two scanners — keep the more specific one)
3. **Present findings to the user** for triage. For each finding, include the dupe annotation if any. For findings flagged as possible dupes, the user's choices are:
   - Skip (it's a dupe)
   - File anyway (it's distinct)
   - Merge into #N (the user adds context to the existing issue — use `bd note #N "..."` to append; do NOT use `bd update --description` since that replaces)
   - File as task (small finding, 1 implementer session)
   - File as stub epic (large finding, requires /plan handoff)

Present findings in batches using AskUserQuestion (max 4 per call), or present a numbered list and accept freeform keep/skip/escalate decisions. Wait for user input before filing any issue.

### Filing a task finding

```bash
bd create --title="<concise summary>" \
  --description="<full finding details + suggested fix, self-contained per CLAUDE.md issue-writing standard>" \
  --type=task --priority=3 --labels refactor-finder --json
```

The description must be self-contained: 1-2 sentence summary (what + why), exact file paths, numbered implementation steps, before→after example when applicable.

### Filing an epic finding

```bash
bd create --title="<concise summary>" \
  --description="<rationale + key files affected + 'For full implementation plan, run /plan <this-epic-id> in a fresh session.'>" \
  --type=epic --priority=2 --labels refactor-finder --json
```

---

## Your Constraints

- **MAY** use bd commands: `create`, `update`, `note`, `list`, `show`, `search`
- **MAY** use file reads and git commands for reconnaissance
- **MAY** spawn subagents for the 3 parallel sub-scanners in Phase 3
- **NEVER** write production code or modify source files
- **NEVER** make decisions without user input (Phase 2 scope selection; Phase 4 finding triage)
- **ALWAYS** run the Phase 4 dedup pass against open `refactor-finder` issues before presenting findings to the user
- **ALWAYS** produce behavior-preserving suggestions; only bug fixes may change behavior, and must be flagged with category `bug-fix`

## What You Do NOT Do

- Write or modify source files
- Auto-file findings without user approval (Phase 4 is always interactive)
- Deep-dive the entire codebase in a single pass (Phase 1 recon is cheap; Phase 3 deep-dive is per scope)
- Impose a rigid "area" taxonomy on the codebase — describe scope in prose, in whatever form fits
- Use `SKILL:` references in sub-scanner spawns (use inline ROLE prompt blocks as shown in Phase 3)
