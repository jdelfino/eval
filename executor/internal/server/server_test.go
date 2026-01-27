package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jdelfino/eval/executor/internal/config"
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
	return New(cfg, logger)
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
	// Use binaries that exist on any system
	cfg := &config.Config{
		Port:        8081,
		Environment: "local",
		NsjailPath:  os.Args[0], // test binary itself
		PythonPath:  os.Args[0],
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	srv := New(cfg, logger)

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
	srv := New(cfg, logger)

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

func TestExecutePlaceholder(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodPost, "/execute", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotImplemented)
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
