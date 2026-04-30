# Future Design

> Technical design for planned platform features. This document covers **how** things work — for **what** we're building and why, see [FUTURE_FEATURES.md](FUTURE_FEATURES.md). For the current production architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Key Design Decisions

### GitHub as Portability, Not Runtime

GitHub is an import/export format for problem repos — not a runtime dependency. The platform manages student code internally. Students only need a platform account, avoiding the dual-account problem (platform + GitHub) and the complexity of org management, per-student repo creation, and webhook plumbing. Instructors can import problems from GitHub and export them back, so they're never locked in.

### Platform UI for All User-Facing Workflows

Students view feedback through a custom platform UI, not git history or GitHub PRs. Git commits on the grading branch are the storage layer and audit trail, but the platform reads them at release time, stores structured feedback in the DB, and renders it in a unified view alongside grades and rubric scores.

Similarly, TAs and instructors grade through a purpose-built UI rather than working directly in a terminal. They see AI findings as a list with diffs, approve/reject/edit through the interface, and write their own feedback messages in text fields. Branch sanitization before release is automated by the platform rather than done via interactive rebase.

### AI Grader Role

The AI grader's primary value is in the two most time-consuming parts of grading: identifying individual bugs and articulating corrections/better patterns. It handles the tedious discovery and explanation work, freeing human graders to refine feedback tone, decide what's pedagogically useful to highlight, and add human context. TAs shift from "find and explain every issue" to "review and refine AI findings."

### Auto-Commit for Integrity

Student workspaces auto-commit every ~10 seconds (skipping empty commits) and auto-push every ~1 minute. This captures fine-grained revision history for integrity auditing — detecting paste-in-complete-solution patterns and understanding how a student's thinking evolved — while keeping git history size reasonable.

### Assignment Update Propagation

When instructors update assignment files after students have started, the platform handles propagation explicitly. Student repos have a clear editable/uneditable file split — platform-managed files (README, tests, devcontainer config) can be force-updated without merge conflicts because students don't edit them.

---

## Data Storage

| Data | Storage | Rationale |
|------|---------|-----------|
| Student code | Platform-managed git | Version control, auto-commit history |
| Submission records | Platform DB | Track SHA + timestamp |
| Grades and rubrics | Platform DB | Structured data, queryable |
| Line-level feedback | Platform DB (sourced from git commits) | Grading commits are storage layer; DB is query/display layer |
| Auto-grader results | Platform DB | Structured test results |
| AI analysis | Platform DB | Pre-computed before grading |
| Problem repos | GitHub (import) | Portability — instructors can export and leave |

All student-facing data lives in the platform DB and is served through the platform UI. Git commits on the grading branch are the source of truth for feedback, but the platform reads them at release time and stores structured records (finding type, file, line range, explanation, diff) in the DB for querying and display.

This avoids split-brain by making git the write path and the DB the read path, with a one-time sync at release.

---

## Student Development Environment

### Coder Workspaces

Browser-based development environments require orchestration: provisioning containers, managing lifecycle, routing users, handling persistence. [Coder](https://coder.com/) provides this out of the box.

**What Coder handles:** Workspace lifecycle (create, start, stop, delete), browser-based VS Code (code-server), OIDC authentication, Terraform-based workspace templates, idle timeout and auto-shutdown, routing users to their workspaces.

**What Coder does not handle:** Batch job processing (AI grading workers), domain logic (courses, assignments, grades), submission tracking.

Alternatives considered: DevPod (client-only, no server component), GitHub Codespaces (not self-hosted), building from scratch (significant effort).

### Student Workspace Template

Each student gets one workspace per assignment, defined as a Coder template:
- Clones student repo, mounts persistent volume
- Runs auto-commit script in background (~10s commit, ~1m push)
- Includes language runtime and tools from devcontainer config
- Auto-stops on idle, auto-starts on reconnect

### Student Workflow

1. Student clicks "Start Assignment" — platform creates repo (filtered from problem repo), creates workspace, redirects to IDE
2. Student writes code — workspace auto-commits and auto-pushes in the background
3. Student clicks "Submit" — platform records HEAD SHA as the official submission, creates grading workspace, enqueues AI grading

---

## Grading System

### Unified Grading Model

All graders — AI, TA, instructor — follow the same flow, working on a local `grading` branch in a shared workspace. The branch only exists locally until grades are released.

```
Grading Workspace
├── Base: submission SHA
├── Local branch: grading
│
├── 1. AI grader (headless)  → commits fixes with explanations
├── 2. TA (browser)          → reviews AI, amends/adds findings
└── 3. Instructor (browser)  → reviews all, sanitizes, releases
```

Push = release. One atomic action makes feedback visible to the student.

### Grading Workspace Template

- Clones at submission SHA, creates local `grading` branch
- Shared access for TA and instructor (same workspace)
- Includes grading VS Code extension
- Destroyed or archived after release

### Commit Conventions

Graders prefix commits for automatic categorization:

| Prefix | Meaning |
|--------|---------|
| `bug:` | A bug found and fixed |
| `style:` | Style or design issue |
| `note:` | General observation (may have no code change) |

### Branch Sanitization

The `grading` branch may be messy mid-process. Before release, the platform automates cleanup:

```
Before:                              After:
─────────────────────────────────    ─────────────────────────────────
abc123 Student submission            abc123 Student submission
def456 [AI] bug: possible null fix   def456 bug: Null check missing
ghi789 [AI] bug: off-by-one         ghi789 bug: Off-by-one error
jkl012 [TA] AI was wrong, fix here  jkl012 style: Extract helper
mno345 [TA] style: extract helper
pqr678 [TA] oops, undoing previous
stu901 [TA] actually do it this way
```

### Submission State Machine

```
pending → ai_grading → ta_grading → reviewing → released
```

- **pending**: Submission recorded, workspace being created
- **ai_grading**: AI grader is running
- **ta_grading**: Waiting for or in progress by TA
- **reviewing**: Instructor reviewing all commits
- **released**: Student can see feedback (grading branch pushed)

### AI Grader

AI connects to the grading workspace headlessly (SSH/exec API) and follows a loop:

1. Run tests
2. Pick a failing test, analyze code + failure, hypothesize bug
3. Generate fix, apply, re-run tests
4. If the failing test now passes (no regressions) → commit the fix
5. If not → revert, try a different approach or move on
6. Repeat until all addressable failures are handled, then move to style analysis

Every committed fix is validated — the test that was failing now passes. Some findings come with fixes, some are just pointers for the TA to investigate.

### TA Workflow

When the TA opens the workspace, AI commits are already on the grading branch. For each:
1. Review the diff
2. If correct: amend with their own explanation (forces engagement)
3. If wrong fix but real bug: reset and fix properly
4. If not actually a bug: discard

The TA must write commit messages from scratch — no rubber-stamping AI output.

---

## VS Code Extension (Grading Helper)

A minimal extension makes the commit workflow frictionless for TAs. It is standalone (doesn't talk to the platform API) and degrades gracefully — TAs can always use `git commit` directly.

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Stage all + commit with `bug:` prefix |
| `Cmd+Shift+S` | Stage all + commit with `style:` prefix |
| `Cmd+Shift+N` | Stage all + commit with `note:` prefix |
| `Cmd+Shift+A` | Amend last commit with new message |

---

## Problem Repos

Problem repositories define starter code and test suites using a `.overlay/`-based model. See [design/PROBLEM_REPOS.md](design/PROBLEM_REPOS.md) for the full specification.

---

## Open Questions

1. **Plagiarism detection:** Integration with tools like MOSS
2. **Late submissions:** Policy enforcement and grace periods
3. **Regrade requests:** Workflow for students to dispute grades
4. **TA training:** Onboarding TAs on the commit-based workflow
5. **Assignment versioning:** Handling corrections to assignment specs mid-semester
6. **Accessibility:** Ensuring the grading workflow works with screen readers
