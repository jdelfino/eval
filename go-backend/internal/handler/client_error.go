// Package handler provides HTTP handlers for the Go API server.
package handler

import (
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/httpbind"
)

// ClientErrorHandler handles frontend error reporting.
type ClientErrorHandler struct{}

// NewClientErrorHandler creates a new ClientErrorHandler.
func NewClientErrorHandler() *ClientErrorHandler {
	return &ClientErrorHandler{}
}

// reportClientErrorRequest is the request body for POST /api/v1/client-errors.
type reportClientErrorRequest struct {
	Message   string            `json:"message" validate:"required,min=1,max=10000"`
	Stack     string            `json:"stack" validate:"omitempty,max=50000"`
	URL       string            `json:"url" validate:"omitempty,max=2048"`
	UserAgent string            `json:"user_agent" validate:"omitempty,max=1024"`
	Severity  string            `json:"severity" validate:"omitempty,oneof=error warning info"`
	Context   map[string]string `json:"context" validate:"omitempty"`
}

// Report handles POST /api/v1/client-errors.
// Receives a client-side error report and logs it in Cloud Error Reporting format.
// Returns 204 No Content on success.
func (h *ClientErrorHandler) Report(w http.ResponseWriter, r *http.Request) {
	req, err := httpbind.BindJSON[reportClientErrorRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	severity := req.Severity
	if severity == "" {
		severity = "error"
	}

	// Log in Cloud Error Reporting structured format.
	// The @type field causes Cloud Logging to forward these to Cloud Error Reporting.
	slog.InfoContext(r.Context(), "frontend error",
		"@type", "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
		"source", "frontend",
		"message", req.Message,
		"stack", req.Stack,
		"url", req.URL,
		"user_agent", req.UserAgent,
		"severity", severity,
		"context", req.Context,
	)

	w.WriteHeader(http.StatusNoContent)
}
