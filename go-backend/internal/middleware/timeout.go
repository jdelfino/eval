package middleware

import (
	"context"
	"net/http"
	"time"
)

// TimeoutOverride replaces any inherited timeout/cancellation with a fresh deadline.
//
// Unlike the standard chi middleware.Timeout (which uses context.WithTimeout on the
// incoming context), this middleware first strips the parent's deadline via
// context.WithoutCancel, then applies a new deadline. This allows a route group to
// use a LONGER timeout than a surrounding route group.
//
// The handler is responsible for checking ctx.Done() and returning an appropriate
// error when the context expires. This middleware only sets the deadline; it does
// not run the handler in a goroutine or forcefully write a timeout response.
//
// Use this when a specific route needs more time than the global API timeout.
// For example, the analyze endpoint may take up to 120 s with large classes,
// while the global API timeout is 30 s.
//
//	r.Group(func(r chi.Router) {
//	    r.Use(custommw.TimeoutOverride(120 * time.Second))
//	    r.Post("/sessions/{id}/analyze", analyzeHandler.Analyze)
//	})
func TimeoutOverride(d time.Duration) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Strip any parent cancellation/deadline so the new timeout is independent.
			ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), d)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
