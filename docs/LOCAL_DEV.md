# Local Development

## Prerequisites

- A devcontainer-compatible environment (VS Code with Dev Containers extension, GitHub Codespaces, or DevPod)

The devcontainer includes all required tools: Go, Docker, PostgreSQL client, Redis CLI, and Air for hot reload.

## Quick Start

```bash
make dev
```

This single command:
1. Starts all dependency containers (Postgres, Redis, Centrifugo, Cognito-local)
2. Waits for services to be healthy
3. Starts the Go backend with hot reload via Air

## Test Credentials

| Service | Username/Email | Password |
|---------|----------------|----------|
| Cognito | test@example.com | Test1234!$ |
| Postgres | app | localdev |
| Centrifugo Admin | admin | admin |

The test user has the `instructor` role in the `test-u` namespace.

## Common Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start everything and run the backend |
| `make deps-up` | Start dependency containers only |
| `make deps-down` | Stop all containers |
| `make status` | Show container status and health |
| `make logs` | Tail container logs |
| `make test` | Run Go tests |
| `make seed` | Load seed data into Postgres |
| `make reset-db` | Destroy and recreate database with seed data |

## Services

| Service | Port | URL/Connection |
|---------|------|----------------|
| Go Backend | 8080 | http://localhost:8080 |
| PostgreSQL | 5432 | postgresql://app:localdev@localhost:5432/app |
| Redis | 6379 | redis://localhost:6379 |
| Centrifugo | 8000 | http://localhost:8000 |
| Cognito-local | 9229 | http://localhost:9229 |

## Troubleshooting

### Port already in use

Stop any existing containers and processes using the ports:
```bash
make deps-down
```

### Database connection refused

Ensure Postgres is running and healthy:
```bash
make status
```

If unhealthy, restart:
```bash
docker-compose restart postgres
```

### Cognito authentication fails

Verify the cognito-local container is running:
```bash
docker-compose logs cognito
```

The `.cognito/db.json` file contains the user pool configuration. If corrupted, delete and recreate:
```bash
rm -rf .cognito
make deps-down && make deps-up
```

### Hot reload not working

Air watches the `go-backend` directory. Ensure you're editing files in the correct location and that Air is running (check terminal output).

### Tests fail with connection errors

Ensure dependencies are running before running tests:
```bash
make deps-up wait-deps
make test
```
