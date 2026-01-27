// Package sandbox provides secure Python code execution using nsjail.
package sandbox

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// MaxOutputBytes is the maximum size of stdout/stderr before truncation.
const MaxOutputBytes = 1024 * 1024 // 1 MB

// truncationSuffix is appended when output is truncated.
const truncationSuffix = "\n... [output truncated]"

// Config holds paths and limits for sandbox execution.
type Config struct {
	NsjailPath     string
	PythonPath     string
	MaxOutputBytes int
}

// Request describes what to execute inside the sandbox.
type Request struct {
	Code       string
	Stdin      string
	Files      []File
	RandomSeed *int
	TimeoutMs  int
}

// File is an attached file available to the executed program.
type File struct {
	Name    string
	Content string
}

// Result is the outcome of a sandbox execution.
type Result struct {
	Stdout     string
	Stderr     string
	ExitCode   int
	TimedOut   bool
	DurationMs int64
}

// Run executes Python code inside an nsjail sandbox.
func Run(ctx context.Context, cfg Config, req Request) (*Result, error) {
	// Validate attached filenames before doing any work.
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		if name == "main.py" {
			return nil, fmt.Errorf("file name %q is reserved", f.Name)
		}
	}

	// Verify nsjail binary exists.
	if _, err := exec.LookPath(cfg.NsjailPath); err != nil {
		return nil, fmt.Errorf("nsjail binary not found at %s: %w", cfg.NsjailPath, err)
	}

	// Create temp directory for code and attached files.
	tempDir, err := os.MkdirTemp("", "sandbox-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	// Prepare code with optional random seed injection.
	code := req.Code
	if req.RandomSeed != nil {
		code = fmt.Sprintf("import random\nrandom.seed(%d)\n", *req.RandomSeed) + code
	}

	// Write main.py.
	mainPath := filepath.Join(tempDir, "main.py")
	if err := os.WriteFile(mainPath, []byte(code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write main.py: %w", err)
	}

	// Write attached files with sanitized names.
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		p := filepath.Join(tempDir, name)
		if err := os.WriteFile(p, []byte(f.Content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write attached file %q: %w", name, err)
		}
	}

	// Compute timeout in seconds (ceiling).
	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	// Build nsjail arguments.
	args := []string{
		"--mode", "once",
		"--chroot", "/",
		"--user", "65534",
		"--group", "65534",
		"--time_limit", fmt.Sprintf("%d", timeoutSec),
		"--rlimit_as", "128",
		"--rlimit_fsize", "10",
		"--rlimit_nproc", "10",
		"--cwd", "/tmp/work",
		"--bindmount_ro", cfg.PythonPath,
		"--bindmount_ro", "/usr/lib",
		"--bindmount", tempDir + ":/tmp/work",
		"--env", "PATH=/usr/bin:/bin",
		"--env", "HOME=/tmp",
		"--env", "PYTHONDONTWRITEBYTECODE=1",
		"--env", "PYTHONUNBUFFERED=1",
		"--disable_clone_newnet",
		"--really_quiet",
		"--", cfg.PythonPath, "/tmp/work/main.py",
	}

	// Create command with context for cancellation.
	cmd := exec.CommandContext(ctx, cfg.NsjailPath, args...)

	// Set up stdin.
	if req.Stdin != "" {
		cmd.Stdin = strings.NewReader(req.Stdin)
	} else {
		cmd.Stdin = io.NopCloser(bytes.NewReader(nil))
	}

	// Capture stdout and stderr with size limits.
	maxOut := cfg.MaxOutputBytes
	if maxOut <= 0 {
		maxOut = MaxOutputBytes
	}
	var stdoutBuf, stderrBuf limitedBuffer
	stdoutBuf.maxBytes = maxOut
	stderrBuf.maxBytes = maxOut
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	err = cmd.Run()
	duration := time.Since(start)

	exitCode := 0
	timedOut := false

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if ctx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}

	// nsjail kills the process on time_limit and returns exit code 137 (SIGKILL).
	// Also detect if the wall-clock time is close to the timeout.
	if exitCode == 137 || (exitCode != 0 && duration >= time.Duration(timeoutSec)*time.Second) {
		timedOut = true
	}

	stdout := stdoutBuf.String()
	stderr := stderrBuf.String()

	if stdoutBuf.truncated {
		stdout += truncationSuffix
	}
	if stderrBuf.truncated {
		stderr += truncationSuffix
	}

	// Sanitize stderr.
	stderr = sanitizeStderr(stderr)

	return &Result{
		Stdout:     stdout,
		Stderr:     stderr,
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// sanitizeFilename removes path separators and dangerous patterns from filenames.
func sanitizeFilename(name string) string {
	s := name
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "\\", "_")
	s = strings.ReplaceAll(s, "..", "_")
	// Replace leading dots.
	for len(s) > 0 && s[0] == '.' {
		s = "_" + s[1:]
	}
	if strings.TrimSpace(s) == "" {
		return "unnamed_file.txt"
	}
	return s
}

// sanitizeStderr cleans error output to hide internal paths and OS details.
func sanitizeStderr(stderr string) string {
	// Replace file paths.
	result := stderr
	// Replace /tmp/work/main.py paths with <student code>.
	result = strings.ReplaceAll(result, `"/tmp/work/main.py"`, `"<student code>"`)
	// Also handle single-quoted variants.
	result = strings.ReplaceAll(result, `'/tmp/work/main.py'`, `'<student code>'`)

	// Replace [Errno N] with [Error].
	result = replaceErrno(result)

	// Check for EOFError about reading a line.
	if strings.Contains(result, "EOFError") && strings.Contains(result, "reading a line") {
		result = "Program appears to be waiting for input, but no more input was provided."
	}

	return result
}

// replaceErrno replaces all occurrences of [Errno N] with [Error].
func replaceErrno(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for {
		idx := strings.Index(s, "[Errno ")
		if idx == -1 {
			b.WriteString(s)
			break
		}
		b.WriteString(s[:idx])
		rest := s[idx+len("[Errno "):]
		end := strings.Index(rest, "]")
		if end == -1 {
			b.WriteString(s[idx:])
			break
		}
		b.WriteString("[Error]")
		s = rest[end+1:]
	}
	return b.String()
}

// limitedBuffer is a bytes.Buffer that stops accepting writes after maxBytes.
type limitedBuffer struct {
	buf       bytes.Buffer
	maxBytes  int
	truncated bool
}

func (lb *limitedBuffer) Write(p []byte) (int, error) {
	if lb.truncated {
		return len(p), nil // discard silently
	}
	remaining := lb.maxBytes - lb.buf.Len()
	if remaining <= 0 {
		lb.truncated = true
		return len(p), nil
	}
	if len(p) > remaining {
		lb.buf.Write(p[:remaining])
		lb.truncated = true
		return len(p), nil
	}
	return lb.buf.Write(p)
}

func (lb *limitedBuffer) String() string {
	return lb.buf.String()
}
