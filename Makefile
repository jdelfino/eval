# ──────────────────────────────────────────────
# Aggregate targets
# ──────────────────────────────────────────────
.PHONY: build test test-integration lint docker-build test-e2e test-all ensure-test-deps

build: build-api build-executor build-frontend
test: test-api test-executor test-frontend
test-integration: test-integration-store test-integration-realtime test-integration-api test-integration-executor test-integration-contract
lint: lint-api lint-executor lint-frontend

# Run all unit + integration tests. Use: make -j2 test-all
# ensure-test-deps runs first (order-only prerequisite), then test targets run in parallel.

# Force re-run if postgres isn't responding, even if stamp file is current
ifneq ($(shell pg_isready -h localhost -p 5432 -q 2>/dev/null && echo yes),yes)
.PHONY: .deps-ready
endif

.deps-ready: $(wildcard migrations/*.up.sql) docker-compose.yml
	./scripts/ensure-test-postgres.sh
	@touch $@

ensure-test-deps: .deps-ready

test-all: | ensure-test-deps
test-all: test-api test-executor test-frontend \
	test-integration-store test-integration-realtime test-integration-api \
	test-integration-contract

docker-build: docker-build-api docker-build-executor

# ──────────────────────────────────────────────
# API (go-backend)
# ──────────────────────────────────────────────
.PHONY: build-api test-api lint-api docker-build-api

build-api:
	cd go-backend && go build -o ./tmp/server ./cmd/server

test-api:
	cd go-backend && go test -race ./...

lint-api:
	cd go-backend && golangci-lint run ./...
	cd go-backend && go run ./cmd/writeerror500lint ./...

docker-build-api:
	docker build -f go-backend/Dockerfile -t go-api:local .

# ──────────────────────────────────────────────
# Executor
# ──────────────────────────────────────────────
.PHONY: build-executor test-executor lint-executor test-integration-executor docker-build-executor

build-executor:
	cd executor && go build -o ./tmp/executor ./cmd/executor

test-executor:
	cd executor && go test -race ./...

lint-executor:
	cd executor && golangci-lint run ./...

# Rebuild executor image and restart the container when source files change.
# The container is restarted here (not just the image rebuilt) so that any
# currently-running container immediately picks up the new image.  Without the
# 'up' step, run-e2e-tests.sh would skip the restart because the old container
# is still healthy.
EXECUTOR_SOURCES := $(shell find executor/ pkg/ -name '*.go' -o -name '*.policy' -o -name '*.java' -o -name 'Dockerfile' -o -name 'go.mod' -o -name 'go.sum' 2>/dev/null)
.executor-image: $(EXECUTOR_SOURCES)
	docker compose up -d executor --build --wait
	@touch $@

test-integration-executor: .executor-image
	./scripts/ensure-test-postgres.sh
	docker compose up -d executor --wait
	cd executor && EXECUTOR_TEST_URL=http://localhost:8081 go test -v -race -count=1 ./... -run Integration

docker-build-executor:
	docker build -f executor/Dockerfile -t executor:local .

# ──────────────────────────────────────────────
# Contract tests (frontend ↔ API)
# ──────────────────────────────────────────────
.PHONY: test-integration-contract

test-integration-contract:
	./scripts/run-contract-tests.sh

# ──────────────────────────────────────────────
# Realtime event contract tests (frontend ↔ Centrifugo)
# ──────────────────────────────────────────────
.PHONY: test-integration-realtime-contract

test-integration-realtime-contract:
	./scripts/run-realtime-contract-tests.sh

# ──────────────────────────────────────────────
# E2E tests (Playwright)
# ──────────────────────────────────────────────
.PHONY: test-e2e test-e2e-auth

# Rebuild Next.js standalone build when frontend source files change.
# Uses the same stamp-file pattern as .executor-image.
# $$ escapes shell variables so they're expanded at recipe runtime, not by make.
FRONTEND_E2E_SRCS := $(shell find frontend/src frontend/public \
    -type f ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/test-results/*' \
    2>/dev/null) \
    $(wildcard frontend/package.json frontend/package-lock.json \
               frontend/next.config.ts frontend/tsconfig.json \
               frontend/playwright.config.ts)

.next-e2e-build: $(FRONTEND_E2E_SRCS)
	@# Turbopack cannot follow symlinks outside the project root (worktrees use symlinked node_modules).
	@if [ -L frontend/node_modules ]; then \
	  echo "Symlinked node_modules detected — running npm install for Turbopack compatibility..."; \
	  rm frontend/node_modules; \
	  (cd frontend && npm install --prefer-offline); \
	fi
	cd frontend && \
	NEXT_PUBLIC_API_URL=/api/v1 \
	NEXT_PUBLIC_CENTRIFUGO_URL="ws://$${DOCKER_HOST_IP:-localhost}:8000/connection/websocket" \
	NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key \
	NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$${DOCKER_HOST_IP:-localhost}" \
	NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test \
	NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="http://$${DOCKER_HOST_IP:-localhost}:9099" \
	API_PROXY_URL="http://localhost:$${API_PORT:-4100}" \
	npm run build
	@touch $@

# Extra Playwright args can be passed after '--':  make test-e2e -- e2e/foo.spec.ts
# $(MAKECMDGOALS) captures all goals; filter out 'test-e2e' to get the remainder.
E2E_ARGS := $(filter-out test-e2e,$(MAKECMDGOALS))

test-e2e: .next-e2e-build .executor-image
	./scripts/run-e2e-tests.sh $(E2E_ARGS)

# Catch-all so unknown goals (Playwright file paths / -g patterns) don't error.
%:
	@:

test-e2e-auth: .next-e2e-build .executor-image
	USE_FIREBASE_EMULATOR=1 ./scripts/run-e2e-tests.sh

# ──────────────────────────────────────────────
# Realtime integration tests (Centrifugo)
# ──────────────────────────────────────────────
.PHONY: test-integration-realtime

test-integration-realtime:
	./scripts/ensure-test-postgres.sh
	cd go-backend && CENTRIFUGO_URL=http://localhost:8000 CENTRIFUGO_API_KEY=local-api-key CENTRIFUGO_TOKEN_SECRET=local-dev-secret-key-not-for-production go test -v -race -count=1 ./internal/realtime/...

# ──────────────────────────────────────────────
# Store integration tests
# ──────────────────────────────────────────────
.PHONY: test-integration-api test-integration-store

test-integration-api:
	./scripts/ensure-test-postgres.sh
	cd go-backend && DATABASE_URL="postgresql://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test -v -race -count=1 ./internal/integration/...

test-integration-store:
	./scripts/ensure-test-postgres.sh
	cd go-backend && DATABASE_URL="postgresql://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test -v -race -count=1 ./internal/store/... -run TestIntegration

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────
.PHONY: build-frontend test-frontend lint-frontend typecheck-frontend check-contract-coverage check-api-imports

build-frontend:
	cd frontend && npm run build

test-frontend:
	cd frontend && npx jest --selectProjects client --no-coverage

lint-frontend:
	cd frontend && npm run lint

typecheck-frontend:
	cd frontend && npx tsc --noEmit

check-contract-coverage:
	cd frontend && npx tsx scripts/check-contract-coverage.ts

check-api-imports:
	cd frontend && npx tsx scripts/check-api-imports.ts

# ──────────────────────────────────────────────
# Migration lint
# ──────────────────────────────────────────────
.PHONY: test-lint-migrations

test-lint-migrations:
	bash scripts/test-lint-migrations.sh

# ──────────────────────────────────────────────
# E2E script tests (cache-aware behavior)
# ──────────────────────────────────────────────
.PHONY: test-run-e2e-tests

test-run-e2e-tests:
	bash scripts/test-run-e2e-tests.sh

# ──────────────────────────────────────────────
# Staging seed script tests
# ──────────────────────────────────────────────
.PHONY: test-seed-staging

test-seed-staging:
	bash scripts/test-seed-staging.sh

# Deploy pipeline validation
# ──────────────────────────────────────────────
.PHONY: validate-deploy-pipeline

validate-deploy-pipeline:
	python3 scripts/validate-deploy-pipeline.py

# ──────────────────────────────────────────────
# Smoke tests (post-deploy)
# ──────────────────────────────────────────────
.PHONY: smoke-test validate-executor-sandbox test-smoke-test test-validate-executor-sandbox

smoke-test:
	./scripts/smoke-test.sh

validate-executor-sandbox:
	./scripts/validate-executor-sandbox.sh

test-smoke-test:
	./scripts/test-smoke-test.sh

test-validate-executor-sandbox:
	./scripts/test-validate-executor-sandbox.sh

# ──────────────────────────────────────────────
# Local development
# ──────────────────────────────────────────────
.PHONY: dev deps-up deps-down wait-deps seed reset-db status logs

dev: deps-up wait-deps
	cd go-backend && MIGRATIONS_PATH=../migrations air

deps-up:
	docker compose up -d

deps-down:
	docker compose down

wait-deps:
	@echo "Waiting for postgres..."
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	@echo "Postgres is ready"
	@echo "Waiting for redis..."
	@until redis-cli -h localhost ping > /dev/null 2>&1; do sleep 0.5; done
	@echo "Redis is ready"
	@echo "All dependencies are ready"

seed:
	psql "postgresql://eval:eval_local_password@localhost:5432/eval" -f scripts/seed.sql

reset-db:
	docker compose down -v postgres
	docker compose up -d postgres
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	@echo "Database reset. Run 'make dev' to apply migrations, then 'make seed' for test data."

status:
	@docker compose ps
	@echo ""
	@echo "Service health:"
	@docker compose ps --format json | jq -r '.[] | "\(.Name): \(.Health // "N/A")"'

logs:
	docker compose logs -f

# ──────────────────────────────────────────────
# Staging management
# ──────────────────────────────────────────────
.PHONY: staging-down staging-up staging-status

STAGING_NS := eval-staging
STAGING_DEPLOYMENTS := api executor centrifugo

staging-down:
	kubectl -n $(STAGING_NS) scale deploy $(STAGING_DEPLOYMENTS) --replicas=0

staging-up:
	kubectl -n $(STAGING_NS) scale deploy $(STAGING_DEPLOYMENTS) --replicas=1
	@for d in $(STAGING_DEPLOYMENTS); do \
		kubectl -n $(STAGING_NS) rollout status deploy/$$d --timeout=120s; \
	done

staging-status:
	kubectl -n $(STAGING_NS) get deployments

# ──────────────────────────────────────────────
# Production database access
# ──────────────────────────────────────────────
.PHONY: db-proxy db-prod

db-proxy:
	./scripts/db-proxy.sh

db-prod: db-proxy
