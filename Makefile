dev: deps-up wait-deps
	cd go-backend && air

deps-up:
	docker-compose up -d

wait-deps:
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	@until redis-cli -h localhost ping > /dev/null 2>&1; do sleep 0.5; done

seed:
	psql "postgresql://app:localdev@localhost:5432/app" -f scripts/seed.sql

reset-db:
	docker-compose down -v postgres
	docker-compose up -d postgres
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	$(MAKE) seed
