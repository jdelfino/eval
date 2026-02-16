package middleware

import (
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// UserKey extracts the authenticated user's ID as the rate-limiting key.
// Returns "" if no user is present in the context (which skips rate limiting).
func UserKey(r *http.Request) string {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		return ""
	}
	return user.ID.String()
}

// IPKey extracts the remote address as the rate-limiting key.
func IPKey(r *http.Request) string {
	return r.RemoteAddr
}

// ForCategory returns a Chi middleware that enforces rate limiting for a given
// category using the provided limiter and key extraction function.
//
// This delegates to the shared httpmiddleware.ForCategory implementation,
// binding the go-backend's structured logger.
func ForCategory(limiter ratelimit.Limiter, cat string, keyFn httpmiddleware.KeyFunc) func(http.Handler) http.Handler {
	return httpmiddleware.ForCategory(limiter, cat, keyFn, slog.Default())
}
