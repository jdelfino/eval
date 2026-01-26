# Workflow Specifications (DRAFT)

> **Note:** This document captures speculative workflow designs from early planning.
> These are likely to change significantly during implementation.
> Treat as reference material, not specification.

---

## Grading Workflow

### Unified Grading Model

All graders (AI, TA, instructor) follow the same flow, working on a local `grading` branch. The branch only exists locally until grades are released (pushed).

```
+---------------------------------------------------------------+
|  Grading Workspace                                            |
+---------------------------------------------------------------+
|                                                               |
|  Local branch: grading                                        |
|  Base: submission SHA                                         |
|                                                               |
|  Graders (in order):                                          |
|    1. AI       -> commits fixes with explanations             |
|    2. TA       -> reviews, amends AI commits, adds own        |
|    3. Instructor -> reviews, adjusts, sanitizes, pushes       |
|                                                               |
|  All work on same branch, same workspace                      |
|  Branch is sanitized (amend/squash) before push               |
|  Push = release                                               |
+---------------------------------------------------------------+
```

### Grader Differences

| Grader | Connection | Typical Actions |
|--------|------------|-----------------|
| AI | Headless (SSH/exec API) | Commits fixes programmatically |
| TA | Browser workspace | Amends AI commits, adds own findings |
| Instructor | Browser workspace | Reviews all commits, sanitizes, pushes |

### Workspace Lifecycle

```
Student submits
       |
       v
Platform creates grading workspace
  - Clones repo at submission SHA
  - Creates local `grading` branch
       |
       v
AI grader runs (headless)
  - Runs tests
  - Commits fixes to `grading` branch
  - Status -> ready_for_ta
       |
       v
TA grader connects (browser)
  - Reviews AI commits
  - Amends messages, fixes mistakes
  - Adds own findings
  - Status -> ready_for_review
       |
       v
Instructor connects (same workspace)
  - Reviews all commits
  - Amends/squashes as needed
  - Pushes `grading` branch -> released
```

### Branch Sanitization

Before release, instructor cleans up via interactive rebase:

```
# Before sanitization:
abc123 Student submission
def456 [AI] bug: possible fix for null check
ghi789 [AI] bug: off-by-one, not sure about this
jkl012 [TA] bug: AI was wrong, actual fix here
mno345 [TA] style: extract helper function
pqr678 [TA] oops, undoing previous commit
stu901 [TA] style: actually do it this way

# After sanitization:
abc123 Student submission
def456 bug: Null check missing - accessing .value without guard
ghi789 bug: Off-by-one error - loop should use >= not >
jkl012 style: Validation logic extracted to helper for clarity
```

### Commit Conventions

| Prefix | Meaning |
|--------|---------|
| `bug:` | A bug found and fixed |
| `style:` | Style or design issue |
| `note:` | General observation (may have no code change) |

---

## AI-Assisted Grading

### Philosophy

AI is just another grader following the same flow as humans. TAs must write their own commit messages when amending AI commits, forcing engagement.

### Agent Loop

```
Input: Grading workspace with student code + test suite

Loop:
  1. Run tests
  2. If all pass -> done (move to style analysis)
  3. Pick a failing test
  4. Analyze code + failure -> hypothesize bug location
  5. Generate fix
  6. Run tests again
  7. If that test passes (and no regressions) -> commit the fix
  8. If not -> revert, try different fix or give up on this bug
  9. Back to step 1

Output: Commits on grading branch, each fixing one bug
```

### Handling Limitations

AI won't always succeed:

```
AI Analysis:

[OK] solution.py:14 - Fixed: off-by-one error
    (AI committed a fix)

[?] solution.py:38 - Likely bug: null dereference
    (AI couldn't generate a confident fix - please investigate)

[?] utils.py:7 - Style: duplicated logic
    (AI doesn't generate fixes for style issues)
```

### TA Workflow with AI Commits

When TA opens workspace, AI commits are present:

```bash
$ git log --oneline
f7e1a2b [AI] bug: add null check
b8a2c3d [AI] bug: change > to >=
ab3f4d2 Student's submission
```

TA's job:
1. Review each AI commit (view the diff)
2. If correct: amend with their own explanation
3. If wrong fix but real bug: reset and fix properly
4. If not actually a bug: reset to discard

**The TA must write the commit message from scratch.**

---

## Student Workflow

### Development Flow

1. Student clicks "Start Assignment"
   - Platform creates student repo (filtered from problem repo)
   - Platform creates workspace
   - Student redirected to IDE

2. Student writes code
   - Workspace auto-commits every ~5s
   - Workspace auto-pushes every ~1m
   - All to `main` branch

3. Student clicks "Submit"
   - Platform records HEAD SHA as submission
   - Platform creates grading workspace
   - Platform enqueues AI grading

### Auto-Save Details

- Auto-commit every ~5 seconds (captures revision history)
- Auto-push every ~1 minute (persists to GitHub)
- Explicit "Submit" button records official submission SHA
- Provides commit-by-commit record for integrity monitoring

---

## VS Code Extension (Grading Helper)

Minimal extension for commit workflow:

| Shortcut | Action |
|----------|--------|
| Cmd+Shift+B | Commit with `bug:` prefix |
| Cmd+Shift+S | Commit with `style:` prefix |
| Cmd+Shift+N | Commit with `note:` prefix |
| Cmd+Shift+A | Amend with new message |

~50 lines of logic, no backend dependencies, degrades gracefully.

```typescript
async function commitWithPrefix(prefix: string) {
  const message = await vscode.window.showInputBox({
    prompt: 'Feedback message',
    value: prefix ? `${prefix}: ` : '',
  });
  if (!message) return;

  await execAsync('git add -A', { cwd: workspaceFolder });
  await execAsync(`git commit -m "${message}"`, { cwd: workspaceFolder });
}
```

---

## Problem Repository Model

### Structure

```
problem-repo/                    # Instructor access only
├── problem.yaml                 # Metadata, config
├── README.md                    # Problem statement (student-visible)
├── starter/                     # Copied to student repo
│   └── solution.py
├── .devcontainer/               # Copied to student repo
│   └── devcontainer.json
├── tests/
│   ├── public/                  # Copied to student repo
│   │   └── test_basic.py
│   └── hidden/                  # NOT copied, grading only
│       └── test_edge_cases.py
├── solutions/                   # NOT copied, validation only
│   └── solution.py
└── grading/                     # NOT copied
    └── rubric.yaml
```

### Student Repo (Generated)

```
student-repo/
├── README.md                    # From problem repo
├── solution.py                  # From starter/
├── .devcontainer/
│   └── devcontainer.json
└── tests/
    └── test_basic.py            # From tests/public/ only
```

### Configuration (.assignment.yaml)

```yaml
version: 1
language: python
test_framework: pytest
timeout: 30

paths:
  starter: starter/
  solution: solution/
  tests: tests/
  hidden_tests: tests-hidden/
  devcontainer: .devcontainer/

tests:
  visible:
    - tests/test_basic.py
  hidden:
    - tests-hidden/test_edge.py
  after_deadline:
    - tests-hidden/test_advanced.py
```

All fields required. No defaults, no inference.

---

## AI-Assisted Problem Generation

### Philosophy

- Freeform chat, not forms
- Instructor can upload context (slides, PDFs, course materials)
- AI is helpful collaborator, not rigid form-filler
- Iterative review until convergence
- Instructor reviews before save

### Generation Flow

```
$ phew template generate --interactive ./bst

? What kind of assignment? binary search tree implementation
? Target audience? CS201 students, comfortable with recursion
? Any specific requirements? must handle duplicates, iterative delete

Generating problem statement... done
Generating starter code... done
Generating solution... done
Generating test cases... done

Review generated files in ./bst/
Run `phew template validate ./bst` to verify
```

### Quality Assurance

- Multi-agent review with fresh context
- Run solution against tests, verify edge cases
- Iterate until convergence (no new issues found)
- Instructor reviews before save
