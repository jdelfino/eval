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

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/pkg/httplog"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		LogLevel:    "info",
		NsjailPath:  "/usr/bin/nsjail",
		PythonPath:  "/usr/bin/python3",
		JavaPath:    "/usr/bin/java",
		JavacPath:   os.Args[0],
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
		JavaPath:    os.Args[0],
		JavacPath:   os.Args[0],
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
	if resp.Components["java"] != "ok" {
		t.Errorf("java component = %s, want ok", resp.Components["java"])
	}
	if resp.Components["javac"] != "ok" {
		t.Errorf("javac component = %s, want ok", resp.Components["javac"])
	}
}

func TestReadyz_JavaMissing_Unhealthy(t *testing.T) {
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		NsjailPath:  os.Args[0], // test binary itself — present
		PythonPath:  os.Args[0], // present
		JavaPath:    "/nonexistent/java",
		JavacPath:   os.Args[0], // javac present
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	// Missing java must make the service unhealthy (503).
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d (missing java must be unhealthy)", rec.Code, http.StatusServiceUnavailable)
	}

	var resp readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Status != "unhealthy" {
		t.Errorf("status = %s, want unhealthy", resp.Status)
	}
	if resp.Components["java"] != "unavailable" {
		t.Errorf("java = %s, want unavailable", resp.Components["java"])
	}
}

func TestReadyz_JavacMissing_Unhealthy(t *testing.T) {
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		NsjailPath:  os.Args[0], // present
		PythonPath:  os.Args[0], // present
		JavaPath:    os.Args[0], // java present
		JavacPath:   "/nonexistent/javac",
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	// Missing javac must make the service unhealthy (503).
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d (missing javac must be unhealthy)", rec.Code, http.StatusServiceUnavailable)
	}

	var resp readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Status != "unhealthy" {
		t.Errorf("status = %s, want unhealthy", resp.Status)
	}
	if resp.Components["javac"] != "unavailable" {
		t.Errorf("javac = %s, want unavailable", resp.Components["javac"])
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

func TestReadyz_DisableSandbox_SkipsNsjail(t *testing.T) {
	cfg := &config.Config{
		Port:           8081,
		Environment:    "local",
		DisableSandbox: true,
		NsjailPath:     "/nonexistent/nsjail", // missing — should not matter
		PythonPath:     os.Args[0],
		JavaPath:       os.Args[0],
		JavacPath:      os.Args[0],
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	reg := prometheus.NewRegistry()
	srv := NewWithRegistry(cfg, logger, reg)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (nsjail should be skipped when sandbox disabled)", rec.Code, http.StatusOK)
	}

	var resp readyResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Components["nsjail"] != "disabled" {
		t.Errorf("nsjail = %s, want disabled", resp.Components["nsjail"])
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
	// Use a memory limiter with a single-request category to test rejection.
	cats := map[string]ratelimit.Category{
		"execute": {Name: "execute", Algorithm: "sliding", Limit: 1, Window: 60_000_000_000}, // 1 per minute
	}
	limiter := ratelimit.NewMemoryLimiter(cats)
	limiter.Start()
	defer limiter.Stop()

	called := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mw := httpmiddleware.ForCategory(limiter, "execute", httpmiddleware.GlobalKey, logger)
	handler := mw(inner)

	// First request: allowed.
	req1 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Errorf("first request: status = %d, want %d", rec1.Code, http.StatusOK)
	}

	// Second request: should be rate limited.
	req2 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

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

func TestRateLimitMiddleware_SetsRetryAfterHeader(t *testing.T) {
	cats := map[string]ratelimit.Category{
		"execute": {Name: "execute", Algorithm: "sliding", Limit: 1, Window: 60_000_000_000}, // 1 per minute
	}
	limiter := ratelimit.NewMemoryLimiter(cats)
	limiter.Start()
	defer limiter.Stop()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mw := httpmiddleware.ForCategory(limiter, "execute", httpmiddleware.GlobalKey, logger)
	handler := mw(inner)

	// First request: consume the single token.
	req1 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	// Second request: should be rate limited with Retry-After header.
	req2 := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rec2.Code, http.StatusTooManyRequests)
	}

	retryAfter := rec2.Header().Get("Retry-After")
	if retryAfter == "" {
		t.Error("expected Retry-After header to be set on 429 response")
	}
}

func TestRateLimitMiddleware_AllowsOnError(t *testing.T) {
	// When the limiter returns an error, the request should be allowed through
	// (fail-open behavior).
	cats := map[string]ratelimit.Category{} // empty categories => unknown category error
	limiter := ratelimit.NewMemoryLimiter(cats)
	limiter.Start()
	defer limiter.Stop()

	called := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mw := httpmiddleware.ForCategory(limiter, "nonexistent", httpmiddleware.GlobalKey, logger)
	handler := mw(inner)

	req := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (should allow on limiter error)", rec.Code, http.StatusOK)
	}
	if called != 1 {
		t.Errorf("inner handler called %d times, want 1", called)
	}
}

func TestRateLimitAlwaysEnabled_IntegrationWithServer(t *testing.T) {
	// The executor uses the high-limit executorGlobal category (1000/min)
	// as defense-in-depth. Verify it still kicks in by using a custom
	// category map with a small limit for the integration test.
	cats := map[string]ratelimit.Category{
		"executorGlobal": {Name: "executorGlobal", Algorithm: "sliding", Limit: 2, Window: 60_000_000_000},
	}
	limiter := ratelimit.NewMemoryLimiter(cats)
	limiter.Start()
	defer limiter.Stop()

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mw := httpmiddleware.ForCategory(limiter, "executorGlobal", httpmiddleware.GlobalKey, logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest) // execute handler returns 400 for empty body
	})
	handler := mw(inner)

	// Send 3 requests — 2 should pass, 3rd should be rate limited.
	var lastCode int
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/execute", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		lastCode = rec.Code
	}

	if lastCode != http.StatusTooManyRequests {
		t.Errorf("expected 429 after exceeding limit, got %d", lastCode)
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
