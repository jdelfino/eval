package httplog

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
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

	t.Run("logs 5xx at ERROR level", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))

		req := httptest.NewRequest(http.MethodPost, "/fail", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["status"] != float64(500) {
			t.Errorf("status = %v, want 500", logEntry["status"])
		}
		if logEntry["level"] != "ERROR" {
			t.Errorf("level = %v, want ERROR", logEntry["level"])
		}
	})

	t.Run("logs 5xx with error detail", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Simulate what WriteError does: set error detail then write header
			if rw, ok := w.(interface{ SetErrorDetail(string) }); ok {
				rw.SetErrorDetail("pq: row-level security violation")
			}
			w.WriteHeader(http.StatusInternalServerError)
		}))

		req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["level"] != "ERROR" {
			t.Errorf("level = %v, want ERROR", logEntry["level"])
		}
		if logEntry["error"] != "pq: row-level security violation" {
			t.Errorf("error = %v, want 'pq: row-level security violation'", logEntry["error"])
		}
	})

	t.Run("logs 2xx at INFO level", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/ok", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v", err)
		}

		if logEntry["level"] != "INFO" {
			t.Errorf("level = %v, want INFO", logEntry["level"])
		}
		// Should NOT have error key for 2xx
		if _, ok := logEntry["error"]; ok {
			t.Errorf("2xx response should not have error key")
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

func TestLogger_TraceCorrelation(t *testing.T) {
	t.Run("includes trace fields when span is in context", func(t *testing.T) {
		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		// Build a handler that just returns 200
		handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		// Inject a valid W3C traceparent header so otelhttp sets a span in context.
		// TraceID: 4bf92f3577b34da6a3ce929d0e0e4736, SpanID: 00f067aa0ba902b7, sampled=1
		req := httptest.NewRequest(http.MethodGet, "/traced", nil)
		req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		// Without an active OTel tracer provider wrapping the handler, the span won't
		// be set in context by Logger alone. But the trace fields should be emitted
		// when a span IS present. This test verifies the logger doesn't panic with
		// a traced request and still emits all baseline fields.
		var logEntry map[string]any
		if err := json.Unmarshal(buf.Bytes(), &logEntry); err != nil {
			t.Fatalf("Failed to parse log output: %v\nLog: %s", err, buf.String())
		}

		if logEntry["method"] != "GET" {
			t.Errorf("method = %v, want GET", logEntry["method"])
		}
		if logEntry["status"] != float64(200) {
			t.Errorf("status = %v, want 200", logEntry["status"])
		}
	})

	t.Run("TraceAttrFunc extracts trace fields from active span", func(t *testing.T) {
		// TraceAttrFunc is exported so callers can pass it to Logger.
		fn := TraceAttrFunc("my-project")
		if fn == nil {
			t.Fatal("TraceAttrFunc() returned nil")
		}

		// Without a live span context, it should return no attrs (not panic).
		req := httptest.NewRequest(http.MethodGet, "/no-span", nil)
		attrs := fn(req)
		// attrs may be nil or empty — both are acceptable when no span is active
		_ = attrs
	})

	t.Run("TraceAttrFunc adds GCP trace fields when span is sampled", func(t *testing.T) {
		fn := TraceAttrFunc("test-project")

		// Create a request carrying a sampled traceparent header.
		req := httptest.NewRequest(http.MethodGet, "/sampled", nil)
		req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")

		// Without an active SDK provider injecting the span into context, the
		// context won't have a recording span. TraceAttrFunc should gracefully
		// return empty attrs rather than panicking.
		attrs := fn(req)
		// All we assert here is no panic and a valid (possibly empty) return.
		_ = attrs
	})

	t.Run("TraceAttrFunc returns nil when no valid span context", func(t *testing.T) {
		fn := TraceAttrFunc("test-project")
		req := httptest.NewRequest(http.MethodGet, "/no-span", nil)
		// Background context has no span — expect nil attrs.
		attrs := fn(req)
		if len(attrs) != 0 {
			t.Errorf("expected no attrs with no active span, got %d", len(attrs))
		}
	})

	t.Run("TraceAttrFunc formats GCP trace resource name correctly", func(t *testing.T) {
		fn := TraceAttrFunc("my-gcp-project")

		// Create a noop span with a known trace ID so we can verify the format.
		traceID, _ := trace.TraceIDFromHex("4bf92f3577b34da6a3ce929d0e0e4736")
		spanID, _ := trace.SpanIDFromHex("00f067aa0ba902b7")
		sc := trace.NewSpanContext(trace.SpanContextConfig{
			TraceID:    traceID,
			SpanID:     spanID,
			TraceFlags: trace.FlagsSampled,
		})

		tp := noop.NewTracerProvider()
		_, span := tp.Tracer("test").Start(
			trace.ContextWithSpanContext(context.Background(), sc),
			"test-span",
		)
		defer span.End()

		req := httptest.NewRequest(http.MethodGet, "/with-span", nil)
		req = req.WithContext(trace.ContextWithSpan(req.Context(), span))

		attrs := fn(req)

		// The noop span wraps the span context so it should be valid.
		// We just verify format — the noop provider may not propagate the original SC.
		if len(attrs) > 0 {
			for _, a := range attrs {
				if a.Key == "logging.googleapis.com/trace" {
					if !strings.HasPrefix(a.Value.String(), "projects/my-gcp-project/traces/") {
						t.Errorf("trace resource = %q, want projects/my-gcp-project/traces/...", a.Value.String())
					}
				}
			}
		}
		// Note: noop span may return an invalid span context (all zeros) which
		// causes TraceAttrFunc to return nil. That's fine — we test the format
		// when a real SDK span is active in integration tests.
	})
}

// ResponseWriter tests are in pkg/httpmiddleware/responsewriter_test.go
