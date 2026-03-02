package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

func TestClientErrorHandler_Report_Success(t *testing.T) {
	handler := NewClientErrorHandler()

	body := map[string]any{
		"message":    "TypeError: Cannot read property 'foo' of undefined",
		"stack":      "TypeError: Cannot read property 'foo' of undefined\n    at foo (app.js:10:5)",
		"url":        "https://example.com/sessions/123",
		"user_agent": "Mozilla/5.0",
		"severity":   "error",
	}
	b, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	user := &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleStudent,
	}
	req = req.WithContext(auth.WithUser(req.Context(), user))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("Report() status = %d, want %d", rr.Code, http.StatusNoContent)
	}
}

func TestClientErrorHandler_Report_MissingMessage(t *testing.T) {
	handler := NewClientErrorHandler()

	body := map[string]any{
		// message is required but omitted
		"url":      "https://example.com/page",
		"severity": "error",
	}
	b, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	user := &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleStudent,
	}
	req = req.WithContext(auth.WithUser(req.Context(), user))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Report() status = %d, want %d (validation should fail)", rr.Code, http.StatusUnprocessableEntity)
	}
}

func TestClientErrorHandler_Report_InvalidJSON(t *testing.T) {
	handler := NewClientErrorHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")

	user := &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleStudent,
	}
	req = req.WithContext(auth.WithUser(req.Context(), user))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Report() status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestClientErrorHandler_Report_WithContext(t *testing.T) {
	handler := NewClientErrorHandler()

	body := map[string]any{
		"message":  "ReferenceError: foo is not defined",
		"severity": "warning",
		"context": map[string]string{
			"component": "SessionView",
			"sessionId": "abc-123",
		},
	}
	b, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	user := &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	}
	req = req.WithContext(auth.WithUser(req.Context(), user))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("Report() status = %d, want %d", rr.Code, http.StatusNoContent)
	}
}

func TestClientErrorHandler_Report_MessageTooLong(t *testing.T) {
	handler := NewClientErrorHandler()

	// message with more than 10000 characters should fail validation
	longMessage := strings.Repeat("x", 10001)
	body := map[string]any{
		"message":  longMessage,
		"severity": "error",
	}
	b, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	user := &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleStudent,
	}
	req = req.WithContext(auth.WithUser(req.Context(), user))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Report() status = %d, want %d (message too long)", rr.Code, http.StatusUnprocessableEntity)
	}
}
