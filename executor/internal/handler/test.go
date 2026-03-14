package handler

import (
	"encoding/json"
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

// TestHandlerConfig holds configuration values for the TestHandler.
type TestHandlerConfig struct {
	NsjailPath              string
	PythonPath              string
	JavaPath                string
	JavacPath               string
	MaxOutputBytes          int
	DefaultTimeoutMs        int
	MaxCodeBytes            int
	MaxConcurrentExecutions int
}

// TestHandler handles I/O test execution requests.
type TestHandler struct {
	logger    *slog.Logger
	runner    SandboxRunner
	metrics   *metrics.Metrics
	cfg       TestHandlerConfig
	semaphore chan struct{}
}

// NewTestHandler creates a TestHandler with the given dependencies.
func NewTestHandler(
	logger *slog.Logger,
	runner SandboxRunner,
	m *metrics.Metrics,
	cfg TestHandlerConfig,
) *TestHandler {
	var sem chan struct{}
	if cfg.MaxConcurrentExecutions > 0 {
		sem = make(chan struct{}, cfg.MaxConcurrentExecutions)
	}
	return &TestHandler{
		logger:    logger,
		runner:    runner,
		metrics:   m,
		cfg:       cfg,
		semaphore: sem,
	}
}

// ServeHTTP handles the /test endpoint.
func (h *TestHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Limit body size.
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req executorapi.TestRequest
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
			h.logger.Warn("concurrency limit reached, rejecting test request")
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

	// Serialize the test definitions to JSON so they can be passed to the wrapper script
	// as an attached file.
	testsJSON, err := json.Marshal(req.IOTests)
	if err != nil {
		h.logger.Error("failed to marshal test definitions", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to prepare test definitions")
		return
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
	//
	// We pass these as positional args. The sandbox places all files at /tmp/work/.
	sandboxWorkDir := "/tmp/work"
	args := []string{
		fmt.Sprintf("%s/%s", sandboxWorkDir, codeFilename),
		fmt.Sprintf("%s/io_tests.json", sandboxWorkDir),
		req.Language,
	}

	// Build sandbox request.
	// The wrapper script runs as Code (main.py equivalent), with student code
	// and test definitions as attached files.
	files := []sandbox.File{
		{Name: codeFilename, Content: req.Code},
		{Name: "io_tests.json", Content: string(testsJSON)},
	}

	sandboxReq := sandbox.Request{
		Code:      iotestrunner.Script,
		Stdin:     "",
		Files:     files,
		TimeoutMs: timeoutMs,
		Args:      args,
		Language:  req.Language,
	}

	sandboxCfg := sandbox.Config{
		NsjailPath:     h.cfg.NsjailPath,
		PythonPath:     h.cfg.PythonPath,
		JavaPath:       h.cfg.JavaPath,
		JavacPath:      h.cfg.JavacPath,
		MaxOutputBytes: h.cfg.MaxOutputBytes,
	}

	h.logger.Info("running I/O tests",
		"code_length", len(req.Code),
		"test_count", len(req.IOTests),
		"language", req.Language,
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
		h.logger.Error("test sandbox execution failed", "error", err, "duration_ms", duration.Milliseconds())
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("sandbox setup failed: %v", err))
		return
	}

	// Handle sandbox-level timeout (the entire test run timed out).
	if result.TimedOut {
		h.metrics.ExecutionsTotal.WithLabelValues("timeout").Inc()
		// Build a synthetic error result for the entire batch.
		errResults := make([]executorapi.TestResult, len(req.IOTests))
		for i, t := range req.IOTests {
			errResults[i] = executorapi.TestResult{
				Name:   t.Name,
				Type:   "io",
				Status: "error",
				Input:  t.Input,
				Stderr: "execution timed out",
			}
		}
		summary := buildSummary(errResults)
		resp := executorapi.TestResponse{
			Results: errResults,
			Summary: summary,
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	// Parse the JSON results array emitted by the wrapper script.
	testResults, parseErr := parseTestRunnerOutput(result.Stdout)
	if parseErr != nil {
		h.logger.Error("failed to parse test runner output",
			"error", parseErr,
			"stdout_len", len(result.Stdout),
			"stderr", result.Stderr,
		)
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse test results")
		return
	}

	summary := buildSummary(testResults)
	if summary.Errors > 0 || summary.Failed > 0 {
		h.metrics.ExecutionsTotal.WithLabelValues("failure").Inc()
	} else {
		h.metrics.ExecutionsTotal.WithLabelValues("success").Inc()
	}

	h.logger.Info("I/O tests complete",
		"total", summary.Total,
		"passed", summary.Passed,
		"failed", summary.Failed,
		"errors", summary.Errors,
		"duration_ms", duration.Milliseconds(),
	)

	resp := executorapi.TestResponse{
		Results: testResults,
		Summary: summary,
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *TestHandler) validateRequest(req *executorapi.TestRequest) (string, string) {
	if req.Code == "" {
		return "invalid_request", "code is required and must be non-empty"
	}
	if len(req.Code) > h.cfg.MaxCodeBytes {
		return "code_too_large", fmt.Sprintf("code exceeds maximum size of %d bytes", h.cfg.MaxCodeBytes)
	}
	if req.Language != "python" && req.Language != "java" {
		return "invalid_request", fmt.Sprintf("language is required: must be \"python\" or \"java\", got %q", req.Language)
	}
	if len(req.IOTests) == 0 {
		return "invalid_request", "io_tests must be a non-empty list"
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

// parseTestRunnerOutput parses the JSON array of test results from the wrapper script.
func parseTestRunnerOutput(stdout string) ([]executorapi.TestResult, error) {
	// The wrapper script outputs a JSON array of objects matching TestResult.
	var raw []json.RawMessage
	if err := json.Unmarshal([]byte(stdout), &raw); err != nil {
		return nil, fmt.Errorf("unmarshal test runner output: %w", err)
	}

	results := make([]executorapi.TestResult, len(raw))
	for i, r := range raw {
		if err := json.Unmarshal(r, &results[i]); err != nil {
			return nil, fmt.Errorf("unmarshal test result %d: %w", i, err)
		}
	}
	return results, nil
}

// buildSummary aggregates TestResult entries into a TestSummary.
func buildSummary(results []executorapi.TestResult) executorapi.TestSummary {
	s := executorapi.TestSummary{
		Total: len(results),
	}
	for _, r := range results {
		s.TimeMs += r.TimeMs
		switch r.Status {
		case "passed":
			s.Passed++
		case "failed":
			s.Failed++
		default:
			s.Errors++
		}
	}
	return s
}
