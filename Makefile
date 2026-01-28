.PHONY: dev deps-up deps-down wait-deps seed reset-db status test logs

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

test:
	cd go-backend && go test ./...

logs:
	docker-compose logs -f

# Go Backend targets
.PHONY: go-build go-test go-lint docker-build test-integration

go-build:
	cd go-backend && go build -o ./tmp/server ./cmd/server

go-test:
	cd go-backend && go test -v -race ./...

go-lint:
	cd go-backend && golangci-lint run ./...

docker-build:
	docker build -t go-api:local go-backend/

test-integration: ## Run executor integration tests (requires Docker)
	docker-compose up -d executor --wait
	cd executor && EXECUTOR_TEST_URL=http://localhost:8081 go test -v -race -count=1 ./... -run Integration
	docker-compose down executor
