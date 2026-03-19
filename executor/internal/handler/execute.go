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
	"github.com/jdelfino/eval/pkg/httputil"
)

// maxBodyBytes is the maximum allowed request body size (1 MB).
const maxBodyBytes = 1 * 1024 * 1024

// maxTimeoutMs is the hard cap on timeout_ms.
const maxTimeoutMs = 30000

// SandboxRunner is the function signature for sandbox.Run, allowing injection in tests.
type SandboxRunner func(ctx context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error)

// ExecuteHandlerConfig holds configuration values for the ExecuteHandler.
type ExecuteHandlerConfig struct {
	NsjailPath              string
	PythonPath              string
	JavaPath                string
	JavacPath               string
	MaxOutputBytes          int
	DefaultTimeoutMs        int
	MaxCodeBytes            int
	MaxConcurrentExecutions int
	MaxStdinBytes           int
	MaxFiles                int
	MaxFileBytes            int
}

// ExecuteHandler handles code execution requests.
type ExecuteHandler struct {
	logger    *slog.Logger
	runner    SandboxRunner
	metrics   *metrics.Metrics
	cfg       ExecuteHandlerConfig
	semaphore chan struct{}
}

// NewExecuteHandler creates an ExecuteHandler with the given dependencies.
func NewExecuteHandler(
	logger *slog.Logger,
	runner SandboxRunner,
	m *metrics.Metrics,
	cfg ExecuteHandlerConfig,
) *ExecuteHandler {
	var sem chan struct{}
	if cfg.MaxConcurrentExecutions > 0 {
		sem = make(chan struct{}, cfg.MaxConcurrentExecutions)
	}
	return &ExecuteHandler{
		logger:    logger,
		runner:    runner,
		metrics:   m,
		cfg:       cfg,
		semaphore: sem,
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
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Validate request.
	if reason, errMsg := h.validateRequest(&req); errMsg != "" {
		if reason != "" {
			h.metrics.ValidationErrorsTotal.WithLabelValues(reason).Inc()
		}
		httputil.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}

	// Try to acquire a concurrency slot (non-blocking).
	if h.semaphore != nil {
		select {
		case h.semaphore <- struct{}{}:
			defer func() { <-h.semaphore }()
		default:
			h.logger.Warn("concurrency limit reached, rejecting request")
			httputil.WriteError(w, http.StatusTooManyRequests, "too many concurrent executions")
			return
		}
	}

	// Observe code size.
	h.metrics.CodeSizeBytes.Observe(float64(len(req.Code)))

	// Determine timeout.
	timeoutMs := h.cfg.DefaultTimeoutMs
	if req.TimeoutMs != nil {
		timeoutMs = *req.TimeoutMs
	}

	sandboxCfg := sandbox.Config{
		NsjailPath:     h.cfg.NsjailPath,
		PythonPath:     h.cfg.PythonPath,
		JavaPath:       h.cfg.JavaPath,
		JavacPath:      h.cfg.JavacPath,
		MaxOutputBytes: h.cfg.MaxOutputBytes,
	}

	h.logger.Info("executing code",
		"code_length", len(req.Code),
		"case_count", len(req.Cases),
		"language", req.Language,
		"timeout_ms", timeoutMs,
	)

	// Track active executions.
	h.metrics.ActiveExecutions.Inc()
	defer h.metrics.ActiveExecutions.Dec()

	start := time.Now()
	results, timedOut, sandboxErr := h.runCases(r.Context(), sandboxCfg, req, timeoutMs)
	duration := time.Since(start)

	// Observe duration.
	h.metrics.ExecutionDuration.Observe(duration.Seconds())

	if sandboxErr != nil {
		h.logger.Error("sandbox execution failed", "error", sandboxErr, "duration_ms", duration.Milliseconds())
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("sandbox setup failed: %v", sandboxErr))
		return
	}

	summary := buildCaseSummary(results)

	if timedOut {
		h.metrics.ExecutionsTotal.WithLabelValues("timeout").Inc()
	} else if summary.Errors > 0 || summary.Failed > 0 {
		h.metrics.ExecutionsTotal.WithLabelValues("failure").Inc()
	} else {
		h.metrics.ExecutionsTotal.WithLabelValues("success").Inc()
	}

	h.logger.Info("execution complete",
		"total", summary.Total,
		"passed", summary.Passed,
		"failed", summary.Failed,
		"errors", summary.Errors,
		"run", summary.Run,
		"duration_ms", duration.Milliseconds(),
	)

	resp := executorapi.ExecuteResponse{
		Results: results,
		Summary: summary,
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// runCases executes each case in the request sequentially, running the sandbox once per case.
// This is an intentionally simple throwaway implementation — PR 2 replaces it with iotestrunner.
// Returns (results, timedOut, error). timedOut is true if any case timed out.
func (h *ExecuteHandler) runCases(
	ctx context.Context,
	sandboxCfg sandbox.Config,
	req executorapi.ExecuteRequest,
	timeoutMs int,
) ([]executorapi.CaseResult, bool, error) {
	results := make([]executorapi.CaseResult, 0, len(req.Cases))
	anyTimedOut := false

	for _, c := range req.Cases {
		// Convert case files to sandbox files.
		files := make([]sandbox.File, len(c.Files))
		for i, f := range c.Files {
			files[i] = sandbox.File{Name: f.Name, Content: f.Content}
		}

		sandboxReq := sandbox.Request{
			Code:       req.Code,
			Stdin:      c.Input,
			Files:      files,
			RandomSeed: c.RandomSeed,
			TimeoutMs:  timeoutMs,
			Language:   req.Language,
		}

		result, err := h.runner(ctx, sandboxCfg, sandboxReq)
		if err != nil {
			return nil, false, err
		}

		var caseResult executorapi.CaseResult
		if result.TimedOut {
			anyTimedOut = true
			caseResult = executorapi.CaseResult{
				Name:   c.Name,
				Type:   "io",
				Status: "error",
				Input:  c.Input,
				Stderr: "execution timed out",
				TimeMs: result.DurationMs,
			}
			results = append(results, caseResult)
			break
		} else if result.ExitCode != 0 {
			caseResult = executorapi.CaseResult{
				Name:   c.Name,
				Type:   "io",
				Status: "error",
				Input:  c.Input,
				Actual: result.Stdout,
				Stderr: result.Stderr,
				TimeMs: result.DurationMs,
			}
		} else {
			// Run-only case (no expected output): status "run".
			caseResult = executorapi.CaseResult{
				Name:   c.Name,
				Type:   "io",
				Status: "run",
				Input:  c.Input,
				Actual: result.Stdout,
				Stderr: result.Stderr,
				TimeMs: result.DurationMs,
			}
		}

		results = append(results, caseResult)
	}

	return results, anyTimedOut, nil
}

func (h *ExecuteHandler) validateRequest(req *executorapi.ExecuteRequest) (string, string) {
	if req.Code == "" {
		return "invalid_request", "code is required and must be non-empty"
	}
	if len(req.Code) > h.cfg.MaxCodeBytes {
		return "code_too_large", fmt.Sprintf("code exceeds maximum size of %d bytes", h.cfg.MaxCodeBytes)
	}
	if req.TimeoutMs != nil {
		if *req.TimeoutMs <= 0 {
			return "invalid_request", "timeout_ms must be a positive integer"
		}
		if *req.TimeoutMs > maxTimeoutMs {
			return "invalid_request", fmt.Sprintf("timeout_ms exceeds maximum of %d", maxTimeoutMs)
		}
	}
	if req.Language != "python" && req.Language != "java" {
		return "invalid_request", fmt.Sprintf("language is required: must be \"python\" or \"java\", got %q", req.Language)
	}
	if len(req.Cases) == 0 {
		return "invalid_request", "cases must be a non-empty list"
	}
	for i, c := range req.Cases {
		if h.cfg.MaxStdinBytes > 0 && len(c.Input) > h.cfg.MaxStdinBytes {
			return "stdin_too_large", fmt.Sprintf("case %d: stdin exceeds maximum size of %d bytes", i, h.cfg.MaxStdinBytes)
		}
		if h.cfg.MaxFiles > 0 && len(c.Files) > h.cfg.MaxFiles {
			return "too_many_files", fmt.Sprintf("case %d: too many files: maximum is %d", i, h.cfg.MaxFiles)
		}
		for _, f := range c.Files {
			if h.cfg.MaxFileBytes > 0 && len(f.Content) > h.cfg.MaxFileBytes {
				return "file_too_large", fmt.Sprintf("case %d: file %q exceeds maximum size of %d bytes", i, f.Name, h.cfg.MaxFileBytes)
			}
		}
	}
	return "", ""
}

// buildCaseSummary aggregates CaseResult entries into a CaseSummary.
func buildCaseSummary(results []executorapi.CaseResult) executorapi.CaseSummary {
	s := executorapi.CaseSummary{
		Total: len(results),
	}
	for _, r := range results {
		s.TimeMs += r.TimeMs
		switch r.Status {
		case "passed":
			s.Passed++
		case "failed":
			s.Failed++
		case "run":
			s.Run++
		default:
			s.Errors++
		}
	}
	return s
}
