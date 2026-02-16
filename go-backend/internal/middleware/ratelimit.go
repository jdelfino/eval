package middleware

import (
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// KeyFunc extracts the rate-limiting key from a request.
type KeyFunc func(r *http.Request) string

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
// When keyFn returns "" (e.g. no authenticated user), the request is passed
// through without rate limiting. When the limiter returns an error with a nil
// result, the request is allowed through and the error is logged.
func ForCategory(limiter ratelimit.Limiter, cat string, keyFn KeyFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFn(r)
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			result, err := limiter.Allow(r.Context(), cat, key)
			if err != nil {
				// Both primary and fallback limiter failed — allow the request
				// and log the error rather than blocking users.
				slog.Warn("rate limiter error, allowing request",
					"error", err,
					"category", cat,
					"key", key,
				)
				next.ServeHTTP(w, r)
				return
			}

			if result == nil {
				// Defensive: nil result without error should not happen,
				// but allow the request rather than panicking.
				slog.Warn("rate limiter returned nil result, allowing request",
					"category", cat,
					"key", key,
				)
				next.ServeHTTP(w, r)
				return
			}

			// Set rate limit headers on all responses.
			w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", result.Remaining))

			if !result.Allowed {
				retryAfter := int(math.Ceil(time.Until(result.ResetAt).Seconds()))
				if retryAfter < 1 {
					retryAfter = 1
				}
				w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
				writeJSONError(w, r, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
