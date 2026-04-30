# Future Features

> This document describes planned future capabilities for the coding assignment platform. It covers what we want to build and why — not how. For technical design, see [design/FUTURE_DESIGN.md](design/FUTURE_DESIGN.md).

The platform currently handles in-class live coding exercises: instructors create sessions with problems, students write and run code in-browser, and results update in real time. The features below describe the next phase of development, expanding the platform into a full assignment lifecycle tool for programming courses.

---

## Out-of-Class Assignments

The biggest planned expansion is support for take-home assignments with persistent student workspaces.

**Browser-based development workspaces.** Students open their assignment directly in VS Code in the browser — no local setup, no package installation, no version conflicts. Environments are defined by devcontainers, so what a student sees matches exactly what the autograder sees.

**Persistent student repos.** Each student gets their own repository per assignment, managed by the platform. Code persists between sessions; students pick up where they left off. They never interact with Git directly.

**Auto-commit for academic integrity.** The workspace commits student work every ~10 seconds in the background. This creates a fine-grained revision history that makes it straightforward to detect paste-in-complete-solution patterns and understand how a student's thinking evolved.

**Submit button workflow.** When a student is done, they click Submit. The platform records the commit SHA and timestamp as the official submission. No emails, no file uploads, no ZIP attachments.

---

## AI-Assisted Grading

AI acts as another grader in the same workflow as human TAs — not a replacement for human judgment.

**What AI does.** The AI grader connects to a grading workspace, runs the test suite, identifies bugs, generates fixes, and commits each validated fix with an explanation. Its primary value is in the two most time-consuming parts of grading: finding individual bugs and articulating what went wrong and why. This frees TAs to focus on reviewing and refining findings rather than discovering them from scratch.

**What AI does not do.** AI does not own grades or feedback. Every AI commit is reviewed by a TA, who must write their own commit message from scratch when accepting an AI finding. This keeps human graders engaged and ensures they understand every piece of feedback that reaches a student.

**Unified grading workflow.** AI, TAs, and instructors all work on the same grading branch in the same workspace. AI goes first (headlessly), TAs review and add their own findings, instructors do a final review and release. The workflow is identical regardless of who — or what — is contributing findings.

---

## Problem Repository Model

A structured format for defining assignments that works across languages and test frameworks.

The `.overlay/` model encodes visibility in the filesystem: the repo root is exactly what students see (starter code, visible tests, devcontainer config), and the `.overlay/` directory holds everything hidden from students (reference solution, hidden tests, grading rubric). No manifest files needed — the structure is the manifest.

This makes problem repos self-contained, portable, and importable from GitHub. Instructors own their assignments and can take them elsewhere.

For the full specification — repo layout, `problem.yaml` schema, overlay mechanics, and validation tooling — see [design/PROBLEM_REPOS.md](design/PROBLEM_REPOS.md).

---

## Multi-Language Support

The platform is designed to be language-agnostic from the start.

**Supported languages (planned).** Python, Java, JavaScript/TypeScript, Go, Rust, and C++. Language-specific toolchains are defined in `.devcontainer/devcontainer.json`, so adding a new language is a matter of providing a devcontainer configuration — the platform has no language-specific installation logic.

**Framework-agnostic test execution.** The platform runs a configured test command (an opaque shell string) and reads JUnit XML output. Every major test framework supports JUnit XML: pytest, JUnit/Surefire, Jest, Vitest, Google Test, Go's testing package with go-junit-report. The platform never parses test code or knows about test frameworks — it just reads structured results.

---

## Design Principles

These principles guide how future features are designed and built.

**Tools first.** Core logic lives in standalone CLI tools that work without the platform. The platform orchestrates, schedules, and tracks — but it does not own the logic for grading, workspace management, or repo operations. Tools can be used independently, tested in isolation, and replaced.

**Stateless tools, stateful platform.** Tools handle operations (run tests, apply overlay, generate starter code). The platform handles state (rosters, releases, submissions, grades, notifications). This separation keeps tools simple and makes the platform the single source of truth for course data.

**No lock-in.** Assignments are portable Git repos. Problem repos can be imported from GitHub and exported back. Students never need a GitHub account — the platform manages their code internally. Instructors can leave and take their assignments with them.

**Agent-friendly.** Clear inputs and outputs, JSON where useful, composable commands. The platform is designed to work well with AI agents as participants in the grading and assignment-creation workflows — not just as an afterthought.
