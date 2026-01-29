package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/pkg/httplog"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		LogLevel:    "info",
		NsjailPath:  "/usr/bin/nsjail",
		PythonPath:  "/usr/bin/python3",
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	return NewWithRegistry(cfg, logger, reg)
}

func TestHealthz(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %s, want ok", resp.Status)
	}
}

func TestReadyz_BinariesExist(t *testing.T) {
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		NsjailPath:  os.Args[0], // test binary itself
		PythonPath:  os.Args[0],
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %s, want ok", resp.Status)
	}
	if resp.Components["nsjail"] != "ok" {
		t.Errorf("nsjail component = %s, want ok", resp.Components["nsjail"])
	}
	if resp.Components["python"] != "ok" {
		t.Errorf("python component = %s, want ok", resp.Components["python"])
	}
}

func TestReadyz_BinariesMissing(t *testing.T) {
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		NsjailPath:  "/nonexistent/nsjail",
		PythonPath:  "/nonexistent/python3",
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}

	var resp readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Status != "unhealthy" {
		t.Errorf("status = %s, want unhealthy", resp.Status)
	}
	if resp.Components["nsjail"] != "unavailable" {
		t.Errorf("nsjail = %s, want unavailable", resp.Components["nsjail"])
	}
}

func TestExecuteRoute(t *testing.T) {
	srv := newTestServer(t)

	// POST with no body should get 400 (invalid JSON), proving the route is wired.
	req := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestMetrics(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestRecovererCatchesPanic(t *testing.T) {
	// Verify that the Recoverer middleware is in the chain and catches panics,
	// returning a 500 instead of crashing the server.
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	m := metrics.New(reg)
	httpMetrics := httpmiddleware.NewHTTPMetrics(reg)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(httplog.Logger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/ping"))
	r.Use(httpMetrics.Middleware)
	_ = m // metrics registered but not needed for this test

	r.Get("/panic", func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	rec := httptest.NewRecorder()

	// Should not panic; Recoverer should catch it and return 500.
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}
