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

### Per-Student Per-Semester (Optimized)

| Component | Cost |
|-----------|------|
| Compute (workspaces + grading) | $2.50 - $3.50 |
| AI grading (if enabled) | $1.00 - $3.00 |
| Storage and platform overhead | $0.50 - $1.00 |
| **Total** | **$4.00 - $7.50** |

### Comparison to Alternatives

| Service | Cost/Student/Semester |
|---------|----------------------|
| GitHub Codespaces | $30-50 |
| Gitpod | $25-40 |
| Replit Teams for Edu | $7-15 |
| **This platform (optimized)** | **$4-8** |

### AI Costs (Per Submission)

| Model | Cost |
|-------|------|
| Haiku | ~$0.03 |
| Sonnet | ~$0.10 |
| Opus | ~$0.17 |

With prompt caching and batch API: $0.02-0.05 per submission.
