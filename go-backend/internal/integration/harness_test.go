// Package integration provides API-level integration tests that exercise the
// full middleware chain (auth, user-load, RLS) against a real PostgreSQL
// database. This catches bugs that unit tests and store-level integration
// tests cannot, such as missing SET ROLE in the RLS middleware.
//
// Requirements:
//   - DATABASE_URL pointing at a PostgreSQL instance with migrations applied
//   - FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 (or wherever the emulator runs)
//   - Run via: make test-integration-api
//
// Tests skip automatically when DATABASE_URL or FIREBASE_AUTH_EMULATOR_HOST
// are not set, so they are safe to include in a plain `go test ./...` run.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// testHarness holds a running test server backed by a real database.
type testHarness struct {
	Server      *httptest.Server
	Pool        *pgxpool.Pool // superuser pool for scaffolding (inserts, cleanup)
	AppPool     *pgxpool.Pool // non-superuser pool used by the server
	nsID        string        // random namespace for test isolation
	emulatorURL string        // Firebase Auth Emulator base URL
	apiKey      string        // Fake API key for emulator REST calls
	projectID   string        // Firebase project ID (demo-test for emulator)
}

// setupHarness creates a real HTTP server using the Firebase Auth Emulator and
// a real database. Tests should call this once per top-level test function; the
// server and pool are cleaned up automatically via t.Cleanup.
//
// Returns nil if DATABASE_URL or FIREBASE_AUTH_EMULATOR_HOST is not set
// (test should skip).
func setupHarness(t *testing.T) *testHarness {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil
	}

	emulatorHost := os.Getenv("FIREBASE_AUTH_EMULATOR_HOST")
	if emulatorHost == "" {
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

	// Ensure eval_app and app roles exist for RLS testing.
	if err := testutil.EnsureAppRole(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("ensure app roles: %v", err)
	}

	// Create non-superuser pool mirroring production.
	appPool, err := testutil.NewAppPool(ctx, dbURL)
	if err != nil {
		pool.Close()
		t.Fatalf("create app pool: %v", err)
	}

	// Create an isolated namespace for this test run.
	nsID := "ns-api-" + uuid.New().String()
	if _, err := pool.Exec(ctx, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`, nsID, "API Test NS"); err != nil {
		appPool.Close()
		pool.Close()
		t.Fatalf("create test namespace: %v", err)
	}

	// Create the server using Firebase Auth Emulator.
	// The FIREBASE_AUTH_EMULATOR_HOST env var is already set; the Firebase Admin
	// SDK automatically connects to the emulator when this var is present.
	cfg := &config.Config{
		Port:        0,
		Environment: "test",
		GCPProjectID: "demo-test", // must match the emulator project ID
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	dbPool := &db.Pool{Pool: appPool}
	// userStore uses the superuser pool because in production the app user
	// owns the tables and bypasses RLS for user lookups. In tests, eval owns
	// the tables so we use the superuser pool for the same bypass behavior.
	userStore := store.New(pool)

	// Use a dedicated Prometheus registry to avoid "already registered" panics
	// when multiple tests create servers in the same process.
	reg := prometheus.NewRegistry()
	srv, err := server.NewWithRegistry(cfg, logger, dbPool, userStore, reg)
	if err != nil {
		appPool.Close()
		pool.Close()
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	ts := httptest.NewServer(srv.Handler())
	h := &testHarness{
		Server:      ts,
		Pool:        pool,
		AppPool:     appPool,
		nsID:        nsID,
		emulatorURL: "http://" + emulatorHost,
		apiKey:      "fake-api-key",
		projectID:   "demo-test",
	}

	t.Cleanup(func() {
		ts.Close()
		// Clean up: delete namespace (CASCADE removes all child rows).
		_, _ = pool.Exec(context.Background(), "DELETE FROM namespaces WHERE id = $1", nsID)
		appPool.Close()
		pool.Close()
	})

	return h
}

// createUser creates a Firebase Auth Emulator user, inserts the matching DB
// record (bypassing RLS), and returns the user ID and a real Firebase ID token.
func (h *testHarness) createUser(ctx context.Context, t *testing.T, email string, role string, namespaceID string) (uuid.UUID, string) {
	t.Helper()

	id := uuid.New()

	var nsPtr *string
	if namespaceID != "" {
		nsPtr = &namespaceID
	}

	// Create user in Firebase Auth Emulator
	password := "test-password-" + id.String()[:8] // gitleaks:allow
	firebaseUID := h.createEmulatorUser(t, email, password)

	// Insert user record into DB using the Firebase UID as external_id
	_, err := h.Pool.Exec(ctx, `INSERT INTO users (id, external_id, email, role, namespace_id) VALUES ($1, $2, $3, $4, $5)`,
		id, firebaseUID, email, role, nsPtr)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}

	// Sign in to get a real Firebase ID token
	token := h.getEmulatorToken(t, email, password)
	return id, token
}

// createEmulatorUser creates a user in the Firebase Auth Emulator and returns the UID.
func (h *testHarness) createEmulatorUser(t *testing.T, email, password string) string {
	t.Helper()

	url := fmt.Sprintf("%s/identitytoolkit.googleapis.com/v1/accounts:signUp?key=%s",
		h.emulatorURL, h.apiKey)
	body := map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	}
	resp := h.emulatorPost(t, url, body)
	return resp["localId"].(string)
}

// getEmulatorToken signs in via the Firebase Auth Emulator and returns an ID token.
func (h *testHarness) getEmulatorToken(t *testing.T, email, password string) string {
	t.Helper()

	url := fmt.Sprintf("%s/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=%s",
		h.emulatorURL, h.apiKey)
	body := map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	}
	resp := h.emulatorPost(t, url, body)
	return resp["idToken"].(string)
}

// emulatorPost is a helper that posts JSON to the Firebase Auth Emulator REST API.
func (h *testHarness) emulatorPost(t *testing.T, url string, body map[string]any) map[string]any {
	t.Helper()

	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal emulator request: %v", err)
	}
	resp, err := http.Post(url, "application/json", bytes.NewReader(data)) //nolint:noctx
	if err != nil {
		t.Fatalf("emulator POST %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("emulator POST %s: status %d, body: %s", url, resp.StatusCode, respBody)
	}
	var result map[string]any
	if err := json.Unmarshal(respBody, &result); err != nil {
		t.Fatalf("decode emulator response: %v (body: %s)", err, respBody)
	}
	return result
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
