# Local Development

## Prerequisites

- A devcontainer-compatible environment (VS Code with Dev Containers extension, GitHub Codespaces, or DevPod)

The devcontainer includes all required tools: Go, Docker, PostgreSQL client, Redis CLI, and Air for hot reload.

## Quick Start

```bash
make dev
```

This single command:
1. Starts all dependency containers (Postgres, Redis, Centrifugo)
2. Waits for services to be healthy
3. Starts the Go backend with hot reload via Air

## Test Credentials

| Service | Username | Password |
|---------|----------|----------|
| Postgres | eval | eval_local_password |
| Centrifugo Admin | admin | admin |

## Authentication

Local development uses mock auth middleware or the Firebase Auth Emulator (Identity Platform). See `.env.example` for configuration.

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
| PostgreSQL | 5432 | postgresql://eval:eval_local_password@localhost:5432/eval |
| Redis | 6379 | redis://localhost:6379 |
| Centrifugo | 8000 | http://localhost:8000 |

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

### Hot reload not working

Air watches the `go-backend` directory. Ensure you're editing files in the correct location and that Air is running (check terminal output).

### Tests fail with connection errors

Ensure dependencies are running before running tests:
```bash
make deps-up wait-deps
make test
```
