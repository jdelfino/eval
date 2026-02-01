# PLAT-fs7: Frontend-to-API Integration Test Harness

## Goal
TypeScript contract tests that run against the real Go API server, validating that HTTP response shapes match frontend type definitions. Catches field name, nullability, and type mismatches like the PascalCase User bug.

## Architecture

```
make test-integration-contract
  ├── docker-compose up -d postgres (with migrations)
  ├── go run ./cmd/server (AUTH_MODE=test, pointed at local postgres)
  ├── wait for /healthz
  ├── make seed (populate test data)
  ├── cd frontend && npx jest --selectProjects integration
  └── teardown (kill server, docker-compose down)
```

### Auth: Test TokenValidator
- Add `AUTH_MODE` env var to config (`config.go`)
- When `AUTH_MODE=test`, `server.go` uses a `testValidator` that accepts tokens in format `test:<external_id>:<email>`
- Everything downstream (user lookup, RLS, handlers) runs for real
- Test validator lives in `go-backend/internal/auth/testvalidator.go` (build-tagged or always present since it's gated by env var)

### Test Runner: Makefile target
- New `test-integration-contract` target that orchestrates: deps up → build & start server → seed → jest → teardown
- Reuses existing docker-compose postgres service
- Server runs as a background process, killed on exit

### Contract Tests: Jest integration project
- Tests live in `frontend/src/__tests__/contract/` as `*.integration.test.ts`
- Each test file covers one endpoint group
- Tests use plain `fetch` (not the api-client, which requires Firebase) with test auth tokens
- Response validation: parse JSON, assert field presence/types against TS interfaces using type guards or manual checks
- Seed data provides known state (see `scripts/seed.sql` for exact IDs)

## Subtasks

### 1. Add AUTH_MODE=test support to Go server
- Add `AuthMode string` field to `config.Config`
- Create `auth.NewTestValidator()` that parses `test:<external_id>:<email>` tokens
- Wire it into `server.go` when `AuthMode == "test"`
- Files: `config/config.go`, `auth/testvalidator.go`, `server/server.go`

### 2. Add test harness orchestration (Makefile + helper script)
- New `test-integration-contract` Makefile target
- Shell script `scripts/run-contract-tests.sh` that handles: start deps, build+start server, wait for healthy, seed, run jest, capture exit code, cleanup
- Files: `Makefile`, `scripts/run-contract-tests.sh`

### 3. Write contract tests for core endpoints
- `/api/v1/auth/me` — User shape (the bug that motivated this)
- `/api/v1/classes` — Class[] shape
- `/api/v1/sections/my` — Section[] shape
- `/api/v1/admin/users` — User[] shape (system-admin)
- `/api/v1/realtime/token` — token response shape
- `/api/v1/sessions/{id}/state` — SessionState shape
- Test helper: `contractTestFetch(path, externalId)` that adds test auth header
- Files: `frontend/src/__tests__/contract/*.integration.test.ts`

### 4. CI integration
- Separate CI job (not blocking unit tests)
- Runs `make test-integration-contract`
- Files: CI config (Cloud Build or GitHub Actions — TBD based on existing CI)

## Dependencies
- Task 2 depends on Task 1 (server must support test auth before harness can run it)
- Task 3 depends on Task 2 (harness must exist before tests can run)
- Task 4 depends on Task 3 (need tests before CI job)

## Open Questions
- CI config format: need to check what CI system is in use
- Whether centrifugo needs to be running for the `/realtime/token` endpoint (likely not — it just generates a token)
