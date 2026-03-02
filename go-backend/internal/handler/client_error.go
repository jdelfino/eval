// Package handler provides HTTP handlers for the Go API server.
package handler

import (
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/httpbind"
)

// ClientErrorHandler handles frontend error reporting.
type ClientErrorHandler struct {
	logger *slog.Logger
}

// NewClientErrorHandler creates a new ClientErrorHandler using the default logger.
func NewClientErrorHandler() *ClientErrorHandler {
	return &ClientErrorHandler{logger: slog.Default()}
}

// NewClientErrorHandlerWithLogger creates a new ClientErrorHandler with the provided logger.
// This is useful for testing to capture log output.
func NewClientErrorHandlerWithLogger(logger *slog.Logger) *ClientErrorHandler {
	return &ClientErrorHandler{logger: logger}
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

// clientSeverityToLevel maps client-reported severity strings to slog levels.
// Using the correct slog level means Cloud Logging picks up the severity from
// the log record itself — no separate "severity" attribute needed, which would
// create a duplicate JSON key.
func clientSeverityToLevel(severity string) slog.Level {
	switch severity {
	case "error", "":
		return slog.LevelError
	case "warning":
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

// Report handles POST /api/v1/client-errors.
// Receives a client-side error report and logs it in Cloud Error Reporting format.
// Returns 204 No Content on success.
func (h *ClientErrorHandler) Report(w http.ResponseWriter, r *http.Request) {
	req, err := httpbind.BindJSON[reportClientErrorRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	level := clientSeverityToLevel(req.Severity)

	// Log in Cloud Error Reporting structured format.
	// The @type field causes Cloud Logging to forward these to Cloud Error Reporting.
	// The log level is set from the client severity so Cloud Logging reads the
	// severity from the record — no separate "severity" attribute that would
	// create a duplicate JSON key.
	h.logger.LogAttrs(r.Context(), level, "frontend error",
		slog.String("@type", "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"),
		slog.String("source", "frontend"),
		slog.String("message", req.Message),
		slog.String("stack", req.Stack),
		slog.String("url", req.URL),
		slog.String("user_agent", req.UserAgent),
		slog.Any("context", req.Context),
	)

	w.WriteHeader(http.StatusNoContent)
}
