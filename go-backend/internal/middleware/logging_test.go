package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
)

func TestLogger(t *testing.T) {
	t.Run("logs request with all fields", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test/path", nil)
		// Add request ID to context (simulating chi middleware.RequestID)
		ctx := context.WithValue(req.Context(), middleware.RequestIDKey, "test-request-id")
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		// Parse the JSON log output
		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v\nLog: %s", err, buf.String())
		}

		// Verify required fields
		if logEntry["method"] != "GET" {
			t.Errorf("method = %v, want GET", logEntry["method"])
		}
		if logEntry["path"] != "/test/path" {
			t.Errorf("path = %v, want /test/path", logEntry["path"])
		}
		if logEntry["status"] != float64(200) {
			t.Errorf("status = %v, want 200", logEntry["status"])
		}
		if logEntry["request_id"] != "test-request-id" {
			t.Errorf("request_id = %v, want test-request-id", logEntry["request_id"])
		}
		if _, ok := logEntry["duration_ms"]; !ok {
			t.Error("duration_ms field missing")
		}
		// Verify duration_ms is a number
		if _, ok := logEntry["duration_ms"].(float64); !ok {
			t.Errorf("duration_ms = %T, want float64", logEntry["duration_ms"])
		}
	})

	t.Run("logs different status codes", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))

		req := httptest.NewRequest(http.MethodPost, "/missing", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["method"] != "POST" {
			t.Errorf("method = %v, want POST", logEntry["method"])
		}
		if logEntry["status"] != float64(404) {
			t.Errorf("status = %v, want 404", logEntry["status"])
		}
	})

	t.Run("handles missing request ID", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/no-id", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		// request_id should be empty string when not set
		if logEntry["request_id"] != "" {
			t.Errorf("request_id = %v, want empty string", logEntry["request_id"])
		}
	})

	t.Run("captures status from WriteHeader", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte("created"))
		}))

		req := httptest.NewRequest(http.MethodPost, "/create", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["status"] != float64(201) {
			t.Errorf("status = %v, want 201", logEntry["status"])
		}
	})

	t.Run("defaults to 200 when no WriteHeader called", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("ok"))
		}))

		req := httptest.NewRequest(http.MethodGet, "/default", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["status"] != float64(200) {
			t.Errorf("status = %v, want 200 (default)", logEntry["status"])
		}
	})
}
