// Package httplog provides shared HTTP logging middleware.
package httplog

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"

	"github.com/jdelfino/eval/pkg/httpmiddleware"
)

// AttrFunc returns additional slog attributes for a request.
type AttrFunc func(r *http.Request) []slog.Attr

// Logger returns middleware that logs HTTP requests using structured logging.
// It logs the request method, path, status code, duration in milliseconds,
// and request ID (from chi's middleware.RequestID context).
// Optional AttrFunc values can enrich log entries with extra attributes.
func Logger(logger *slog.Logger, attrFuncs ...AttrFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			wrapped := httpmiddleware.NewResponseWriter(w)
			next.ServeHTTP(wrapped, r)

			requestID := middleware.GetReqID(r.Context())
			duration := time.Since(start)

			attrs := []slog.Attr{
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", wrapped.Status),
				slog.Float64("duration_ms", float64(duration.Nanoseconds())/1e6),
				slog.String("request_id", requestID),
			}

			for _, fn := range attrFuncs {
				attrs = append(attrs, fn(r)...)
			}

			level := slog.LevelInfo
			if wrapped.Status >= 500 {
				level = slog.LevelError
				if wrapped.ErrorDetail != "" {
					attrs = append(attrs, slog.String("error", wrapped.ErrorDetail))
				}
			}

			logger.LogAttrs(r.Context(), level, "http request", attrs...)
		})
	}
}

// OTelMiddleware wraps the handler with OpenTelemetry HTTP instrumentation.
// Span names use "<METHOD> <route-pattern>" (e.g. "GET /api/v1/sessions/{id}")
// for meaningful span names in Cloud Trace, instead of the raw URL path.
// Health-check and metrics endpoints are excluded from tracing to reduce noise.
func OTelMiddleware(serverName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return otelhttp.NewHandler(next, serverName,
			otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
				routeCtx := chi.RouteContext(r.Context())
				if routeCtx != nil && routeCtx.RoutePattern() != "" {
					return r.Method + " " + routeCtx.RoutePattern()
				}
				return r.Method + " " + r.URL.Path
			}),
			otelhttp.WithFilter(func(r *http.Request) bool {
				// Skip tracing for health and metrics endpoints to reduce noise.
				return r.URL.Path != "/ping" && r.URL.Path != "/healthz" &&
					r.URL.Path != "/readyz" && r.URL.Path != "/metrics"
			}),
			otelhttp.WithPropagators(
				propagation.NewCompositeTextMapPropagator(
					propagation.TraceContext{},
					propagation.Baggage{},
				),
			),
		)
	}
}

// TraceAttrFunc returns an AttrFunc that adds Cloud Logging trace-correlation
// fields to log entries when an active OTel span is present in the request
// context. The GCP projectID is embedded in the trace resource name.
//
// Cloud Logging fields added:
//   - logging.googleapis.com/trace     — "projects/{projectID}/traces/{traceID}"
//   - logging.googleapis.com/spanId    — span ID hex string
//   - logging.googleapis.com/trace_sampled — whether the span is sampled
//
// When no active span is found (tracing disabled or no SDK configured), the
// function returns nil attributes so the log entry is unchanged.
func TraceAttrFunc(projectID string) AttrFunc {
	return func(r *http.Request) []slog.Attr {
		span := trace.SpanFromContext(r.Context())
		sc := span.SpanContext()
		if !sc.IsValid() {
			return nil
		}

		traceID := sc.TraceID().String()
		spanID := sc.SpanID().String()
		sampled := sc.IsSampled()

		return []slog.Attr{
			slog.String("logging.googleapis.com/trace",
				fmt.Sprintf("projects/%s/traces/%s", projectID, traceID)),
			slog.String("logging.googleapis.com/spanId", spanID),
			slog.Bool("logging.googleapis.com/trace_sampled", sampled),
		}
	}
}
