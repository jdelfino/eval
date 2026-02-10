# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

See [README.md](README.md) for full project description and [docs/](docs/) for architecture and design.

**Quick context:** Coding assignment platform for programming courses. Go backend (Chi v5) + PostgreSQL (Cloud SQL) + Centrifugo (WebSocket). Deployed on GKE Standard (with dedicated node pools) via Cloud Build. Infrastructure managed with Terraform.

## Key Files for Navigation

- `go-backend/cmd/server/main.go` - Application entry point
- `go-backend/internal/server/` - Server setup and routing
- `go-backend/internal/handler/` - HTTP handlers
- `go-backend/internal/store/` - Data access layer (repository pattern, pgx)
- `go-backend/internal/auth/` - Identity Platform JWT validation, RBAC
- `go-backend/internal/middleware/` - Logging, RLS context, auth
- `go-backend/internal/config/` - Environment config loading
- `migrations/` - SQL migrations with RLS helpers
- `infrastructure/terraform/` - GCP infrastructure (modules + environments)

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

# Per-project: build-<project>, test-<project>, lint-<project>
# Projects: api (go-backend), executor
```

## Development Guidelines

**Language:** Go 1.24. Follow standard Go idioms (`internal/` for unexported packages, `cmd/` for entry points).

**Database:** PostgreSQL with Row-Level Security. Session variables (`app.user_id`, `app.namespace_id`, `app.role`) enforce access. Use the `Querier` interface to abstract `pgxpool.Pool` and `pgx.Tx`.

**Auth:** Google Identity Platform (JWT). Use middleware for auth validation and RLS context injection.

**Config:** Environment variables via `caarlos0/env`. See `.env.example` for required variables.

**Testing:** All production code changes MUST include tests. Integration tests use Docker Postgres with migrations. When E2E tests uncover non-test production bugs, add regression tests at the narrowest feasible scope (unit > integration > contract > E2E) before merging. These tests must fail against the buggy code and pass against the fix.

**Infrastructure:** Terraform modules are environment-agnostic. Environment configs in `infrastructure/terraform/environments/` provide all values. See `infrastructure/terraform/README.md` for patterns.

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
- **[infrastructure/terraform/README.md](infrastructure/terraform/README.md)** - Terraform patterns
