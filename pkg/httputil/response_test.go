package httputil

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]string{"message": "hello"}

	WriteJSON(rr, http.StatusOK, data)

	if rr.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusOK)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["message"] != "hello" {
		t.Errorf("message = %q, want %q", resp["message"], "hello")
	}
}

func TestWriteJSON_CustomStatus(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]string{"status": "created"}

	WriteJSON(rr, http.StatusCreated, data)

	if rr.Code != http.StatusCreated {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusCreated)
	}
}

func TestWriteError(t *testing.T) {
	rr := httptest.NewRecorder()

	WriteError(rr, http.StatusBadRequest, "something went wrong")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusBadRequest)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "something went wrong" {
		t.Errorf("error = %q, want %q", resp["error"], "something went wrong")
	}
}

func TestWriteError_NotFound(t *testing.T) {
	rr := httptest.NewRecorder()

	WriteError(rr, http.StatusNotFound, "resource not found")

	if rr.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusNotFound)
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "resource not found" {
		t.Errorf("error = %q, want %q", resp["error"], "resource not found")
	}
}

func TestWriteInternalError(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	testErr := errors.New("database connection failed")

	WriteInternalError(rr, req, testErr, "internal error")

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "internal error" {
		t.Errorf("error = %q, want %q", resp["error"], "internal error")
	}
}

// mockErrorDetailSetter captures SetErrorDetail calls for testing.
type mockErrorDetailSetter struct {
	httptest.ResponseRecorder
	detail string
}

func (m *mockErrorDetailSetter) SetErrorDetail(detail string) {
	m.detail = detail
}

func TestWriteError_5xx_SetsErrorDetail(t *testing.T) {
	mock := &mockErrorDetailSetter{ResponseRecorder: *httptest.NewRecorder()}

	WriteError(mock, http.StatusInternalServerError, "db connection lost")

	if mock.detail != "db connection lost" {
		t.Errorf("ErrorDetail = %q, want %q", mock.detail, "db connection lost")
	}
}

func TestWriteError_4xx_DoesNotSetErrorDetail(t *testing.T) {
	mock := &mockErrorDetailSetter{ResponseRecorder: *httptest.NewRecorder()}

	WriteError(mock, http.StatusBadRequest, "bad input")

	if mock.detail != "" {
		t.Errorf("ErrorDetail = %q, want empty for 4xx", mock.detail)
	}
}

func TestHealthz(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	Healthz(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusOK)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("status = %q, want %q", resp["status"], "ok")
	}
}
