// Package httplog provides shared HTTP logging middleware.
package httplog

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

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
