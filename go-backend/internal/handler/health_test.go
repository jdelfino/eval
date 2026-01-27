package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jdelfino/eval/internal/db"
)

func TestHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()

	Healthz(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Healthz returned status %d, want %d", rr.Code, http.StatusOK)
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp["status"] != "ok" {
		t.Errorf("Healthz returned status %q, want %q", resp["status"], "ok")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Healthz returned Content-Type %q, want %q", contentType, "application/json")
	}
}

func TestReadyz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()

	Readyz(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Readyz returned status %d, want %d", rr.Code, http.StatusOK)
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp["status"] != "ok" {
		t.Errorf("Readyz returned status %q, want %q", resp["status"], "ok")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Readyz returned Content-Type %q, want %q", contentType, "application/json")
	}
}

// mockHealthChecker is a mock implementation of HealthChecker for testing.
type mockHealthChecker struct {
	status db.HealthStatus
}

func (m *mockHealthChecker) Health(_ context.Context) db.HealthStatus {
	return m.status
}

func TestReadyzHandler_HealthyDatabase(t *testing.T) {
	mock := &mockHealthChecker{
		status: db.HealthStatus{
			Healthy:    true,
			TotalConns: 5,
			IdleConns:  3,
			Message:    "OK",
		},
	}

	handler := NewReadyzHandler(mock)
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("ReadyzHandler returned status %d, want %d", rr.Code, http.StatusOK)
	}

	var resp readyzResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("ReadyzHandler returned status %q, want %q", resp.Status, "ok")
	}

	if !resp.Checks.Database.Healthy {
		t.Error("ReadyzHandler returned database healthy=false, want true")
	}

	if resp.Checks.Database.TotalConns != 5 {
		t.Errorf("ReadyzHandler returned total_conns=%d, want 5", resp.Checks.Database.TotalConns)
	}

	if resp.Checks.Database.IdleConns != 3 {
		t.Errorf("ReadyzHandler returned idle_conns=%d, want 3", resp.Checks.Database.IdleConns)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("ReadyzHandler returned Content-Type %q, want %q", contentType, "application/json")
	}
}

func TestReadyzHandler_UnhealthyDatabase(t *testing.T) {
	mock := &mockHealthChecker{
		status: db.HealthStatus{
			Healthy:    false,
			TotalConns: 0,
			IdleConns:  0,
			Message:    "ping failed: connection refused",
		},
	}

	handler := NewReadyzHandler(mock)
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("ReadyzHandler returned status %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	var resp readyzResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Status != "unhealthy" {
		t.Errorf("ReadyzHandler returned status %q, want %q", resp.Status, "unhealthy")
	}

	if resp.Checks.Database.Healthy {
		t.Error("ReadyzHandler returned database healthy=true, want false")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("ReadyzHandler returned Content-Type %q, want %q", contentType, "application/json")
	}
}
