package httplog

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
		ctx := context.WithValue(req.Context(), middleware.RequestIDKey, "test-request-id")
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v\nLog: %s", err, buf.String())
		}

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

		if logEntry["request_id"] != "" {
			t.Errorf("request_id = %v, want empty string", logEntry["request_id"])
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

	t.Run("calls AttrFunc to enrich log", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		enricher := func(r *http.Request) []slog.Attr {
			return []slog.Attr{slog.String("custom_key", "custom_value")}
		}

		handler := Logger(logger, enricher)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/enriched", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["custom_key"] != "custom_value" {
			t.Errorf("custom_key = %v, want custom_value", logEntry["custom_key"])
		}
	})

	t.Run("AttrFunc returning nil attrs is safe", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger, func(r *http.Request) []slog.Attr {
			return nil
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/nil-attrs", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["status"] != float64(200) {
			t.Errorf("status = %v, want 200", logEntry["status"])
		}
	})
}

func TestResponseWriterCapturesStatus(t *testing.T) {
	rw := newResponseWriter(httptest.NewRecorder())
	rw.WriteHeader(http.StatusNotFound)

	if rw.status != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rw.status, http.StatusNotFound)
	}

	// Second call should not change status
	rw.WriteHeader(http.StatusOK)
	if rw.status != http.StatusNotFound {
		t.Errorf("status changed to %d after second WriteHeader", rw.status)
	}
}

func TestResponseWriterDefaultStatus(t *testing.T) {
	rw := newResponseWriter(httptest.NewRecorder())
	_, _ = rw.Write([]byte("hello"))

	if rw.status != http.StatusOK {
		t.Errorf("status = %d, want %d", rw.status, http.StatusOK)
	}
}
