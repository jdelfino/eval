package handler

import (
	"bytes"
	"encoding/json"
	"log/slog"
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

func TestClientErrorHandler_Report_SeverityMappedToLogLevel(t *testing.T) {
	tests := []struct {
		name          string
		severity      string
		expectedLevel slog.Level
	}{
		{"error severity logs at ERROR", "error", slog.LevelError},
		{"warning severity logs at WARN", "warning", slog.LevelWarn},
		{"info severity logs at INFO", "info", slog.LevelInfo},
		{"empty severity defaults to ERROR", "", slog.LevelError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logBuf bytes.Buffer
			testLogger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{
				Level: slog.LevelDebug,
			}))

			h := NewClientErrorHandlerWithLogger(testLogger)

			body := map[string]any{
				"message": "Test error",
			}
			if tt.severity != "" {
				body["severity"] = tt.severity
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
			h.Report(rr, req)

			if rr.Code != http.StatusNoContent {
				t.Fatalf("Report() status = %d, want %d", rr.Code, http.StatusNoContent)
			}

			var logEntry map[string]any
			if err := json.Unmarshal(logBuf.Bytes(), &logEntry); err != nil {
				t.Fatalf("failed to parse log entry: %v (raw: %s)", err, logBuf.String())
			}

			// Verify no explicit "severity" attribute in the log (no duplicate key)
			// The log level should be derived from slog's level key
			if _, hasSeverityAttr := logEntry["severity"]; hasSeverityAttr {
				t.Errorf("log entry should not have explicit 'severity' attribute (causes duplicate key in Cloud Logging)")
			}

			// Verify the log level matches the expected level
			gotLevel, ok := logEntry["level"].(string)
			if !ok {
				t.Fatalf("log entry missing 'level' field: %v", logEntry)
			}
			wantLevel := tt.expectedLevel.String()
			if gotLevel != wantLevel {
				t.Errorf("log level = %q, want %q for severity %q", gotLevel, wantLevel, tt.severity)
			}
		})
	}
}

func TestClientErrorHandler_Report_NoAuthContext(t *testing.T) {
	handler := NewClientErrorHandler()

	body := map[string]any{
		"message":  "Firebase sign-in failed: auth/tenant-id-mismatch",
		"severity": "error",
		"context": map[string]string{
			"type":     "firebase_sign_in",
			"provider": "google",
		},
	}
	b, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	// No auth.WithUser or store.WithRepos — simulates unauthenticated request (sign-in failure)

	rr := httptest.NewRecorder()
	handler.Report(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("Report() status = %d, want %d (handler must work without auth context)", rr.Code, http.StatusNoContent)
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
