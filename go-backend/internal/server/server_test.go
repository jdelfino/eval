package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/jdelfino/eval/go-backend/internal/config"
	"github.com/jdelfino/eval/go-backend/internal/db"
)

// mockPool implements DatabasePool for testing
type mockPool struct {
	healthStatus db.HealthStatus
}

func (m *mockPool) Health(ctx context.Context) db.HealthStatus {
	return m.healthStatus
}

// PgxPool returns nil in tests (no real database connection needed)
func (m *mockPool) PgxPool() *pgxpool.Pool {
	return nil
}

func TestNew(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}

	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	if s == nil {
		t.Fatal("New() returned nil")
	}
	if s.httpServer == nil {
		t.Error("Server.httpServer is nil")
	}
	if s.logger == nil {
		t.Error("Server.logger is nil")
	}
	if s.pool == nil {
		t.Error("Server.pool is nil")
	}
	if s.httpServer.Addr != ":8080" {
		t.Errorf("Server.httpServer.Addr = %q, want %q", s.httpServer.Addr, ":8080")
	}
}

func TestRoutes(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	tests := []struct {
		name           string
		method         string
		path           string
		wantStatusCode int
		checkBody      func(t *testing.T, body []byte)
	}{
		{
			name:           "healthz returns 200",
			method:         http.MethodGet,
			path:           "/healthz",
			wantStatusCode: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				var resp map[string]string
				if err := json.Unmarshal(body, &resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if resp["status"] != "ok" {
					t.Errorf("status = %q, want %q", resp["status"], "ok")
				}
			},
		},
		{
			name:           "readyz returns 200 with healthy pool",
			method:         http.MethodGet,
			path:           "/readyz",
			wantStatusCode: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				var resp struct {
					Status string `json:"status"`
				}
				if err := json.Unmarshal(body, &resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if resp.Status != "ok" {
					t.Errorf("status = %q, want %q", resp.Status, "ok")
				}
			},
		},
		{
			name:           "ping returns 200",
			method:         http.MethodGet,
			path:           "/ping",
			wantStatusCode: http.StatusOK,
			checkBody: func(t *testing.T, body []byte) {
				if string(body) != "." {
					t.Errorf("body = %q, want %q", string(body), ".")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rr := httptest.NewRecorder()

			s.httpServer.Handler.ServeHTTP(rr, req)

			if rr.Code != tt.wantStatusCode {
				t.Errorf("status code = %d, want %d", rr.Code, tt.wantStatusCode)
			}

			if tt.checkBody != nil {
				tt.checkBody(t, rr.Body.Bytes())
			}
		})
	}
}

func TestReadyzUnhealthyPool(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: false, Message: "connection failed"}}
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()

	s.httpServer.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	var resp struct {
		Status string `json:"status"`
		Checks struct {
			Database struct {
				Healthy bool `json:"healthy"`
			} `json:"database"`
		} `json:"checks"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp.Status != "unhealthy" {
		t.Errorf("status = %q, want %q", resp.Status, "unhealthy")
	}
	if resp.Checks.Database.Healthy {
		t.Error("expected database check to be unhealthy")
	}
}

func TestMetricsEndpoint(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	// Make a request to generate some metrics
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	s.httpServer.Handler.ServeHTTP(rr, req)

	// Now fetch /metrics
	req = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr = httptest.NewRecorder()
	s.httpServer.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "http_requests_total") {
		t.Error("/metrics response missing http_requests_total")
	}
	if !strings.Contains(body, "http_request_duration_seconds") {
		t.Error("/metrics response missing http_request_duration_seconds")
	}
}

func TestNotFoundRoute(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/nonexistent", nil)
	rr := httptest.NewRecorder()

	s.httpServer.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

func TestAPIRoutePrefix(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	// API v1 route prefix exists (even if no routes are registered yet)
	req := httptest.NewRequest(http.MethodGet, "/api/v1", nil)
	rr := httptest.NewRecorder()

	s.httpServer.Handler.ServeHTTP(rr, req)

	// Should return 404 since no routes are registered under /api/v1 yet
	// but this verifies the router handles the prefix
	if rr.Code != http.StatusNotFound {
		t.Errorf("status code = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

// TestClientErrorsPublicEndpoint verifies that POST /api/v1/client-errors
// is accessible without authentication (no JWT required).
// Before the fix, the route was behind JWT middleware and would return 401.
func TestClientErrorsPublicEndpoint(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	// userStore is nil so JWT/UserLoader middleware is skipped; the client-errors
	// route must still be reachable.
	s, err := NewWithRegistry(cfg, logger, pool, nil, prometheus.NewRegistry())
	if err != nil {
		t.Fatalf("NewWithRegistry() error: %v", err)
	}

	body := strings.NewReader(`{"message":"test error","severity":"error"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.httpServer.Handler.ServeHTTP(rr, req)

	// Should succeed with 204 No Content — no auth token needed.
	if rr.Code != http.StatusNoContent {
		t.Errorf("status code = %d, want %d (endpoint must be public)", rr.Code, http.StatusNoContent)
	}
}
