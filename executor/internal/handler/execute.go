// Package handler provides HTTP handlers for the executor service.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
)

// maxBodyBytes is the maximum allowed request body size (1 MB).
const maxBodyBytes = 1 * 1024 * 1024

// maxTimeoutMs is the hard cap on timeout_ms.
const maxTimeoutMs = 30000

// SandboxRunner is the function signature for sandbox.Run, allowing injection in tests.
type SandboxRunner func(ctx context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error)

// ExecuteHandler handles code execution requests.
type ExecuteHandler struct {
	logger           *slog.Logger
	runner           SandboxRunner
	metrics          *metrics.Metrics
	nsjailPath       string
	pythonPath       string
	maxOutputBytes   int
	defaultTimeoutMs int
	maxCodeBytes     int
	maxStdinBytes    int
	maxFiles         int
	maxFileBytes     int
}

// NewExecuteHandler creates an ExecuteHandler with the given dependencies.
func NewExecuteHandler(
	logger *slog.Logger,
	runner SandboxRunner,
	m *metrics.Metrics,
	nsjailPath string,
	pythonPath string,
	maxOutputBytes int,
	defaultTimeoutMs int,
	maxCodeBytes int,
	maxStdinBytes int,
	maxFiles int,
	maxFileBytes int,
) *ExecuteHandler {
	return &ExecuteHandler{
		logger:           logger,
		runner:           runner,
		metrics:          m,
		nsjailPath:       nsjailPath,
		pythonPath:       pythonPath,
		maxOutputBytes:   maxOutputBytes,
		defaultTimeoutMs: defaultTimeoutMs,
		maxCodeBytes:     maxCodeBytes,
		maxStdinBytes:    maxStdinBytes,
		maxFiles:         maxFiles,
		maxFileBytes:     maxFileBytes,
	}
}

// ServeHTTP handles the /execute endpoint.
func (h *ExecuteHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Limit body size.
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req executorapi.ExecuteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.metrics.ValidationErrorsTotal.WithLabelValues("invalid_request").Inc()
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Validate request.
	if reason, errMsg := h.validateRequest(&req); errMsg != "" {
		if reason != "" {
			h.metrics.ValidationErrorsTotal.WithLabelValues(reason).Inc()
		}
		writeError(w, http.StatusBadRequest, errMsg)
		return
	}

	// Observe code size.
	h.metrics.CodeSizeBytes.Observe(float64(len(req.Code)))

	// Determine timeout.
	timeoutMs := h.defaultTimeoutMs
	if req.TimeoutMs != nil {
		timeoutMs = *req.TimeoutMs
	}

	// Build sandbox request.
	files := make([]sandbox.File, len(req.Files))
	for i, f := range req.Files {
		files[i] = sandbox.File{Name: f.Name, Content: f.Content}
	}

	sandboxReq := sandbox.Request{
		Code:       req.Code,
		Stdin:      req.Stdin,
		Files:      files,
		RandomSeed: req.RandomSeed,
		TimeoutMs:  timeoutMs,
	}

	sandboxCfg := sandbox.Config{
		NsjailPath:     h.nsjailPath,
		PythonPath:     h.pythonPath,
		MaxOutputBytes: h.maxOutputBytes,
	}

	h.logger.Info("executing code",
		"code_length", len(req.Code),
		"has_stdin", req.Stdin != "",
		"file_count", len(req.Files),
		"timeout_ms", timeoutMs,
	)

	// Track active executions.
	h.metrics.ActiveExecutions.Inc()
	defer h.metrics.ActiveExecutions.Dec()

	start := time.Now()
	result, err := h.runner(r.Context(), sandboxCfg, sandboxReq)
	duration := time.Since(start)

	// Observe duration.
	h.metrics.ExecutionDuration.Observe(duration.Seconds())

	if err != nil {
		h.logger.Error("sandbox execution failed", "error", err, "duration_ms", duration.Milliseconds())
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		writeError(w, http.StatusInternalServerError, "internal execution error")
		return
	}

	success := result.ExitCode == 0 && !result.TimedOut

	// Record execution status.
	switch {
	case result.TimedOut:
		h.metrics.ExecutionsTotal.WithLabelValues("timeout").Inc()
	case success:
		h.metrics.ExecutionsTotal.WithLabelValues("success").Inc()
	default:
		h.metrics.ExecutionsTotal.WithLabelValues("failure").Inc()
	}

	// Build output and error strings.
	output := result.Stdout
	errOutput := result.Stderr
	if result.TimedOut {
		errOutput = "execution timed out"
	}

	resp := executorapi.ExecuteResponse{
		Success:         success,
		Output:          output,
		Error:           errOutput,
		ExecutionTimeMs: result.DurationMs,
		Stdin:           req.Stdin,
	}

	h.logger.Info("execution complete",
		"success", success,
		"duration_ms", result.DurationMs,
	)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *ExecuteHandler) validateRequest(req *executorapi.ExecuteRequest) (string, string) {
	if req.Code == "" {
		return "invalid_request", "code is required and must be non-empty"
	}
	if len(req.Code) > h.maxCodeBytes {
		return "code_too_large", fmt.Sprintf("code exceeds maximum size of %d bytes", h.maxCodeBytes)
	}
	if len(req.Stdin) > h.maxStdinBytes {
		return "stdin_too_large", fmt.Sprintf("stdin exceeds maximum size of %d bytes", h.maxStdinBytes)
	}
	if len(req.Files) > h.maxFiles {
		return "too_many_files", fmt.Sprintf("too many files: maximum is %d", h.maxFiles)
	}
	for _, f := range req.Files {
		if f.Name == "" {
			return "invalid_request", "file name must not be empty"
		}
		if f.Content == "" {
			return "invalid_request", "file content must not be empty"
		}
		if len(f.Content) > h.maxFileBytes {
			return "file_too_large", fmt.Sprintf("file %q exceeds maximum size of %d bytes", f.Name, h.maxFileBytes)
		}
	}
	if req.TimeoutMs != nil {
		if *req.TimeoutMs <= 0 {
			return "invalid_request", "timeout_ms must be a positive integer"
		}
		if *req.TimeoutMs > maxTimeoutMs {
			return "invalid_request", fmt.Sprintf("timeout_ms exceeds maximum of %d", maxTimeoutMs)
		}
	}
	return "", ""
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
