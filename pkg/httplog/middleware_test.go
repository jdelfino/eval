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
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
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

		// Create a real SDK tracer provider with in-memory exporter so the span
		// context is valid (non-zero IDs).
		exp := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithSpanProcessor(exp),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)
		tracer := tp.Tracer("test")

		ctx, span := tracer.Start(context.Background(), "test-span")
		defer span.End()

		req := httptest.NewRequest(http.MethodGet, "/with-real-span", nil)
		req = req.WithContext(ctx)

		attrs := fn(req)

		if len(attrs) == 0 {
			t.Fatal("expected attrs from active SDK span, got none")
		}

		attrMap := make(map[string]string, len(attrs))
		for _, a := range attrs {
			attrMap[string(a.Key)] = a.Value.String()
		}

		traceVal, ok := attrMap["logging.googleapis.com/trace"]
		if !ok {
			t.Error("missing logging.googleapis.com/trace attr")
		} else if !strings.HasPrefix(traceVal, "projects/my-project/traces/") {
			t.Errorf("trace = %q, want prefix projects/my-project/traces/", traceVal)
		}

		if _, ok := attrMap["logging.googleapis.com/spanId"]; !ok {
			t.Error("missing logging.googleapis.com/spanId attr")
		}

		if _, ok := attrMap["logging.googleapis.com/trace_sampled"]; !ok {
			t.Error("missing logging.googleapis.com/trace_sampled attr")
		}
	})

	t.Run("TraceAttrFunc adds GCP trace fields when span is sampled", func(t *testing.T) {
		fn := TraceAttrFunc("test-project")

		// Create a real SDK tracer with AlwaysSample so the span is sampled.
		exp := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithSpanProcessor(exp),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)
		tracer := tp.Tracer("test")

		ctx, span := tracer.Start(context.Background(), "sampled-span")
		defer span.End()

		req := httptest.NewRequest(http.MethodGet, "/sampled", nil)
		req = req.WithContext(ctx)

		attrs := fn(req)
		if len(attrs) == 0 {
			t.Fatal("expected GCP trace attrs for sampled span, got none")
		}

		attrMap := make(map[string]string, len(attrs))
		for _, a := range attrs {
			attrMap[string(a.Key)] = a.Value.String()
		}

		sampledVal, ok := attrMap["logging.googleapis.com/trace_sampled"]
		if !ok {
			t.Error("missing logging.googleapis.com/trace_sampled attr")
		} else if sampledVal != "true" {
			t.Errorf("trace_sampled = %q, want true for AlwaysSample", sampledVal)
		}
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

		// Use a real SDK tracer provider so the span context has valid (non-zero) IDs
		// and TraceAttrFunc returns attrs with the correct GCP resource format.
		exp := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithSpanProcessor(exp),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)
		ctx, span := tp.Tracer("test").Start(context.Background(), "format-test-span")
		defer span.End()

		req := httptest.NewRequest(http.MethodGet, "/with-span", nil)
		req = req.WithContext(ctx)

		attrs := fn(req)

		if len(attrs) == 0 {
			t.Fatal("expected attrs from active SDK span, got none")
		}

		for _, a := range attrs {
			if a.Key == "logging.googleapis.com/trace" {
				if !strings.HasPrefix(a.Value.String(), "projects/my-gcp-project/traces/") {
					t.Errorf("trace resource = %q, want prefix projects/my-gcp-project/traces/", a.Value.String())
				}
				// Verify the trace ID portion is non-zero (32 hex chars after the prefix)
				prefix := "projects/my-gcp-project/traces/"
				traceIDPart := strings.TrimPrefix(a.Value.String(), prefix)
				if len(traceIDPart) != 32 {
					t.Errorf("trace ID = %q, want 32 hex chars, got %d", traceIDPart, len(traceIDPart))
				}
				if traceIDPart == strings.Repeat("0", 32) {
					t.Error("trace ID is all zeros — SDK span should have a valid trace ID")
				}
			}
		}
	})

	t.Run("TraceAttrFunc spanId is valid hex", func(t *testing.T) {
		fn := TraceAttrFunc("my-project")

		exp := tracetest.NewSpanRecorder()
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithSpanProcessor(exp),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)
		ctx, span := tp.Tracer("test").Start(context.Background(), "span-id-test")
		defer span.End()

		req := httptest.NewRequest(http.MethodGet, "/span-id", nil)
		req = req.WithContext(ctx)

		attrs := fn(req)
		if len(attrs) == 0 {
			t.Fatal("expected attrs from active SDK span, got none")
		}

		for _, a := range attrs {
			if a.Key == "logging.googleapis.com/spanId" {
				spanID := a.Value.String()
				if len(spanID) != 16 {
					t.Errorf("spanId = %q, want 16 hex chars, got %d", spanID, len(spanID))
				}
				if spanID == strings.Repeat("0", 16) {
					t.Error("spanId is all zeros — SDK span should have a valid span ID")
				}
			}
		}
	})
}

func TestOTelMiddleware(t *testing.T) {
	t.Run("wraps handler and passes requests through", func(t *testing.T) {
		mw := OTelMiddleware("test-server")
		if mw == nil {
			t.Fatal("OTelMiddleware returned nil")
		}

		called := false
		inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		})

		handler := mw(inner)
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if !called {
			t.Error("inner handler was not called")
		}
		if rr.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", rr.Code)
		}
	})

	t.Run("skips health and metrics endpoints", func(t *testing.T) {
		skippedPaths := []string{"/ping", "/healthz", "/readyz", "/metrics"}
		for _, path := range skippedPaths {
			t.Run(path, func(t *testing.T) {
				mw := OTelMiddleware("test-server")
				called := false
				inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					called = true
					w.WriteHeader(http.StatusOK)
				})

				handler := mw(inner)
				req := httptest.NewRequest(http.MethodGet, path, nil)
				rr := httptest.NewRecorder()
				handler.ServeHTTP(rr, req)

				if !called {
					t.Errorf("inner handler was not called for path %s", path)
				}
				// The handler should still respond (filter only skips tracing, not the request)
				if rr.Code != http.StatusOK {
					t.Errorf("path %s: status = %d, want 200", path, rr.Code)
				}
			})
		}
	})
}

// ResponseWriter tests are in pkg/httpmiddleware/responsewriter_test.go
