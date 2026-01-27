// Package handler provides HTTP handlers for the executor service.
package handler

import (
	"encoding/json"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/sandbox"
)

// maxBodyBytes is the maximum allowed request body size (1 MB).
const maxBodyBytes = 1 * 1024 * 1024

// maxTimeoutMs is the hard cap on timeout_ms.
const maxTimeoutMs = 30000

// ExecuteRequest is the JSON request body for code execution.
type ExecuteRequest struct {
	Code       string        `json:"code"`
	Stdin      string        `json:"stdin"`
	Files      []FileRequest `json:"files"`
	RandomSeed *int          `json:"random_seed"`
	TimeoutMs  *int          `json:"timeout_ms"`
}

// FileRequest is an attached file in the execute request.
type FileRequest struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ExecuteResponse is the JSON response for code execution.
type ExecuteResponse struct {
	Success         bool   `json:"success"`
	Output          string `json:"output"`
	Error           string `json:"error"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
	Stdin           string `json:"stdin"`
}

// SandboxRunner is the function signature for sandbox.Run, allowing injection in tests.
type SandboxRunner func(ctx context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error)

// Execute returns an HTTP handler that runs code in a sandbox.
func Execute(cfg *config.Config, logger *slog.Logger, runner SandboxRunner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Limit body size.
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}

		// Validate request.
		if errMsg := validateRequest(cfg, &req); errMsg != "" {
			writeError(w, http.StatusBadRequest, errMsg)
			return
		}

		// Determine timeout.
		timeoutMs := cfg.DefaultTimeoutMS
		if req.TimeoutMs != nil {
			timeoutMs = *req.TimeoutMs
		}

		// Build sandbox request.
		files := make([]sandbox.File, len(req.Files))
		for i, f := range req.Files {
			files[i] = sandbox.File{Name: f.Name, Content: f.Content}
		}

		sandboxReq := sandbox.Request{
			Code:      req.Code,
			Stdin:     req.Stdin,
			Files:     files,
			RandomSeed: req.RandomSeed,
			TimeoutMs: timeoutMs,
		}

		sandboxCfg := sandbox.Config{
			NsjailPath:     cfg.NsjailPath,
			PythonPath:     cfg.PythonPath,
			MaxOutputBytes: cfg.MaxOutputBytes,
		}

		logger.Info("executing code",
			"code_length", len(req.Code),
			"has_stdin", req.Stdin != "",
			"file_count", len(req.Files),
			"timeout_ms", timeoutMs,
		)

		start := time.Now()
		result, err := runner(r.Context(), sandboxCfg, sandboxReq)
		duration := time.Since(start)

		if err != nil {
			logger.Error("sandbox execution failed", "error", err, "duration_ms", duration.Milliseconds())
			writeError(w, http.StatusInternalServerError, "internal execution error")
			return
		}

		success := result.ExitCode == 0 && !result.TimedOut

		// Build output and error strings.
		output := result.Stdout
		errOutput := result.Stderr
		if result.TimedOut {
			errOutput = "execution timed out"
		}

		resp := ExecuteResponse{
			Success:         success,
			Output:          output,
			Error:           errOutput,
			ExecutionTimeMs: result.DurationMs,
			Stdin:           req.Stdin,
		}

		logger.Info("execution complete",
			"success", success,
			"duration_ms", result.DurationMs,
		)

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func validateRequest(cfg *config.Config, req *ExecuteRequest) string {
	if req.Code == "" {
		return "code is required and must be non-empty"
	}
	if len(req.Code) > cfg.MaxCodeBytes {
		return fmt.Sprintf("code exceeds maximum size of %d bytes", cfg.MaxCodeBytes)
	}
	if len(req.Stdin) > cfg.MaxStdinBytes {
		return fmt.Sprintf("stdin exceeds maximum size of %d bytes", cfg.MaxStdinBytes)
	}
	if len(req.Files) > cfg.MaxFiles {
		return fmt.Sprintf("too many files: maximum is %d", cfg.MaxFiles)
	}
	for _, f := range req.Files {
		if f.Name == "" {
			return "file name must not be empty"
		}
		if f.Content == "" {
			return "file content must not be empty"
		}
		if len(f.Content) > cfg.MaxFileBytes {
			return fmt.Sprintf("file %q exceeds maximum size of %d bytes", f.Name, cfg.MaxFileBytes)
		}
	}
	if req.TimeoutMs != nil {
		if *req.TimeoutMs < 0 {
			return "timeout_ms must not be negative"
		}
		if *req.TimeoutMs > maxTimeoutMs {
			return fmt.Sprintf("timeout_ms exceeds maximum of %d", maxTimeoutMs)
		}
	}
	return ""
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
