package httpmiddleware

import (
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/jdelfino/eval/pkg/httputil"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// KeyFunc extracts the rate-limiting key from a request.
// Returning "" skips rate limiting for the request.
type KeyFunc func(r *http.Request) string

// GlobalKey returns a constant key for rate limits that are not per-user.
func GlobalKey(_ *http.Request) string { return "global" }

// IPKey extracts the remote address as the rate-limiting key.
func IPKey(r *http.Request) string { return r.RemoteAddr }

// ForCategory returns a Chi middleware that enforces rate limiting for a given
// category using the provided limiter and key extraction function.
//
// When keyFn returns "" (e.g. no authenticated user), the request is passed
// through without rate limiting. When the limiter returns an error or nil
// result, the request is allowed through and the error is logged (fail-open).
func ForCategory(limiter ratelimit.Limiter, cat string, keyFn KeyFunc, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFn(r)
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			result, err := limiter.Allow(r.Context(), cat, key)
			if err != nil {
				logger.Warn("rate limiter error, allowing request",
					"error", err,
					"category", cat,
					"key", key,
				)
				next.ServeHTTP(w, r)
				return
			}

			if result == nil {
				logger.Warn("rate limiter returned nil result, allowing request",
					"category", cat,
					"key", key,
				)
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", result.Remaining))

			if !result.Allowed {
				retryAfter := int(math.Ceil(time.Until(result.ResetAt).Seconds()))
				if retryAfter < 1 {
					retryAfter = 1
				}
				w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
				httputil.WriteError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
