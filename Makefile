# ──────────────────────────────────────────────
# Aggregate targets
# ──────────────────────────────────────────────
.PHONY: build test test-integration lint docker-build

build: build-api build-executor build-frontend
test: test-api test-executor test-frontend
test-integration: test-integration-store test-integration-executor test-integration-contract
lint: lint-api lint-executor lint-frontend

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

docker-build-api:
	docker build -t go-api:local go-backend/

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

test-integration-executor:
	./scripts/ensure-test-postgres.sh
	docker-compose up -d executor --wait
	cd executor && EXECUTOR_TEST_URL=http://localhost:8081 go test -v -race -count=1 ./... -run Integration

docker-build-executor:
	docker build -t executor:local executor/

# ──────────────────────────────────────────────
# Contract tests (frontend ↔ API)
# ──────────────────────────────────────────────
.PHONY: test-integration-contract

test-integration-contract:
	./scripts/run-contract-tests.sh

# ──────────────────────────────────────────────
# Store integration tests
# ──────────────────────────────────────────────
.PHONY: test-integration-store

test-integration-store:
	./scripts/ensure-test-postgres.sh
	cd go-backend && DATABASE_URL="postgresql://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test -v -race -count=1 ./internal/store/... -run TestIntegration

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────
.PHONY: build-frontend test-frontend lint-frontend typecheck-frontend

build-frontend:
	cd frontend && npm run build

test-frontend:
	cd frontend && npx jest --no-coverage

lint-frontend:
	cd frontend && npm run lint

typecheck-frontend:
	cd frontend && npx tsc --noEmit

# ──────────────────────────────────────────────
# Local development
# ──────────────────────────────────────────────
.PHONY: dev deps-up deps-down wait-deps seed reset-db status logs

dev: deps-up wait-deps
	cd go-backend && air

deps-up:
	docker-compose up -d

deps-down:
	docker-compose down

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
	docker-compose down -v postgres
	docker-compose up -d postgres
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	$(MAKE) seed

status:
	@docker-compose ps
	@echo ""
	@echo "Service health:"
	@docker-compose ps --format json | jq -r '.[] | "\(.Name): \(.Health // "N/A")"'

logs:
	docker-compose logs -f
