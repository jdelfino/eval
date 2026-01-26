dev: deps-up wait-deps
	cd go-backend && air

deps-up:
	docker-compose up -d

wait-deps:
	@until pg_isready -h localhost -p 5432 -q; do sleep 0.5; done
	@until redis-cli -h localhost ping > /dev/null 2>&1; do sleep 0.5; done
