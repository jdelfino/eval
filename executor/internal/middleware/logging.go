// Package middleware provides HTTP middleware for the executor service.
package middleware

import (
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/pkg/httplog"
)

// Logger returns a middleware that logs HTTP requests using structured logging.
func Logger(logger *slog.Logger) func(next http.Handler) http.Handler {
	return httplog.Logger(logger)
}
