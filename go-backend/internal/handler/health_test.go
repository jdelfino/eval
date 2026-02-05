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

	var resp healthResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("ReadyzHandler returned status %q, want %q", resp.Status, "ok")
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

	var resp healthResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Status != "unhealthy" {
		t.Errorf("ReadyzHandler returned status %q, want %q", resp.Status, "unhealthy")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("ReadyzHandler returned Content-Type %q, want %q", contentType, "application/json")
	}
}

func TestReadyzHandler_VerboseHealthy(t *testing.T) {
	mock := &mockHealthChecker{
		status: db.HealthStatus{
			Healthy:    true,
			TotalConns: 5,
			IdleConns:  3,
			Message:    "OK",
		},
	}

	handler := NewReadyzHandler(mock)
	req := httptest.NewRequest(http.MethodGet, "/readyz?verbose", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("ReadyzHandler verbose returned status %d, want %d", rr.Code, http.StatusOK)
	}

	var resp verboseReadyzResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode verbose response: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("status = %q, want %q", resp.Status, "ok")
	}

	if resp.Components.Database.Status != "ok" {
		t.Errorf("database status = %q, want %q", resp.Components.Database.Status, "ok")
	}

	if resp.Components.Database.Connections.TotalConns != 5 {
		t.Errorf("total_conns = %d, want 5", resp.Components.Database.Connections.TotalConns)
	}

	if resp.Components.Database.Connections.IdleConns != 3 {
		t.Errorf("idle_conns = %d, want 3", resp.Components.Database.Connections.IdleConns)
	}
}

func TestReadyzHandler_VerboseUnhealthy(t *testing.T) {
	mock := &mockHealthChecker{
		status: db.HealthStatus{
			Healthy:    false,
			TotalConns: 0,
			IdleConns:  0,
			Message:    "ping failed",
		},
	}

	handler := NewReadyzHandler(mock)
	req := httptest.NewRequest(http.MethodGet, "/readyz?verbose", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("ReadyzHandler verbose returned status %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	var resp verboseReadyzResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode verbose response: %v", err)
	}

	if resp.Status != "unhealthy" {
		t.Errorf("status = %q, want %q", resp.Status, "unhealthy")
	}

	if resp.Components.Database.Status != "unhealthy" {
		t.Errorf("database status = %q, want %q", resp.Components.Database.Status, "unhealthy")
	}
}
