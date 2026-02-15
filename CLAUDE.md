# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

See [README.md](README.md) for full project description and [docs/](docs/) for architecture and design.

**Quick context:** Coding assignment platform for programming courses. Go backend (Chi v5) + PostgreSQL (Cloud SQL) + Centrifugo (WebSocket). Deployed on GKE Autopilot via Cloud Build. Infrastructure managed with Terraform.

## Package Documentation

Each package has its own `CLAUDE.md` with structure, patterns, and conventions:

- **[go-backend/CLAUDE.md](go-backend/CLAUDE.md)** - API server (handlers, store, auth, RLS, testing)
- **[executor/CLAUDE.md](executor/CLAUDE.md)** - Python sandbox execution service
- **[frontend/CLAUDE.md](frontend/CLAUDE.md)** - Next.js app (components, API client, testing)
- **[infrastructure/terraform/README.md](infrastructure/terraform/README.md)** - Terraform patterns

## Commands

```bash
# Development
make dev                 # Start deps + Go server with hot reload (Air)
make deps-up             # Start Docker Compose services (postgres, redis, centrifugo)
make deps-down           # Stop Docker Compose services
make seed                # Load seed data into local DB
make reset-db            # Destroy and recreate DB with seed data

# Build & test (all projects)
make build               # Build all binaries
make test                # Run all unit tests (with race detector)
make test-integration    # Run all integration tests
make lint                # Lint all projects
make docker-build        # Build all Docker images
```

## Quality Gates

Run these before committing. Pick the targets matching the code you changed.

| Area | Tests | Lint | Typecheck |
|------|-------|------|-----------|
| Go backend | `make test-api` | `make lint-api` | — |
| Executor | `make test-executor` | `make lint-executor` | — |
| Frontend | `make test-frontend` | `make lint-frontend` | `make typecheck-frontend` |
| Frontend API boundaries | `make check-api-imports` | — | — |
| Contract coverage | `make check-contract-coverage` | — | — |
| Store integration | `make test-integration-store` | — | — |
| Realtime integration | `make test-integration-realtime` | — | — |
| Contract tests | `make test-integration-contract` | — | — |
| **All unit tests** | `make test` | `make lint` | — |
| **All integration** | `make test-integration` | — | — |

## Development Guidelines

**Testing:** All production code changes MUST include tests. Integration tests use Docker Postgres with migrations. When E2E tests uncover non-test production bugs, add regression tests at the narrowest feasible scope (unit > integration > contract > E2E) before merging. These tests must fail against the buggy code and pass against the fix.

**Infrastructure:** Terraform modules are environment-agnostic. Environment configs in `infrastructure/terraform/environments/` provide all values.

**Migrations:** SQL migrations in `migrations/` with RLS helpers. See [docs/MIGRATION.md](docs/MIGRATION.md).

## Issue Tracking (beads)

This project uses `bd` (beads) for issue tracking. Key commands:

```bash
bd show <id> --json      # View issue details
bd list --json           # List issues
bd ready --json          # Show unblocked issues
bd update <id> --status in_progress --json
bd close <id> --reason "Done" --json
bd create "Title" -t task -p 2 --json
bd dep add <blocked> <blocker> --json  # Add dependency
```

See AGENTS.md for full beads documentation.

## Additional Resources

- **[README.md](README.md)** - Project overview
- **[AGENTS.md](AGENTS.md)** - AI workflows, beads issue tracking
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
