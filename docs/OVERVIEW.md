# Coding Assignment Platform

## Vision

A purpose-built platform for programming courses that covers the full assignment lifecycle: creation, distribution, development, submission, autograding, review, and feedback.

**Core principles:**
- **AI-assisted, not AI-dependent**: AI helps instructors create assignments and assists graders, but humans own all grades and feedback
- **No lock-in**: Assignments are portable Git repos; tools work standalone or with the platform
- **Multi-language**: Python, Java, JS/TS, Go, Rust, C++ via devcontainers
- **Self-hosted**: No reliance on third-party services for core functionality

## Key Features

### Assignment Creation
- Template-based assignment structure with starter code, solution, and tests
- Configurable test visibility (visible, hidden, after-deadline)
- AI-assisted generation of problem statements, starter code, solutions, and tests
- Validation that solutions pass all tests before release

### Development Environments
- Browser-based VS Code via cloud workspaces
- Devcontainer-based environments (consistent across dev and grading)
- Auto-commit for academic integrity (captures revision history)
- Students never interact with Git directly

### Grading
- Autograding with hidden test suites
- Unified grading workflow: AI, TA, and instructor all work on same grading branch
- Commit-based feedback (each fix is a commit with explanation)
- AI provides observations to graders; graders own all scores and feedback

### Platform Features
- Roster and section management
- Release scheduling with deadlines and extensions
- Submission tracking
- Grade storage and release

## Scope and Roadmap

This platform is being built in two phases:

### Phase 1: In-Class Exercise Platform (Current)

Migrate the existing live-session application to the new GCP/Go infrastructure. This covers the core loop for in-class coding exercises: instructors create sessions with problems, students write and execute code in-browser, results update in real-time.

**Key components:** Go API, Cloud SQL with RLS, Centrifugo for real-time, Executor Service (nsjail sandbox) for code execution, Identity Platform for auth.

The technical approach is greenfield (new codebase, fresh schema, no data migration) but the product scope matches the existing application.

### Phase 2: Out-of-Class Assignments (Future)

Add full assignment lifecycle support: browser-based development workspaces (Coder), AI-assisted grading, and the commit-based feedback workflow. Student code is managed by the platform internally; GitHub serves as a portability/export format for problem repos, not a runtime dependency.

**Key additions:** Coder for workspace orchestration, AI grading agent, problem repository model with hidden tests, custom grading and feedback UI.

See [design/DESIGN.md](design/DESIGN.md) for the full technical design covering both phases.

## Design Principles

### Tools First
Standalone CLI/library tools that work without the platform. The platform orchestrates but doesn't own core logic.

### Stateless Tools, Stateful Platform
- **Tools handle**: Template operations, grading execution, repo operations
- **Platform handles**: Roster, releases, tracking, notifications, grades

### Explicit Over Magic
No auto-detection or inference. Configuration is explicit and self-documenting.

### Agent-Friendly
Clear inputs/outputs, JSON where useful, composable commands.

## Cost Model

Based on GKE Standard with Spot instances for student workspaces (preemption is tolerable due to 10-second auto-commit).

### Per-Student Per-Semester (Spot, Realistic Usage)

| Component | Cost |
|-----------|------|
| Compute (workspaces + grading, 1 vCPU/2GB, ~75hrs) | $1.00 - $2.00 |
| Compute (workspaces + grading, 2 vCPU/4GB, ~75hrs) | $2.00 - $3.00 |
| AI grading (if enabled) | $1.00 - $3.00 |
| Storage and platform overhead | $0.80 |
| **Total (without AI)** | **$2.00 - $4.00** |
| **Total (with AI)** | **$3.00 - $6.00** |

### Comparison to Alternatives

| Service | Cost/Student/Semester |
|---------|----------------------|
| GitHub Codespaces | $30-50 |
| Gitpod | $25-40 |
| Replit Teams for Edu | $7-15 |
| **This platform (Spot)** | **$2-6** |

### AI Costs (Per Submission)

| Model | Cost |
|-------|------|
| Haiku | ~$0.03 |
| Sonnet | ~$0.10 |
| Opus | ~$0.17 |

With prompt caching and batch API: $0.02-0.05 per submission.

See [design/DESIGN.md](design/DESIGN.md) for detailed cost breakdowns and sensitivity analysis.
