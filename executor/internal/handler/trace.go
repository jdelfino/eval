package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/executor/internal/tracer"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"
)

// maxTraceSteps is the hard cap on max_steps for trace requests.
const maxTraceSteps = 50000

// defaultTraceSteps is used when max_steps is not provided.
const defaultTraceSteps = 5000

// traceTimeoutMs is the timeout for trace executions (10 seconds).
const traceTimeoutMs = 10000

// defaultTracerJarPath is the well-known location for the Java tracer JAR
// inside the executor Docker image (built by PLAT-lqsw.6).
const defaultTracerJarPath = "/usr/local/lib/java-tracer.jar"

// TraceHandlerConfig holds configuration values for the TraceHandler.
type TraceHandlerConfig struct {
	NsjailPath              string
	PythonPath              string
	JavaPath                string
	JavacPath               string
	TracerJarPath           string // Path to the Java tracer JAR; defaults to defaultTracerJarPath.
	MaxOutputBytes          int
	MaxCodeBytes            int
	MaxStdinBytes           int
	MaxConcurrentExecutions int
}

// TraceHandler handles debugger trace requests.
type TraceHandler struct {
	logger    *slog.Logger
	runner    SandboxRunner
	metrics   *metrics.Metrics
	cfg       TraceHandlerConfig
	semaphore chan struct{}
}

// NewTraceHandler creates a TraceHandler with the given dependencies.
func NewTraceHandler(
	logger *slog.Logger,
	runner SandboxRunner,
	m *metrics.Metrics,
	cfg TraceHandlerConfig,
) *TraceHandler {
	var sem chan struct{}
	if cfg.MaxConcurrentExecutions > 0 {
		sem = make(chan struct{}, cfg.MaxConcurrentExecutions)
	}
	return &TraceHandler{
		logger:    logger,
		runner:    runner,
		metrics:   m,
		cfg:       cfg,
		semaphore: sem,
	}
}

// ServeHTTP handles the /trace endpoint.
func (h *TraceHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Limit body size.
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req executorapi.TraceRequest
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
			h.logger.Warn("concurrency limit reached, rejecting trace request")
			httputil.WriteError(w, http.StatusTooManyRequests, "too many concurrent executions")
			return
		}
	}

	// Observe code size.
	h.metrics.CodeSizeBytes.Observe(float64(len(req.Code)))

	// Determine max steps.
	maxSteps := defaultTraceSteps
	if req.MaxSteps != nil {
		maxSteps = *req.MaxSteps
	}

	// Build the sandbox request based on language.
	// Both Python and Java tracers accept the same Args convention:
	//   [student_code, stdin, maxSteps]
	// The difference is which tracer binary/script is invoked.
	tracerArgs := []string{req.Code, req.Stdin, strconv.Itoa(maxSteps)}

	var sandboxReq sandbox.Request
	if req.Language == "java" {
		// Java path: run the Java tracer JAR via the sandbox.
		// IsCommand=true tells the sandbox to execute Code directly as a command
		// (not to compile it as Java source). Language="java" ensures the sandbox
		// uses Java-appropriate bind-mounts and resource limits.
		jarPath := h.cfg.TracerJarPath
		if jarPath == "" {
			jarPath = defaultTracerJarPath
		}
		sandboxReq = sandbox.Request{
			Code:      fmt.Sprintf("java -cp %s JavaTracer", jarPath),
			Stdin:     "", // tracer reads stdin via argv, not actual stdin
			TimeoutMs: traceTimeoutMs,
			Args:      tracerArgs,
			Language:  "java",
			IsCommand: true,
		}
	} else {
		// Python path (default): the tracer script becomes main.py,
		// and the student code, stdin, and maxSteps are passed as arguments.
		sandboxReq = sandbox.Request{
			Code:      tracer.Script,
			Stdin:     "", // tracer reads stdin via argv, not actual stdin
			TimeoutMs: traceTimeoutMs,
			Args:      tracerArgs,
		}
	}

	sandboxCfg := sandbox.Config{
		NsjailPath:     h.cfg.NsjailPath,
		PythonPath:     h.cfg.PythonPath,
		JavaPath:       h.cfg.JavaPath,
		JavacPath:      h.cfg.JavacPath,
		MaxOutputBytes: h.cfg.MaxOutputBytes,
	}

	h.logger.Info("tracing code",
		"code_length", len(req.Code),
		"has_stdin", req.Stdin != "",
		"max_steps", maxSteps,
	)

	// Track active executions.
	h.metrics.ActiveExecutions.Inc()
	defer h.metrics.ActiveExecutions.Dec()

	start := time.Now()
	result, err := h.runner(r.Context(), sandboxCfg, sandboxReq)
	duration := time.Since(start)

	h.metrics.ExecutionDuration.Observe(duration.Seconds())

	if err != nil {
		h.logger.Error("trace sandbox execution failed", "error", err, "duration_ms", duration.Milliseconds())
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("sandbox setup failed: %v", err))
		return
	}

	// Handle timeout.
	if result.TimedOut {
		h.metrics.ExecutionsTotal.WithLabelValues("timeout").Inc()
		resp := executorapi.TraceResponse{
			Steps:     []executorapi.TraceStep{},
			ExitCode:  -1,
			Error:     "trace execution timed out",
			Truncated: true,
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	// Parse the tracer JSON output from stdout.
	resp, parseErr := parseTraceOutput(result.Stdout)
	if parseErr != nil {
		h.logger.Error("failed to parse trace output",
			"error", parseErr,
			"stdout_len", len(result.Stdout),
			"stderr", result.Stderr,
		)
		h.metrics.ExecutionsTotal.WithLabelValues("error").Inc()
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse trace output")
		return
	}

	if resp.ExitCode == 0 {
		h.metrics.ExecutionsTotal.WithLabelValues("success").Inc()
	} else {
		h.metrics.ExecutionsTotal.WithLabelValues("failure").Inc()
	}

	h.logger.Info("trace complete",
		"total_steps", resp.TotalSteps,
		"exit_code", resp.ExitCode,
		"truncated", resp.Truncated,
		"duration_ms", duration.Milliseconds(),
	)

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *TraceHandler) validateRequest(req *executorapi.TraceRequest) (string, string) {
	if req.Code == "" {
		return "invalid_request", "code is required and must be non-empty"
	}
	if len(req.Code) > h.cfg.MaxCodeBytes {
		return "code_too_large", fmt.Sprintf("code exceeds maximum size of %d bytes", h.cfg.MaxCodeBytes)
	}
	if len(req.Stdin) > h.cfg.MaxStdinBytes {
		return "stdin_too_large", fmt.Sprintf("stdin exceeds maximum size of %d bytes", h.cfg.MaxStdinBytes)
	}
	if req.MaxSteps != nil {
		if *req.MaxSteps <= 0 {
			return "invalid_request", "max_steps must be a positive integer"
		}
		if *req.MaxSteps > maxTraceSteps {
			return "invalid_request", fmt.Sprintf("max_steps exceeds maximum of %d", maxTraceSteps)
		}
	}
	if req.Language != "" && req.Language != "python" && req.Language != "java" {
		return "invalid_request", fmt.Sprintf("unsupported language %q: must be empty, \"python\", or \"java\"", req.Language)
	}
	return "", ""
}

func parseTraceOutput(stdout string) (*executorapi.TraceResponse, error) {
	var resp executorapi.TraceResponse
	if err := json.Unmarshal([]byte(stdout), &resp); err != nil {
		return nil, fmt.Errorf("unmarshal trace output: %w", err)
	}
	// Ensure steps is never nil for clean JSON serialization.
	if resp.Steps == nil {
		resp.Steps = []executorapi.TraceStep{}
	}
	return &resp, nil
}
