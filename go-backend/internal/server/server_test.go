package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/config"
	"github.com/jdelfino/eval/internal/db"
	"github.com/jdelfino/eval/internal/store"
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

	s := New(cfg, logger, pool, nil)

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
	s := New(cfg, logger, pool, nil)

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
					Checks struct {
						Database struct {
							Healthy bool `json:"healthy"`
						} `json:"database"`
					} `json:"checks"`
				}
				if err := json.Unmarshal(body, &resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if resp.Status != "ok" {
					t.Errorf("status = %q, want %q", resp.Status, "ok")
				}
				if !resp.Checks.Database.Healthy {
					t.Error("expected database check to be healthy")
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
	s := New(cfg, logger, pool, nil)

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

func TestNotFoundRoute(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	s := New(cfg, logger, pool, nil)

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
	s := New(cfg, logger, pool, nil)

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

func TestNewWithUserRepo_BuildsWithoutError(t *testing.T) {
	// Verify that server construction works when a UserRepository is provided.
	// This exercises the auth middleware wiring path (JWKS provider, validator, adapter).
	cfg := &config.Config{Port: 8080, GCPProjectID: "test-project"}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := &mockPool{healthStatus: db.HealthStatus{Healthy: true, Message: "OK"}}
	repo := &stubUserRepo{}

	s := New(cfg, logger, pool, repo)

	if s == nil {
		t.Fatal("New() returned nil when userRepo is provided")
	}
}

// stubUserRepo is a minimal store.UserRepository for server_test.
type stubUserRepo struct{}

func (s *stubUserRepo) GetUserByID(_ context.Context, _ uuid.UUID) (*store.User, error) {
	return nil, errors.New("not implemented")
}

func (s *stubUserRepo) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return nil, errors.New("not implemented")
}
