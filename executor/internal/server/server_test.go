package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"golang.org/x/time/rate"

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

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("status = %s, want ok", resp["status"])
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

func TestTraceRoute(t *testing.T) {
	srv := newTestServer(t)

	// POST with no body should get 400 (invalid JSON), proving the route is wired.
	req := httptest.NewRequest(http.MethodPost, "/trace", nil)
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

func TestRateLimitMiddleware_Rejects(t *testing.T) {
	// Limiter with burst=1, so the second request should be rejected.
	limiter := rate.NewLimiter(rate.Limit(1), 1)

	called := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})

	handler := rateLimitMiddleware(limiter, inner)

	// First request: allowed (consumes the burst token).
	req1 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec1 := httptest.NewRecorder()
	handler(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Errorf("first request: status = %d, want %d", rec1.Code, http.StatusOK)
	}

	// Second request: should be rate limited (no tokens left).
	req2 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec2 := httptest.NewRecorder()
	handler(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("second request: status = %d, want %d", rec2.Code, http.StatusTooManyRequests)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rec2.Body).Decode(&errResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if errResp["error"] != "rate limit exceeded" {
		t.Errorf("error = %q, want %q", errResp["error"], "rate limit exceeded")
	}

	if called != 1 {
		t.Errorf("inner handler called %d times, want 1", called)
	}
}

func TestRateLimitDisabled_WhenRPSZero(t *testing.T) {
	cfg := &config.Config{
		Port:           8081,
		Environment:    "local",
		NsjailPath:     "/usr/bin/nsjail",
		PythonPath:     "/usr/bin/python3",
		RateLimitRPS:   0, // disabled
		RateLimitBurst: 100,
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	// Should still reach the execute handler (400 due to no body), not 429.
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/execute", nil)
		rec := httptest.NewRecorder()
		srv.httpServer.Handler.ServeHTTP(rec, req)

		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d: got 429 but rate limiting should be disabled", i)
		}
	}
}

func TestRateLimitEnabled_IntegrationWithServer(t *testing.T) {
	cfg := &config.Config{
		Port:           8081,
		Environment:    "local",
		NsjailPath:     "/usr/bin/nsjail",
		PythonPath:     "/usr/bin/python3",
		RateLimitRPS:   1,
		RateLimitBurst: 1,
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	// First request consumes the burst token.
	req1 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec1 := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec1, req1)

	// Could be 400 (bad request) since no body, but should NOT be 429.
	if rec1.Code == http.StatusTooManyRequests {
		t.Errorf("first request should not be rate limited, got 429")
	}

	// Second request should be rate limited.
	req2 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec2 := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("second request: status = %d, want %d", rec2.Code, http.StatusTooManyRequests)
	}
}

func TestDisableSandboxInLocalEnv(t *testing.T) {
	cfg := &config.Config{
		Port:           8081,
		Environment:    "local",
		DisableSandbox: true,
		NsjailPath:     "/usr/bin/nsjail",
		PythonPath:     "/usr/bin/python3",
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)
	if srv == nil {
		t.Fatal("expected non-nil server")
	}
}

func TestDisableSandboxInProdExits(t *testing.T) {
	// Use subprocess pattern to test os.Exit behavior.
	if os.Getenv("TEST_SANDBOX_PROD_GUARD") == "1" {
		cfg := &config.Config{
			Port:           8081,
			Environment:    "production",
			DisableSandbox: true,
			NsjailPath:     "/usr/bin/nsjail",
			PythonPath:     "/usr/bin/python3",
		}
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		reg := prometheus.NewRegistry()
		NewWithRegistry(cfg, logger, reg)
		return
	}

	cmd := exec.Command(os.Args[0], "-test.run=TestDisableSandboxInProdExits")
	cmd.Env = append(os.Environ(), "TEST_SANDBOX_PROD_GUARD=1")
	err := cmd.Run()
	if e, ok := err.(*exec.ExitError); ok && !e.Success() {
		return // expected: process exited with non-zero status
	}
	t.Fatal("expected process to exit with non-zero status when DISABLE_SANDBOX is set in production")
}
