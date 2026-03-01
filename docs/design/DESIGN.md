# Technical Design Document

> Original design document for the coding assignment platform. Covers the full vision
> across both phases of development. Phase 1 (in-class exercise migration) is underway;
> Phase 2 (out-of-class assignments) builds on top of it.
>
> For the current implementation architecture, see [ARCHITECTURE.md](../ARCHITECTURE.md).

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

## GitHub Integration

### Organization Structure

Each course or section receives a GitHub organization. Each student gets a repository for each assignment they work on.

```
course-cs101-fall2026/           # GitHub Organization
├── assignment-1-alice/          # Student repo
├── assignment-1-bob/
├── assignment-2-alice/
└── ...
```

### Enterprise Not Required

GitHub's standard (free/Team) organization tiers provide sufficient API access. Enterprise is not needed for:
- Programmatic repository creation within organizations
- Organization membership management
- Repository permissions (per-user or per-team)
- Webhooks for event-driven workflows
- Repository contents, commits, and branches access

Enterprise features (SAML SSO, audit log streaming, IP allow lists) are unnecessary for educational use unless mandated by institutional policy.

### GitHub Education Pack

The GitHub Education pack is student/educator-facing rather than application-facing. Students with the pack get free GitHub Pro, and educators can get free Team organization access. The application authenticates separately via a GitHub App.

### Authentication Architecture

The platform uses a **GitHub App** rather than personal access tokens:
- Higher API rate limits (5,000+ requests/hour per installation)
- Short-lived tokens (1 hour expiry)
- Granular permission scopes
- Can respond to webhooks

**What gets stored in the database:**

| Field | Purpose |
|-------|---------|
| installation_id | From GitHub, identifies the app installation |
| org_name / org_id | The GitHub organization |
| course_id | Internal reference to the course |
| installed_at | Timestamp |
| installed_by_user_id | Who installed the app |

**Access tokens are NOT stored.** They are generated on-demand by:
1. Generating a JWT signed with the app's private key
2. Exchanging the JWT for a short-lived installation access token
3. Using that token for API calls

Token caching with expiration tracking can reduce API calls but is optional.

### Repository Creation Flow

1. Instructor creates a GitHub organization (manual, cannot be fully automated via API)
2. Instructor installs the GitHub App on the organization
3. Webhook notifies the platform of the installation
4. When an assignment is created, the platform creates a template repository
5. When a student starts an assignment, the platform creates a private repo from the template and grants the student write access
6. Student pushes code; webhooks trigger auto-grading

---

## Problem Repository Model

### Overview

Problems (assignments) are GitHub repositories containing all assignment content. The platform imports problems by repo URL and creates filtered student repos on demand.

### Problem Repo Structure

```
cs101-asgn3-problem/                    # Problem repo (instructor access only)
├── problem.yaml                        # Metadata, rubric, config
├── README.md                           # Problem statement (student-visible)
├── starter/                            # Copied to student repo
│   └── solution.py
├── .devcontainer/                      # Copied to student repo
│   └── devcontainer.json
├── tests/
│   ├── public/                         # Copied to student repo
│   │   └── test_basic.py
│   └── hidden/                         # NOT copied, used by grading only
│       └── test_edge_cases.py
├── solutions/                          # NOT copied, used for validation
│   └── solution.py
└── grading/                            # NOT copied, grading config
    └── rubric.yaml
```

### Student Repo Generation

When a student starts an assignment, the platform creates their repo with only visible parts:

```
cs101-alice-asgn3/                      # Student repo
├── README.md                           # From problem repo
├── solution.py                         # From starter/
├── .devcontainer/                      # From problem repo
│   └── devcontainer.json
└── tests/
    └── test_basic.py                   # From tests/public/ only
```

Hidden tests and solutions never leave the problem repo. The platform handles copying via GitHub API rather than using GitHub's template repo feature (which copies everything).

### problem.yaml

```yaml
id: asgn3-recursion
title: "Assignment 3: Recursion Practice"

# What gets copied to student repo (glob patterns)
student_files:
  - README.md
  - starter/**
  - tests/public/**
  - .devcontainer/**

# What stays hidden
hidden:
  - solutions/**
  - tests/hidden/**
  - grading/**
  - problem.yaml

# Grading
grading:
  test_command: pytest tests/ -v
  timeout_seconds: 60
```

### Assignment Flexibility

The platform treats an assignment as a single repo. What's inside is the instructor's concern — could be one problem, could be five, could be a multi-file project. The structure within the repo is defined by problem.yaml and enforced by convention, not by the platform.

### Problem Creation CLI

A command-line tool bootstraps problem repos:

**Phase 1 (Simple Scaffolding):**
```bash
$ problem init fibonacci --language python
Created fibonacci/
  problem.yaml
  README.md
  starter/solution.py
  .devcontainer/devcontainer.json
  tests/public/test_basic.py
  tests/hidden/test_edge_cases.py
  solutions/solution.py
  grading/rubric.yaml

$ problem validate
✓ Solution passes public tests
✓ Solution passes hidden tests
✓ Starter code compiles
✓ Devcontainer config valid

$ problem push --org cs101-problems
Created repo: cs101-problems/fibonacci
```

**Phase 2 (AI Assist):**
```bash
$ problem init --ai
? Topic: fibonacci sequence
? Difficulty: beginner
? Language: python

Generating problem statement... done
Generating starter code... done
Generating solution... done
Generating test cases... done
```

### Shared SDK

Both CLI and platform use a shared library:

```
problem-sdk/
├── problem/
│   ├── model.py          # Problem, TestCase, Rubric dataclasses
│   ├── loader.py         # Load from directory/repo
│   ├── validator.py      # Run solution against tests, check structure
│   ├── generator.py      # AI generation (phase 2)
│   └── publisher.py      # Push to GitHub
├── templates/
│   └── python/           # Language-specific templates
└── cli/
    └── main.py           # CLI wrapper
```

---

## Why Not Pull Requests?

Pull requests are awkward for educational use:
- PRs assume incremental changes to an existing codebase
- Student assignments are typically wholesale creation from near-empty starter code
- The "diff" would be the entire submission
- There's no actual merge to perform

### Simpler Git Model

Students work on `main` branch. The initial commit contains starter code. Submission is simply a push to `main`, and the platform records the commit SHA.

```
student-repo/
  main          <- student's work
  (initial commit = starter code from template)
```

To diff against starter code when needed, the platform compares against the first commit or the template repo programmatically.

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

The `grading` branch may be messy mid-process. Before release, instructor sanitizes via interactive rebase:

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

### Student Work Capture

Workspaces auto-commit and auto-push student work for academic integrity monitoring:

- Auto-commit every ~10 seconds, skipping empty commits (no changes since last)
- Auto-push every ~1 minute (persists to platform-managed git)
- Explicit "Submit" button records official submission SHA

This provides commit-by-commit record of how code evolved, useful for plagiarism detection and understanding student thought process.

### Grading Visibility

- `grading` branch doesn't exist on GitHub until pushed
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

### Commit Message Conventions

Graders prefix commits for automatic categorization:

| Prefix | Meaning |
|--------|---------|
| `bug:` | A bug found and fixed |
| `style:` | Style or design issue |
| `note:` | General observation (may have no code change) |

### VS Code Extension (Lightweight)

A minimal extension makes the commit workflow frictionless:
- `Cmd+Shift+B` → stages all + prompts with "bug: " prefilled
- `Cmd+Shift+S` → stages all + prompts with "style: " prefilled
- `Cmd+Shift+N` → stages all + prompts with "note: " prefilled

This extension is standalone (doesn't talk to the platform API) and degrades gracefully—TAs can always just type `git commit` manually.

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

### High-Level Architecture

```
+-----------------------------------------------------------------------------+
|                              Platform                                       |
|                                                                             |
|  +-------------+  +-------------+  +-------------+  +-------------------+   |
|  |   Web UI    |  |   API       |  |  Worker     |  |  Database         |   |
|  |             |  |             |  |  (AI Agent) |  |                   |   |
|  | - Student   |  | - Auth      |  |             |  | - Users           |   |
|  |   dashboard |  | - Courses   |  | - Connects  |  | - Courses         |   |
|  | - TA grade  |  | - Assign.   |  |   to Coder  |  | - Assignments     |   |
|  |   queue     |  | - Submissions|  |   workspace |  | - Submissions     |   |
|  | - Instructor|  | - Grades    |  | - Runs tests|  | - Grades          |   |
|  |   admin     |  |             |  | - Commits   |  | - AI analysis     |   |
|  +------+------+  +------+------+  +------+------+  +-------------------+   |
|         |                |                |                                  |
+---------+----------------+----------------+----------------------------------+
          |                |                |
          |                v                |
          |    +-----------------------+    |
          |    |       GitHub          |    |
          |    |                       |    |
          |    | - Orgs (per course)   |<---+
          |    | - Problem repos       |
          |    | - Student repos       |
          |    +-----------------------+
          |
          v
+-----------------------------------------------------------------------------+
|                              Coder                                          |
|                                                                             |
|  +-----------------+    +-----------------------------------------------+   |
|  |  Coder Server   |    |              Workspaces (K8s pods)            |   |
|  |                 |    |                                               |   |
|  | - API           |    |  +---------+ +---------+ +---------+         |   |
|  | - Auth (OIDC)   |    |  |Student A| |Student B| |Grade    |  ...   |   |
|  | - Templates     |    |  | CS101   | | CS101   | | Alice   |         |   |
|  | - Workspace mgmt|    |  | Asgn 1  | | Asgn 1  | | Asgn 1  |         |   |
|  |                 |    |  +---------+ +---------+ +---------+         |   |
|  +--------+--------+    |                                               |   |
|           |             |  Each workspace:                              |   |
|           |             |  - code-server (VS Code in browser)           |   |
|           |             |  - Cloned repo at specific SHA                |   |
|           |             |  - Persistent volume (student) or shared      |   |
|           |             |  - Language runtime, tools, extensions        |   |
|           +-------------+-----------------------------------------------+   |
|                                                                             |
+-----------------------------------------------------------------------------+
```

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

## Cost Analysis

### API Pricing (per million tokens)

| Model | Input | Output |
|-------|-------|--------|
| Haiku 4.5 | $1 | $5 |
| Sonnet 4.5 | $3 | $15 |
| Opus 4.5 | $5 | $25 |

**Discounts available:**
- Batch API: 50% discount (async processing)
- Prompt caching: Up to 90% savings on repeated context

### Per-Submission Cost Estimate

**Assumptions for intro CS assignment:**
- ~500 lines of code (~2,000 tokens)
- Test output: ~500 tokens per run
- 3 bugs on average
- 2 attempts per bug on average (6 iterations total)

**Per iteration:**
- Input: ~3,200 tokens (system prompt + code + test output + instruction)
- Output: ~500 tokens (analysis + fix)

**Per submission:**
- Input: 6 × 3,200 = 19,200 tokens
- Output: 6 × 500 = 3,000 tokens

| Model | Input Cost | Output Cost | Total per Submission |
|-------|-----------|-------------|---------------------|
| Haiku 4.5 | $0.019 | $0.015 | **$0.03** |
| Sonnet 4.5 | $0.058 | $0.045 | **$0.10** |
| Opus 4.5 | $0.096 | $0.075 | **$0.17** |

### Scaled Costs

**Per course (200 students × 10 assignments = 2,000 submissions):**

| Model | Cost per Course |
|-------|-----------------|
| Haiku 4.5 | $60 |
| Sonnet 4.5 | $200 |
| Opus 4.5 | $340 |

**Per department (10 courses per semester):**

| Model | Cost per Semester |
|-------|-------------------|
| Haiku 4.5 | $600 |
| Sonnet 4.5 | $2,000 |
| Opus 4.5 | $3,400 |

### Cost Optimizations

1. **Prompt caching:** Cache system prompt + assignment context across submissions (20-30% savings)
2. **Batch API:** Run agent overnight before TAs grade (50% discount)
3. **Tiered model selection:** Start with Haiku, escalate to Sonnet only if needed

**Optimized realistic cost: $0.02-0.05 per submission**

### ROI Comparison

A TA costs ~$15-20/hour. If the AI agent saves even 2 minutes per submission, it pays for itself many times over.

---

## Cost Per Student Per Semester

### Assumptions

- 15-week semester
- 10 hours/week active development (150 hours/semester, conservatively high — many students will use half)
- 2 assignments per week, 30 submissions total
- 1-2 vCPU, 2-4GB RAM workspace

### Compute Costs (GKE)

Platform runs on GKE Standard. Platform services (API, Centrifugo, executor, Coder server) use Spot node pools. Student workspace pods use Spot as well — preemption means at most ~10 seconds of lost work (auto-commit interval) plus restart time, which is tolerable for out-of-class assignments.

GKE e2 instance pricing: ~$0.034/vCPU/hr + ~$0.005/GB/hr on-demand, ~60-70% discount for Spot.

**1 vCPU / 2GB workspace (~$0.044/hr on-demand, ~$0.014/hr Spot):**

| Component | Usage | On-Demand | Spot |
|-----------|-------|-----------|------|
| Student workspace | 150 hours | $6.60 | $2.10 |
| Student workspace | 75 hours (realistic) | $3.30 | $1.05 |
| Grading workspace | ~10 hours | $0.44 | $0.14 |
| Test execution | ~2.5 hours | $0.11 | $0.04 |

**2 vCPU / 4GB workspace (~$0.088/hr on-demand, ~$0.028/hr Spot):**

| Component | Usage | On-Demand | Spot |
|-----------|-------|-----------|------|
| Student workspace | 150 hours | $13.20 | $4.20 |
| Student workspace | 75 hours (realistic) | $6.60 | $2.10 |
| Grading workspace | ~10 hours | $0.88 | $0.28 |
| Test execution | ~2.5 hours | $0.22 | $0.07 |

Idle timeout (handled by Coder) significantly reduces actual billed hours — students who walk away don't burn compute.

### AI Costs (If Enabled)

| Component | Usage | Cost |
|-----------|-------|------|
| AI problem generation | Amortized across students (negligible) | ~$0.00 |
| AI grading (if enabled) | 30 submissions × $0.03-0.10 | $0.90 - $3.00 |

### Storage & Platform Costs

| Component | Usage | Cost |
|-----------|-------|------|
| Persistent volume (10GB) | 15 weeks | ~$0.50 |
| Database (amortized) | Negligible per student | ~$0.10 |
| Platform hosting (amortized) | Negligible per student | ~$0.20 |

### Total Cost Per Student Per Semester

| Scenario | 1 vCPU/2GB | 2 vCPU/4GB |
|----------|-----------|-----------|
| **On-demand, 150hrs, no AI** | ~$7.50 | ~$14.50 |
| **Spot, 150hrs, no AI** | ~$3.00 | ~$5.00 |
| **Spot, 75hrs (realistic), no AI** | ~$1.90 | ~$3.00 |
| **Spot, 75hrs + AI grading** | ~$3.00 - $5.00 | ~$4.00 - $6.00 |

### Scaling Estimates (Spot, realistic usage)

**200-student course (1 vCPU/2GB, 75hrs avg):**

| Scenario | Per Semester |
|----------|--------------|
| No AI | ~$380 |
| With AI grading | ~$600 - $1,000 |

**10-course department (2,000 students):**

| Scenario | Per Semester |
|----------|--------------|
| No AI | ~$3,800 |
| With AI grading | ~$6,000 - $10,000 |

### Comparison to Alternatives

| Service | Cost Per Student/Semester | Notes |
|---------|---------------------------|-------|
| GitHub Codespaces | ~$30-50 | 60 core-hours free, then $0.18/hour |
| Gitpod | ~$25-40 | 50 hours free, then paid |
| Replit Teams for Edu | ~$7-15 | Education pricing |
| **This platform (Spot)** | ~$2-6 | Self-hosted on GKE |

### Business Model Implications

| Pricing Strategy | Price Point | Margin |
|------------------|-------------|--------|
| Per-student/semester | $15-25 | 75-90% |
| Per-course/semester (200 students) | $2,000-3,000 | 75-85% |
| Site license (department) | $15,000-25,000/year | 70-85% |

### Cost Sensitivity

| Factor | Impact |
|--------|--------|
| Workspace hours per student | High — 150 vs 75 hours = 2x cost difference |
| Spot vs on-demand | High — ~3x cost difference |
| Workspace spec (1 vs 2 vCPU) | High — 2x cost difference |
| AI grading adoption | Medium — adds $1-3/student |
| Idle timeout aggressiveness | Medium — reduces effective hours |
| Number of submissions | Low — grading compute is small |

The biggest cost lever is workspace utilization. Idle timeout and Spot pricing together bring per-student costs well under $5/semester for most realistic usage patterns.

### Compute Architecture

GKE Standard with two node pool types:

| Node Pool | Instance Type | Provisioning | Purpose |
|-----------|--------------|-------------|---------|
| Platform | e2-standard-2 or similar | Spot | API, Centrifugo, executor, Coder server |
| Workspaces | e2-standard-* (varies) | Spot | Student and grading workspaces |

Spot is acceptable for student workspaces because auto-commit every 10 seconds limits data loss to a few seconds of work. The student experiences a brief interruption (workspace restarts) but no meaningful code loss. For timed exams or similar high-stakes sessions, on-demand nodes could be used selectively.

---

## Open Questions

1. **Plagiarism detection:** How does this integrate with tools like MOSS?
2. **Late submissions:** Policy enforcement and grace periods
3. **Regrade requests:** Workflow for students to dispute grades
4. **TA training:** How to onboard TAs on the commit-based workflow
5. **Assignment versioning:** Handling corrections to assignment specs mid-semester
6. **Accessibility:** Ensuring the grading workflow works with screen readers

---

## Appendix: VS Code Extension Code

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
