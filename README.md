# Coding Assignment Platform

A purpose-built platform for programming courses covering the full assignment lifecycle: creation, distribution, development, submission, autograding, review, and feedback.

## Core Principles

- **AI-assisted, not AI-dependent** - AI helps create assignments and assists graders, but humans own all grades and feedback
- **No lock-in** - Assignments are portable Git repos that work standalone or with the platform
- **Multi-language** - Python, Java, JS/TS, Go, Rust, C++ via devcontainers
- **Self-hosted** - No reliance on third-party services for core functionality

## Tech Stack

- **Backend:** Go 1.24 (Chi v5)
- **Database:** PostgreSQL 15 (Cloud SQL) with Row-Level Security
- **Real-time:** Centrifugo v5 (WebSocket, Redis-backed)
- **Infrastructure:** GKE, Terraform
- **CI/CD:** GitHub Actions + Google Cloud Build
- **Auth:** Google Identity Platform (SAML federation)

## Quick Start

```bash
make dev          # Start all services + Go server with hot reload
make test         # Run tests
make go-lint      # Lint
```

See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for full local development setup.

## Initial Bootstrap

On first deploy, create the system-admin account by setting `BOOTSTRAP_ADMIN_EMAIL` to the admin's email address before starting the server. Then sign in with a matching verified social provider account (Google, GitHub, or Microsoft) and `POST /auth/bootstrap`. The first successful call creates the system-admin user. Once the admin account exists, unset or clear `BOOTSTRAP_ADMIN_EMAIL` to disable the bootstrap endpoint.

## Documentation

- **[Overview](docs/OVERVIEW.md)** - Vision, features, design principles, cost model
- **[Architecture](docs/ARCHITECTURE.md)** - System architecture and GCP infrastructure
- **[Migration](docs/MIGRATION.md)** - Build phases and approach
- **[Workflows (Draft)](docs/WORKFLOWS-DRAFT.md)** - Speculative workflow details

## Status

Early development. See [beads issues](.beads/) for current work.
