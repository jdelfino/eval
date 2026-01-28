// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/pkg/httplog"
)

// Logger returns a middleware that logs HTTP requests using structured logging.
// It logs the request method, path, status code, duration in milliseconds,
// and request ID (from chi's middleware.RequestID context).
// Authenticated requests also include the user_id.
func Logger(logger *slog.Logger) func(next http.Handler) http.Handler {
	return httplog.Logger(logger, userIDAttr)
}

// userIDAttr enriches log entries with the authenticated user's ID.
func userIDAttr(r *http.Request) []slog.Attr {
	if user := auth.UserFromContext(r.Context()); user != nil {
		return []slog.Attr{slog.String("user_id", user.ID.String())}
	}
	return nil
}
