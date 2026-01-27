// Package httplog provides shared HTTP logging middleware.
package httplog

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w}
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.wroteHeader {
		rw.status = code
		rw.wroteHeader = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

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

			wrapped := newResponseWriter(w)
			next.ServeHTTP(wrapped, r)

			requestID := middleware.GetReqID(r.Context())
			duration := time.Since(start)

			attrs := []slog.Attr{
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", wrapped.status),
				slog.Float64("duration_ms", float64(duration.Nanoseconds())/1e6),
				slog.String("request_id", requestID),
			}

			for _, fn := range attrFuncs {
				attrs = append(attrs, fn(r)...)
			}

			logger.LogAttrs(r.Context(), slog.LevelInfo, "http request", attrs...)
		})
	}
}
