# Coding Assignment Platform

A purpose-built platform for programming courses covering the full assignment
lifecycle: creation, distribution, development, submission, autograding, review,
and feedback.

## Core Principles

- **AI-assisted, not AI-dependent** — AI helps create assignments and assists
  graders, but humans own all grades and feedback
- **No lock-in** — Assignments are portable Git repos that work standalone or
  with the platform
- **Multi-language** — Python, Java, JS/TS, Go, Rust, C++ via devcontainers
- **Self-hosted** — No reliance on third-party services for core functionality

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Go 1.24 (Chi v5) |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Database | PostgreSQL 15 (Cloud SQL) with Row-Level Security |
| Real-time | Centrifugo v5 (WebSocket, Redis-backed) |
| Code Execution | Python executor service, nsjail sandbox, KEDA autoscaling |
| Auth | Google Identity Platform (SAML federation) |
| Infrastructure | GKE, Terraform, Cloud Build |
| CI/CD | GitHub Actions + Google Cloud Build |

## Project Structure

```
go-backend/          # Go API server (see go-backend/CLAUDE.md)
frontend/            # Next.js app (see frontend/CLAUDE.md)
executor/            # Python sandbox execution service (see executor/CLAUDE.md)
migrations/          # SQL migrations (RLS-enabled)
infrastructure/      # Terraform modules and environment configs
k8s/                 # Kubernetes manifests
pkg/                 # Shared Go packages
scripts/             # Development and CI scripts
docs/                # Architecture, design, and workflow docs
```

## Quick Start

```bash
make dev             # Start deps + Go server with hot reload
make test            # Run all unit tests
make lint            # Lint all projects
```

See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for full setup including
prerequisites, seed data, and environment configuration.

## Documentation

**Current:**
- **[Overview](docs/OVERVIEW.md)** — Vision, features, roadmap, and cost model
- **[Architecture](docs/ARCHITECTURE.md)** — System architecture and GCP infrastructure
- **[Local Development](docs/LOCAL_DEV.md)** — Development environment setup

**Design (forward-looking):**
- **[Technical Design](docs/design/DESIGN.md)** — Full technical design covering Phase 1 and Phase 2
- **[Problem Repos](docs/design/PROBLEM_REPOS.md)** — Assignment repository structure (Phase 2)
- **[Workflows (Draft)](docs/design/WORKFLOWS-DRAFT.md)** — Speculative grading and student workflow details

## Status

Phase 1 (in-class exercise platform) is under active development — migrating the
existing live-session application to Go/GCP infrastructure. See
[beads issues](.beads/) for current work tracking.
