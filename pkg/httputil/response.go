// Package httputil provides shared HTTP response helpers used across services.
package httputil

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// WriteJSON writes a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// WriteError writes a JSON error response with the given status code and message.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// WriteInternalError logs the error and writes a 500 response.
// The error is logged with request context (request_id if available).
// The user-facing message hides internal details.
func WriteInternalError(w http.ResponseWriter, r *http.Request, err error, message string) {
	attrs := []slog.Attr{
		slog.String("error", err.Error()),
		slog.String("path", r.URL.Path),
		slog.String("method", r.Method),
	}
	if reqID := middleware.GetReqID(r.Context()); reqID != "" {
		attrs = append(attrs, slog.String("request_id", reqID))
	}
	slog.LogAttrs(r.Context(), slog.LevelError, "internal server error", attrs...)
	WriteError(w, http.StatusInternalServerError, message)
}

// healthResponse is the JSON response for liveness probes.
type healthResponse struct {
	Status string `json:"status"`
}

// Healthz is a liveness probe handler for Kubernetes.
// It always returns 200 OK with {"status": "ok"}.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}
