// Package handler provides HTTP handlers for the executor service.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jdelfino/eval/executor/internal/iotestrunner"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"
)

// maxBodyBytes is the maximum allowed request body size (1 MB).
const maxBodyBytes = 1 * 1024 * 1024

// reservedFileError is returned when a student-submitted file name collides
// with a reserved sandbox file name (e.g. solution.py, io_tests.json).
type reservedFileError struct {
	filename string
}

func (e *reservedFileError) Error() string {
	return fmt.Sprintf("file name %q is reserved", e.filename)
}

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
		var rfErr *reservedFileError
		if errors.As(sandboxErr, &rfErr) {
			h.metrics.ValidationErrorsTotal.WithLabelValues("reserved_filename").Inc()
			httputil.WriteError(w, http.StatusBadRequest, rfErr.Error())
			return
		}
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

// runCases dispatches cases to the iotestrunner sandbox and returns results.
// Returns (results, timedOut, error).
func (h *ExecuteHandler) runCases(
	ctx context.Context,
	sandboxCfg sandbox.Config,
	req executorapi.ExecuteRequest,
	timeoutMs int,
) ([]executorapi.CaseResult, bool, error) {
	// Serialize the case definitions to JSON so they can be passed to the wrapper script
	// as an attached file.
	ioTests := make([]map[string]interface{}, 0, len(req.Cases))
	for _, c := range req.Cases {
		def := map[string]interface{}{
			"name":       c.Name,
			"input":      c.Input,
			"match_type": c.MatchType,
		}
		if c.ExpectedOutput != "" {
			def["expected_output"] = c.ExpectedOutput
		}
		if c.RandomSeed != nil {
			def["random_seed"] = *c.RandomSeed
		}
		ioTests = append(ioTests, def)
	}

	testsJSON, err := json.Marshal(ioTests)
	if err != nil {
		return nil, false, fmt.Errorf("marshal case definitions: %w", err)
	}

	// Determine the student code filename based on language.
	codeFilename := "solution.py"
	if req.Language == "java" {
		codeFilename = "Main.java"
	}

	// The wrapper script receives:
	//   argv[1]: path to student code file (relative inside sandbox)
	//   argv[2]: path to test definitions JSON file
	//   argv[3]: language
	// Use relative filenames so they work with both nsjail (CWD=/tmp/work) and
	// RunUnsafe mode (CWD=tempDir), where files are written to the working directory.
	args := []string{
		codeFilename,
		"io_tests.json",
		req.Language,
	}

	files := []sandbox.File{
		{Name: codeFilename, Content: req.Code},
		{Name: "io_tests.json", Content: string(testsJSON)},
	}
	// Collect unique extra files from all cases.
	// If a case file name collides with a reserved sandbox file name, return an
	// error so the caller can respond with HTTP 400 rather than silently dropping
	// the file and producing confusing failures.
	seen := map[string]bool{codeFilename: true, "io_tests.json": true}
	for _, c := range req.Cases {
		for i := range c.Files {
			if seen[c.Files[i].Name] {
				return nil, false, &reservedFileError{filename: c.Files[i].Name}
			}
			files = append(files, sandbox.File{Name: c.Files[i].Name, Content: c.Files[i].Content})
			seen[c.Files[i].Name] = true
		}
	}

	// The io_test_runner wrapper is always a Python script; the student's language
	// is passed via Args[2] so the runner can invoke the right interpreter.
	// Do NOT set Language:"java" here — that would cause the sandbox to treat the
	// Python runner script as Java source. Instead, set InnerLanguage so the
	// sandbox can configure appropriate resource limits and bind mounts for the
	// subprocesses the runner will spawn (e.g. the JVM for Java problems).
	sandboxReq := sandbox.Request{
		Code:          iotestrunner.Script,
		Stdin:         "",
		Files:         files,
		TimeoutMs:     timeoutMs,
		Args:          args,
		Language:      "python",
		InnerLanguage: req.Language,
	}

	// The io_test_runner JSON output can be larger than the student's raw output
	// (JSON encoding overhead, multiple cases). Use a larger sandbox output limit
	// so the JSON is never truncated by the sandbox itself; truncation is handled
	// per-case inside the runner script.
	ioRunnerCfg := sandboxCfg
	ioRunnerCfg.MaxOutputBytes = 10 * 1024 * 1024 // 10 MB

	result, err := h.runner(ctx, ioRunnerCfg, sandboxReq)
	if err != nil {
		return nil, false, err
	}

	// Handle sandbox-level timeout: build error results for all cases.
	if result.TimedOut {
		errResults := make([]executorapi.CaseResult, len(req.Cases))
		for i, c := range req.Cases {
			errResults[i] = executorapi.CaseResult{
				Name:   c.Name,
				Type:   "io",
				Status: "error",
				Input:  c.Input,
				Stderr: "execution timed out",
			}
		}
		return errResults, true, nil
	}

	// Parse the JSON results array emitted by the wrapper script.
	caseResults, parseErr := parseCaseResults(result.Stdout)
	if parseErr != nil {
		h.logger.Error("failed to parse case results",
			"error", parseErr,
			"stdout_len", len(result.Stdout),
			"stderr", result.Stderr,
		)
		return nil, false, fmt.Errorf("parse case results: %w", parseErr)
	}

	return caseResults, false, nil
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
	return "", ""
}

// parseCaseResults parses the JSON array of case results from the wrapper script.
// The wrapper script outputs a JSON array matching CaseResult shape.
func parseCaseResults(stdout string) ([]executorapi.CaseResult, error) {
	var raw []json.RawMessage
	if err := json.Unmarshal([]byte(stdout), &raw); err != nil {
		return nil, fmt.Errorf("unmarshal case results: %w", err)
	}

	results := make([]executorapi.CaseResult, len(raw))
	for i, r := range raw {
		if err := json.Unmarshal(r, &results[i]); err != nil {
			return nil, fmt.Errorf("unmarshal case result %d: %w", i, err)
		}
	}
	return results, nil
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
