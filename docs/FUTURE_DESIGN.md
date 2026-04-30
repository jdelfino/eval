# Future Design

> Technical design document for planned and in-progress platform features. Covers the grading workflow, Coder-based workspace architecture, AI-assisted grading, and VS Code extension. For the current implementation architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Design Evolution

Several design decisions have evolved since the original document was written. This section captures those changes and their rationale.

### GitHub Demoted from Runtime to Portability

**Original design:** GitHub is the runtime infrastructure — one org per course, per-student repos, GitHub App for webhooks and repo management, students need GitHub accounts.

**Current direction:** GitHub is a portability/export format, not a runtime dependency. Problem repos can be imported from GitHub so instructors aren't locked in, but the platform manages student code internally. Students only need a platform account.

**Rationale:** The GitHub integration added significant complexity (org management, per-student repo creation, webhook plumbing, account linking) without proportional value. The main appeal of GitHub — portability — is better served as an import/export feature than a runtime dependency. This also eliminates the student dual-account problem (platform + GitHub).

### Student-Facing Feedback via Platform UI, Not Git

**Original design:** Grading branch is pushed to GitHub; students view feedback as git history.

**Current direction:** Students view feedback through a custom platform UI. Git commits are the storage layer and audit trail, but the platform reads commits at release time, stores structured feedback in the DB, and renders it in the UI alongside grades and rubric scores.

**Rationale:** GitHub PRs are intimidating for new coders, and the PR model is the wrong abstraction for grading feedback. A custom UI also solves the data sync problem — grades, rubric scores, and line-level feedback appear in one unified view rather than split across the platform and GitHub.

### Grading UX via Platform UI, Not Terminal

**Original design:** TAs and instructors work directly in Coder workspaces, using git commands and interactive rebase to manage grading commits.

**Current direction:** The platform provides a UI layer on top of the git-based grading workflow. TAs see AI findings as a list with diffs, approve/reject/edit through the interface, and write their own feedback messages in text fields. Branch sanitization before release is automated by the platform rather than done manually via interactive rebase.

**Rationale:** Interactive rebase is a power-user git operation that most TAs can't do reliably. The commit-based storage model is sound, but the UX should be a purpose-built grading interface, not a terminal.

### AI Grader Value Proposition Clarified

The AI grader's primary value is in the two most time-consuming parts of grading: identifying individual bugs and articulating corrections/better patterns. It handles the tedious discovery and explanation work, freeing human graders to refine feedback tone, decide what's pedagogically useful to highlight, and add human context. TAs shift from "find and explain every issue" to "review and refine AI findings."

### Auto-Commit Interval: 10 Seconds

**Original design:** Auto-commit every ~5 seconds.

**Current direction:** Auto-commit every ~10 seconds, skipping empty commits (no changes since last commit). Auto-push every ~1 minute.

**Rationale:** 10 seconds still captures fine-grained revision history for integrity auditing (detects paste-in-complete-solution patterns) while being slightly less aggressive on git history size. Empty commit skipping is a given.

### Assignment Update Propagation

When instructors update assignment files (e.g., fixing a typo in README.md) after students have started, the platform handles propagation explicitly. Students' repos have a clear editable/uneditable file split — platform-managed files (README, tests, devcontainer config) can be force-updated without merge conflicts because students don't edit them. The promise of upstream repo changes being pulled in by students via git merge is false — too many edge cases.

---

## Data Storage Strategy

### What Lives Where

| Data | Storage | Rationale |
|------|---------|-----------|
| Student code | Platform-managed git | Version control, auto-commit history |
| Submission records | Platform DB | Track SHA + timestamp |
| Grades and rubrics | Platform DB | Structured data, queryable |
| Line-level feedback | Platform DB (sourced from git commits) | Grading commits are storage layer; DB is query/display layer |
| Auto-grader results | Platform DB | Structured test results |
| AI analysis | Platform DB | Pre-computed before grading |
| Problem repos | GitHub (import) | Portability — instructors can export and leave |

### Storage Design Rationale

All student-facing data lives in the platform DB and is served through the platform UI. Git commits on the grading branch are the source of truth for feedback, but the platform reads them at release time and stores structured records (finding type, file, line range, explanation, diff) in the DB for querying and display.

This avoids the split-brain risk of having two sources of truth (git + DB) by making git the write path and the DB the read path, with a one-time sync at release.

---

## Grading Workflow

### Unified Grading Model

All graders (AI, TA, instructor) follow the same flow, working on a local `grading` branch in a shared workspace. The branch only exists locally until grades are released (pushed).

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

| Grader | How They Connect | Typical Actions |
|--------|------------------|-----------------|
| AI | Coder exec API / SSH (headless) | Commits fixes programmatically |
| TA | Opens workspace in browser | Amends AI commits, adds own findings |
| Instructor | Opens same workspace in browser | Reviews all commits, sanitizes, pushes |

### Workspace Lifecycle

```
Student submits (clicks button in platform UI)
       |
       v
Platform creates grading workspace
  - Clones repo at submission SHA
  - Creates local `grading` branch
  - Workspace ID stored in submission record
       |
       v
AI grader runs (connects headlessly)
  - Runs tests
  - Commits fixes to `grading` branch
  - Updates submission status -> ready_for_ta
       |
       v
TA grader connects (browser)
  - Reviews AI commits
  - Amends messages, fixes mistakes
  - Adds own findings
  - Updates submission status -> ready_for_review
       |
       v
Instructor connects (same workspace)
  - Reviews all commits
  - Amends/squashes as needed
  - Pushes `grading` branch -> released
  - Workspace destroyed (or archived)
```

### Branch Sanitization Before Release

The `grading` branch may be messy mid-process. Before release, the platform automates sanitization (previously done via interactive rebase):

```bash
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

### Commit Message Conventions

Graders prefix commits for automatic categorization:

| Prefix | Meaning |
|--------|---------|
| `bug:` | A bug found and fixed |
| `style:` | Style or design issue |
| `note:` | General observation (may have no code change) |

### Grading Visibility

- `grading` branch doesn't exist remotely until pushed
- No premature visibility of feedback
- Push = release, one atomic action
- Full grading history preserved in git

### Platform State Machine

```
+--------------+
|   pending    | <- submission recorded
+------+-------+
       | workspace created
       v
+--------------+
| ai_grading   | <- AI is working
+------+-------+
       | AI done
       v
+--------------+
| ta_grading   | <- waiting for / in progress by TA
+------+-------+
       | TA marks done
       v
+--------------+
|  reviewing   | <- instructor reviewing
+------+-------+
       | instructor pushes
       v
+--------------+
|  released    | <- student can see feedback
+--------------+
```

---

## Student Workflow

### Development Flow

1. Student clicks "Start Assignment"
   - Platform creates student repo (filtered from problem repo)
   - Platform creates workspace
   - Student redirected to IDE

2. Student writes code
   - Workspace auto-commits every ~10 seconds (skipping empty commits)
   - Workspace auto-pushes every ~1 minute
   - All to `main` branch

3. Student clicks "Submit"
   - Platform records HEAD SHA as submission
   - Platform creates grading workspace
   - Platform enqueues AI grading

### Auto-Save Details

- Auto-commit every ~10 seconds (captures fine-grained revision history)
- Auto-push every ~1 minute (persists to platform-managed git)
- Explicit "Submit" button records official submission SHA
- Provides commit-by-commit record for integrity monitoring (detects paste-in-complete-solution patterns)

---

## Coder Architecture

### Why Coder

Browser-based development environments require orchestration: provisioning containers, managing lifecycle, routing users, handling persistence. Coder provides this out of the box.

Alternatives considered:
- **DevPod**: Client-only, no server component for platform-managed workspaces
- **Build from scratch**: Significant effort, ongoing maintenance burden
- **GitHub Codespaces**: Not self-hosted

### Coder's Role

Coder handles:
- Workspace lifecycle (create, start, stop, delete)
- Browser-based VS Code (code-server)
- User authentication (OIDC integration)
- Workspace templates (Terraform-based)
- Idle timeout and auto-shutdown
- Routing users to their workspaces

Coder does NOT handle:
- Batch job processing (AI grading workers)
- Domain logic (courses, assignments, grades)
- GitHub integration
- Submission tracking

### Workspace Types

**Student Workspaces:**
- Persistent storage (work survives restarts)
- Auto-commit/push for revision history
- One per student per assignment
- Auto-stop on idle, auto-start on connect

**Grading Workspaces:**
- Shared between TA and instructor
- Persistent until grades released
- One per submission
- Contains local `grading` branch

### Key Integration Points

**Platform → Coder (Workspace Creation):**
```
POST /api/v2/workspaces
{
  template_id: "student-workspace",
  name: "cs101-alice-asgn1",
  rich_parameter_values: [
    {name: "repo_url", value: "..."},
    {name: "commit_sha", value: "..."}
  ]
}
```

**Platform → Coder (AI Grading):**
AI worker connects to grading workspace via SSH/exec API, runs tests, commits fixes programmatically.

**Auth Integration:**
Coder supports OIDC. Platform acts as identity provider or uses shared provider (Auth0, Keycloak).

### Coder Templates

Templates define workspace configuration via Terraform. Two main templates:

**Student Workspace Template:**
- Clones student repo
- Mounts persistent volume
- Runs auto-commit script in background
- Includes language runtime and tools

**Grading Workspace Template:**
- Clones at submission SHA
- Creates local `grading` branch
- Includes grading VS Code extension
- Shared access for TA and instructor

---

## AI-Assisted Grading

### Philosophy

AI is just another grader following the same flow as humans. It connects to the grading workspace, runs tests, commits fixes. The key constraint: TAs must write their own commit messages when amending AI commits, forcing engagement.

The AI grader's primary value is in the two most time-consuming parts of grading: identifying individual bugs and articulating corrections/better patterns. It handles the tedious discovery and explanation work, freeing human graders to refine feedback tone, decide what's pedagogically useful to highlight, and add human context.

### AI as Headless Grader

AI connects to the workspace the same way a human would, just without the browser:

```python
async def ai_grade_submission(submission_id: str):
    submission = await db.get_submission(submission_id)
    workspace = await coder.get_workspace(submission.grading_workspace_id)

    # Connect via SSH/exec
    ssh = await workspace.ssh_connect()

    # Ensure on grading branch
    await ssh.run("cd /home/coder/project && git checkout grading")

    # Run tests, capture output
    test_output = await ssh.run("cd /home/coder/project && ./run_tests.sh")

    # Send to LLM for analysis
    analysis = await analyze_with_llm(
        code=await ssh.run("cat /home/coder/project/**/*.py"),
        test_output=test_output
    )

    # For each identified bug, attempt fix
    for bug in analysis.bugs:
        fix = await generate_fix(bug)
        if fix:
            await ssh.run(f"cd /home/coder/project && {fix.apply_command}")

            # Test the fix
            retest = await ssh.run("./run_tests.sh")
            if fix_improved_tests(test_output, retest):
                await ssh.run(
                    f'git add -A && git commit -m "bug: {fix.description}"'
                )
            else:
                await ssh.run("git checkout -- .")  # revert

    # Update status
    await db.update_submission(submission_id, status="ta_grading")
```

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

Every committed fix is validated — the test that was failing now passes.

### TA Workflow with AI Commits

When TA opens the workspace, AI commits are already present:

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

**The TA must write the commit message from scratch.** This ensures they understood the bug.

### Handling AI Limitations

AI won't always succeed. The system handles this gracefully:

```
AI Analysis:

[✓] solution.py:14 - Fixed: off-by-one error
    (AI committed a fix)

[?] solution.py:38 - Likely bug: null dereference
    (AI couldn't generate a confident fix - please investigate)

[?] utils.py:7 - Style: duplicated logic
    (AI doesn't generate fixes for style issues)
```

Some findings come with fixes, some are just pointers.

---

## VS Code Extension (Grading Helper)

A minimal extension makes the commit workflow frictionless for TAs. It is standalone (doesn't talk to the platform API) and degrades gracefully — TAs can always just type `git commit` manually.

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Stage all + commit with `bug:` prefix |
| `Cmd+Shift+S` | Stage all + commit with `style:` prefix |
| `Cmd+Shift+N` | Stage all + commit with `note:` prefix |
| `Cmd+Shift+A` | Amend last commit with new message |

```typescript
// extension.ts
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function commitWithPrefix(prefix: string) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const message = await vscode.window.showInputBox({
    prompt: 'Feedback message',
    value: prefix ? `${prefix}: ` : '',
    valueSelection: prefix ? [prefix.length + 2, prefix.length + 2] : undefined
  });

  if (!message) return;

  try {
    await execAsync('git add -A', { cwd: workspaceFolder });
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: workspaceFolder
    });
    vscode.window.showInformationMessage(`Committed: ${message}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Commit failed: ${err}`);
  }
}

async function amendCommit() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return;

  const message = await vscode.window.showInputBox({
    prompt: 'Explain this fix in your own words',
    placeHolder: 'bug: ...'
  });

  if (!message) return;

  try {
    await execAsync(
      `git commit --amend -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: workspaceFolder }
    );
    vscode.window.showInformationMessage(`Amended: ${message}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Amend failed: ${err}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('grading.commitBug', () => commitWithPrefix('bug')),
    vscode.commands.registerCommand('grading.commitStyle', () => commitWithPrefix('style')),
    vscode.commands.registerCommand('grading.commitNote', () => commitWithPrefix('note')),
    vscode.commands.registerCommand('grading.commit', () => commitWithPrefix('')),
    vscode.commands.registerCommand('grading.amend', () => amendCommit())
  );
}
```

```json
// package.json
{
  "name": "grading-helper",
  "displayName": "Grading Helper",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "grading.commitBug", "title": "Commit as Bug" },
      { "command": "grading.commitStyle", "title": "Commit as Style Issue" },
      { "command": "grading.commitNote", "title": "Commit as Note" },
      { "command": "grading.commit", "title": "Commit Feedback" },
      { "command": "grading.amend", "title": "Amend with Own Message" }
    ],
    "keybindings": [
      { "command": "grading.commitBug", "key": "ctrl+shift+b", "mac": "cmd+shift+b" },
      { "command": "grading.commitStyle", "key": "ctrl+shift+s", "mac": "cmd+shift+s" },
      { "command": "grading.commitNote", "key": "ctrl+shift+n", "mac": "cmd+shift+n" },
      { "command": "grading.amend", "key": "ctrl+shift+a", "mac": "cmd+shift+a" }
    ]
  }
}
```

---

## Problem Repos

Problem repositories define the starter code and test suite for each assignment, using a `.overlay/`-based model that separates instructor-only files from student-visible files. See [design/PROBLEM_REPOS.md](design/PROBLEM_REPOS.md) for the full specification.

---

## Open Questions

1. **Plagiarism detection:** How does this integrate with tools like MOSS?
2. **Late submissions:** Policy enforcement and grace periods
3. **Regrade requests:** Workflow for students to dispute grades
4. **TA training:** How to onboard TAs on the commit-based workflow
5. **Assignment versioning:** Handling corrections to assignment specs mid-semester
6. **Accessibility:** Ensuring the grading workflow works with screen readers
