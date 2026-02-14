# Executor

Secure Python code execution service. Runs student code in nsjail sandboxes with resource limits.

## Structure

```
cmd/executor/main.go        # Entry point
internal/
  handler/execute.go         # POST /execute handler + validation
  sandbox/sandbox.go         # nsjail execution, temp dir setup, output processing
  server/server.go           # HTTP server, routing, middleware
  config/config.go           # Environment config (caarlos0/env)
  metrics/metrics.go         # Prometheus counters + histograms
Dockerfile                   # Multi-stage: nsjail build -> Go build -> Debian runtime
```

## Commands

```bash
make test-executor           # Unit tests (race detector)
make lint-executor           # golangci-lint
make docker-build-executor   # Docker image (multi-stage, builds nsjail from source)
```

## How It Works

1. Receives `POST /execute` with code, optional stdin, file attachments, timeout, random seed
2. Validates request (size limits, filename sanitization)
3. Writes code + files to a temp directory
4. Executes via nsjail with: empty chroot, nobody user, memory/process/file limits
5. Captures stdout/stderr, detects timeouts (context deadline or exit code 137)
6. Sanitizes stderr (hides temp paths, replaces errno numbers)
7. Returns structured JSON response

## API

**`POST /execute`** - Execute Python code

Request:
```json
{
  "code": "print('hello')",
  "stdin": "optional input",
  "files": [{"name": "data.csv", "content": "..."}],
  "random_seed": 42,
  "timeout_ms": 5000
}
```

Response (200 for both success and code failure):
```json
{
  "success": true,
  "output": "hello\n",
  "error": "",
  "execution_time_ms": 45,
  "stdin": "optional input"
}
```

Other endpoints: `GET /healthz`, `GET /readyz` (checks nsjail + python), `GET /metrics`

## Configuration

Key env vars (all have defaults):

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | 8081 | Listen port |
| `NSJAIL_PATH` | /usr/bin/nsjail | nsjail binary |
| `PYTHON_PATH` | /usr/bin/python3 | Python binary |
| `DEFAULT_TIMEOUT_MS` | 10000 | Execution timeout |
| `MAX_CONCURRENT_EXECUTIONS` | 10 | Semaphore limit |
| `MAX_CODE_BYTES` | 102400 | Code size limit (100KB) |
| `MAX_OUTPUT_BYTES` | 1048576 | Output truncation (1MB) |
| `MAX_FILES` | 5 | Attachment count limit |
| `RATE_LIMIT_RPS` | 50 | Rate limit (0 = disabled) |

## Sandbox Limits

- Memory: 128MB (`rlimit_as`)
- File size: 10MB (`rlimit_fsize`)
- Processes: 10 (`rlimit_nproc`)
- Timeout: 1-30 seconds (hard cap)
- Runs as nobody (uid 65534) in empty chroot with read-only Python/lib bind mounts

## Testing

**Unit tests**: Mock `SandboxRunner` function injected into handler. No actual nsjail needed.

```go
runner := func(ctx context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
    return &sandbox.Result{Success: true, Output: "hello\n"}, nil
}
h := NewExecuteHandler(noopLogger(), runner, testMetrics, defaultConfig())
```

**Integration tests**: Require running executor at `EXECUTOR_TEST_URL`. Test real Python execution, network isolation, filesystem isolation. Skip gracefully if unavailable.

**Sandbox tests**: Filename sanitization edge cases, stderr sanitization, output truncation, reserved filename rejection.

## Conventions

- Dependency injection for testability (logger, runner, metrics, config)
- Request validation returns `(reason, errMsg)` tuple; reason is the metric label
- All outcomes recorded in Prometheus metrics (success, failure, timeout, error)
- Use `slog` for structured logging
- Metrics use `NoopRegisterer` in tests
