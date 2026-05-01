# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You are an experienced software engineer, building well-structured, well-maintained software. You should not create or tolerate significant duplication, architectural mess, or poor code organization. Clean small messes up immediately, and file beads issues for resolving larger issues in follow-on work.

## Project Overview

See [README.md](README.md) for full project description and [docs/](docs/) for architecture and design.

**Quick context:** Coding assignment platform for programming courses. Go backend (Chi v5) + PostgreSQL (Cloud SQL) + Centrifugo (WebSocket). Deployed on GKE via Cloud Build. Infrastructure managed with Terraform.

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
make test-all            # Unit + integration tests in parallel
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
| API integration | `make test-integration-api` | — | — |
| Contract tests | `make test-integration-contract` | — | — |
| **All unit tests** | `make test` | `make lint` | — |
| **All integration** | `make test-integration` | — | — |

## Development Guidelines

**Testing:** All production code changes MUST include tests. Integration tests use Docker Postgres with migrations. When E2E tests uncover non-test production bugs, add regression tests at the narrowest feasible scope (unit > integration > contract > E2E) before merging. These tests must fail against the buggy code and pass against the fix.

**Infrastructure:** Terraform modules are environment-agnostic. Environment configs in `infrastructure/terraform/environments/` provide all values.

**Migrations:** SQL migrations in `migrations/` with RLS helpers.

**AI-generated planning docs** (PLAN.md, IMPLEMENTATION.md, DESIGN.md, etc.): store in `history/` at the repo root. Keep the repo root clean.

## Git Hooks (lefthook)

Quality gates are enforced by lefthook git hooks. `--no-verify` is blocked by a Claude Code PreToolUse hook.

**Pre-commit (parallel):** `bd hooks run pre-commit` (exports issues.jsonl + auto-stages it), golangci-lint, eslint, tsc, api-imports, gitleaks
**Pre-push (parallel):** `bd hooks run pre-push`, go test, jest, contract coverage
**Post-checkout / post-merge:** `bd hooks run …` (re-imports JSONL into the local Dolt store after branch switches and merges)
**CI-only:** Integration, contract, e2e tests

Hooks scope to changed file types via glob patterns. Manual run: `lefthook run pre-commit`.

## Issue Tracking (beads)

This project uses `bd` for ALL issue tracking. Do NOT use markdown TODO lists, external trackers, or duplicate tracking systems.

Up-to-date bd workflow guidance is injected on session start via `bd prime` — refer to that for commands, rules, and the session-close protocol. Project-specific notes:

- **Backend:** Dolt-embedded (`.beads/embeddeddolt/`). The on-disk `.beads/issues.jsonl` is an auto-export, auto-staged by the pre-commit hook. JSONL diffs ride along in normal feature-branch PRs to `main`. There is no separate `beads-sync` branch (legacy `bd sync` is gone in v1.0).
- **Prefix:** existing issues use `PLAT-`; new issues mint as `eval-` (set during a v1.0 bootstrap from the directory name). Cross-prefix dependencies work transparently — `bd dep add eval-abc PLAT-xyz` resolves and renders correctly.
- **Issue-writing standard:** every issue must be self-contained — readable cold from its description alone. Required: 1-2 sentence summary (what + why), exact file paths to modify, numbered implementation steps, before→after example when applicable.
- **Dependency direction trap:** `bd dep add X Y` means "X needs Y" = Y blocks X. Temporal words ("Phase 1", "before", "first") invert your thinking. Verify with `bd blocked` (tasks blocked by prerequisites, not their dependents).

## Additional Resources

- **[README.md](README.md)** — Project overview
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture
