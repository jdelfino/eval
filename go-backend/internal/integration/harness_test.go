// Package integration provides API-level integration tests that exercise the
// full middleware chain (auth, user-load, RLS) against a real PostgreSQL
// database. This catches bugs that unit tests and store-level integration
// tests cannot, such as missing SET ROLE in the RLS middleware.
//
// Requirements:
//   - DATABASE_URL pointing at a PostgreSQL instance with migrations applied
//   - Run via: make test-integration-api
//
// Tests skip automatically when DATABASE_URL is not set, so they are safe
// to include in a plain `go test ./...` run.
package integration

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/jdelfino/eval/go-backend/internal/config"
	"github.com/jdelfino/eval/go-backend/internal/db"
	"github.com/jdelfino/eval/go-backend/internal/server"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// testHarness holds a running test server backed by a real database.
type testHarness struct {
	Server *httptest.Server
	Pool   *pgxpool.Pool
	nsID   string // random namespace for test isolation
}

// setupHarness creates a real HTTP server with AUTH_MODE=test and a real
// database. Tests should call this once per top-level test function; the
// server and pool are cleaned up automatically via t.Cleanup.
//
// Returns nil if DATABASE_URL is not set (test should skip).
func setupHarness(t *testing.T) *testHarness {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping database: %v", err)
	}

	// Ensure eval_app role exists (migration 008 creates it, but CI may
	// apply migrations via psql before the role migration exists).
	if err := ensureAppRole(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("ensure eval_app role: %v", err)
	}

	// Create an isolated namespace for this test run.
	nsID := "ns-api-" + uuid.New().String()
	if _, err := pool.Exec(ctx, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`, nsID, "API Test NS"); err != nil {
		pool.Close()
		t.Fatalf("create test namespace: %v", err)
	}

	// Create the real server with AUTH_MODE=test.
	cfg := &config.Config{
		Port:        0,
		Environment: "test",
		AuthMode:    "test",
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	dbPool := &db.Pool{Pool: pool}
	userStore := store.New(pool)

	// Use a dedicated Prometheus registry to avoid "already registered" panics
	// when multiple tests create servers in the same process.
	reg := prometheus.NewRegistry()
	srv := server.NewWithRegistry(cfg, logger, dbPool, userStore, reg)

	ts := httptest.NewServer(srv.Handler())
	h := &testHarness{
		Server: ts,
		Pool:   pool,
		nsID:   nsID,
	}

	t.Cleanup(func() {
		ts.Close()
		// Clean up: delete namespace (CASCADE removes all child rows).
		_, _ = pool.Exec(context.Background(), "DELETE FROM namespaces WHERE id = $1", nsID)
		pool.Close()
	})

	return h
}

// createUser inserts a user directly (bypassing RLS) and returns the user ID
// and the bearer token that the test validator accepts.
func (h *testHarness) createUser(ctx context.Context, t *testing.T, email string, role string, namespaceID string) (uuid.UUID, string) {
	t.Helper()

	id := uuid.New()
	extID := "ext-" + id.String()[:8]

	var nsPtr *string
	if namespaceID != "" {
		nsPtr = &namespaceID
	}

	_, err := h.Pool.Exec(ctx, `INSERT INTO users (id, external_id, email, role, namespace_id) VALUES ($1, $2, $3, $4, $5)`,
		id, extID, email, role, nsPtr)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}

	// Token format for test validator: test:<external_id>:<email>
	token := fmt.Sprintf("test:%s:%s", extID, email)
	return id, token
}

// ensureAppRole creates the eval_app role if it doesn't exist.
func ensureAppRole(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eval_app') THEN
				CREATE ROLE eval_app WITH LOGIN PASSWORD 'eval_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
			END IF;
		END $$
	`)
	if err != nil {
		return fmt.Errorf("create role: %w", err)
	}

	for _, stmt := range []string{
		"GRANT CONNECT ON DATABASE eval TO eval_app",
		"GRANT USAGE ON SCHEMA public TO eval_app",
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eval_app",
		"GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO eval_app",
		"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO eval_app",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}
	return nil
}

// doRequest makes an authenticated HTTP request to the test server.
func (h *testHarness) doRequest(t *testing.T, method, path, token string) *http.Response {
	t.Helper()

	url := h.Server.URL + path
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}
