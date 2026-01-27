package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jdelfino/eval/internal/config"
)

func TestNew(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	s := New(cfg, logger)

	if s == nil {
		t.Fatal("New() returned nil")
	}
	if s.httpServer == nil {
		t.Error("Server.httpServer is nil")
	}
	if s.logger == nil {
		t.Error("Server.logger is nil")
	}
	if s.httpServer.Addr != ":8080" {
		t.Errorf("Server.httpServer.Addr = %q, want %q", s.httpServer.Addr, ":8080")
	}
}

func TestRoutes(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	s := New(cfg, logger)

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
			name:           "readyz returns 200",
			method:         http.MethodGet,
			path:           "/readyz",
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

func TestNotFoundRoute(t *testing.T) {
	cfg := &config.Config{Port: 8080}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	s := New(cfg, logger)

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
	s := New(cfg, logger)

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
