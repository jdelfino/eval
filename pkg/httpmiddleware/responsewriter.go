// Package httpmiddleware provides shared HTTP middleware components.
package httpmiddleware

import "net/http"

// ResponseWriter wraps http.ResponseWriter to capture the status code
// and optional error context for logging.
type ResponseWriter struct {
	http.ResponseWriter
	Status      int
	WroteHeader bool
	ErrorDetail string // error context captured by WriteError for 5xx logging
}

// SetErrorDetail records an error message for downstream logging middleware.
// This is called by httputil.WriteError for 5xx responses so the logging
// middleware can include the underlying error in structured log output.
func (rw *ResponseWriter) SetErrorDetail(detail string) {
	rw.ErrorDetail = detail
}

// NewResponseWriter creates a ResponseWriter wrapping the given http.ResponseWriter.
func NewResponseWriter(w http.ResponseWriter) *ResponseWriter {
	return &ResponseWriter{ResponseWriter: w}
}

// WriteHeader captures the status code and delegates to the underlying writer.
func (rw *ResponseWriter) WriteHeader(code int) {
	if !rw.WroteHeader {
		rw.Status = code
		rw.WroteHeader = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

// Write writes data, defaulting to 200 if WriteHeader was not yet called.
func (rw *ResponseWriter) Write(b []byte) (int, error) {
	if !rw.WroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}
