package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jdelfino/eval/internal/auth"
)

// RequirePermission returns middleware that restricts access to users who have
// the specified permission. It must run after authentication middleware that
// populates the user in the request context via auth.WithUser.
//
// If no user is in the context, it responds with 401 Unauthorized.
// If the user's role lacks the required permission, it responds with 403 Forbidden.
//
// Usage:
//
//	r.Group(func(r chi.Router) {
//	    r.Use(RequirePermission(auth.PermContentManage))
//	    r.Post("/classes", createClass)
//	})
func RequirePermission(perm auth.Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := auth.UserFromContext(r.Context())
			if user == nil {
				writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
				return
			}

			if !auth.HasPermission(user.Role, perm) {
				writeJSONError(w, r, http.StatusForbidden, "insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// writeJSONError writes a JSON error response with the given status code, message,
// and request_id for correlation.
func writeJSONError(w http.ResponseWriter, r *http.Request, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	resp := map[string]string{"error": message}
	if reqID := middleware.GetReqID(r.Context()); reqID != "" {
		resp["request_id"] = reqID
	}
	_ = json.NewEncoder(w).Encode(resp)
}
