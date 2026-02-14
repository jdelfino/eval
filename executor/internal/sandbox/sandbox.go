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
	"regexp"
	"strings"
	"time"
)

// MaxOutputBytes is the maximum size of stdout/stderr before truncation.
const MaxOutputBytes = 1024 * 1024 // 1 MB

// chrootDir is the empty directory used as the chroot root for nsjail.
// Only explicitly bind-mounted paths are visible inside the jail.
// This directory is created in the Dockerfile.
const chrootDir = "/sandbox-root"

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
	Args       []string // Additional arguments passed to the Python script.
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

// RunUnsafe executes Python code directly without nsjail sandboxing.
// Use only in environments where nsjail cannot run (CI, devcontainers).
// Provides timeout enforcement and output capture but no isolation.
func RunUnsafe(ctx context.Context, cfg Config, req Request) (*Result, error) {
	tempDir, err := os.MkdirTemp("", "sandbox-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	code := req.Code
	if req.RandomSeed != nil {
		code = fmt.Sprintf("import random\nrandom.seed(%d)\n", *req.RandomSeed) + code
	}

	mainPath := filepath.Join(tempDir, "main.py")
	if err := os.WriteFile(mainPath, []byte(code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write main.py: %w", err)
	}

	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		if name == "main.py" {
			return nil, fmt.Errorf("file name %q is reserved", f.Name)
		}
		p := filepath.Join(tempDir, name)
		if err := os.WriteFile(p, []byte(f.Content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write attached file %q: %w", name, err)
		}
	}

	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer execCancel()

	args := []string{mainPath}
	args = append(args, req.Args...)

	cmd := exec.CommandContext(execCtx, cfg.PythonPath, args...)
	cmd.Dir = tempDir

	if req.Stdin != "" {
		cmd.Stdin = strings.NewReader(req.Stdin)
	}

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
		} else if execCtx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}

	// Detect timeout via context deadline (Go killed the process).
	if execCtx.Err() == context.DeadlineExceeded {
		timedOut = true
	}

	return &Result{
		Stdout:     stdoutBuf.String(),
		Stderr:     stderrBuf.String(),
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// Run executes Python code inside an nsjail sandbox.
func Run(ctx context.Context, cfg Config, req Request) (*Result, error) {
	// Validate attached filenames before doing any work.
	seen := make(map[string]string) // sanitized name -> original name
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		if name == "main.py" {
			return nil, fmt.Errorf("file name %q is reserved", f.Name)
		}
		if orig, ok := seen[name]; ok {
			return nil, fmt.Errorf("duplicate filename: %q and %q both sanitize to %q", orig, f.Name, name)
		}
		seen[name] = f.Name
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
	// Use an empty chroot so only explicitly bind-mounted paths are visible.
	//
	// NOTE: nsjail requires host-level kernel namespace support and fails in
	// nested container environments (Docker-in-Docker, CI runners, devcontainers).
	// For those environments, use DISABLE_SANDBOX=true to run with RunUnsafe instead.
	// See: https://github.com/google/nsjail/issues/238
	args := []string{
		"--mode", "once",
		"--chroot", chrootDir,
		"--user", "65534",
		"--group", "65534",
		"--time_limit", fmt.Sprintf("%d", timeoutSec),
		"--rlimit_as", "128",
		"--rlimit_fsize", "10",
		"--rlimit_nproc", "10",
		"--cwd", "/tmp/work",
		"--bindmount_ro", cfg.PythonPath,
		"--bindmount_ro", "/usr/lib",
		"--bindmount_ro", "/lib",
		"--bindmount_ro", "/dev/null",
		"--bindmount_ro", "/dev/urandom",
		"--bindmount", tempDir + ":/tmp/work",
		"--env", "PATH=/usr/bin:/bin",
		"--env", "HOME=/tmp",
		"--env", "PYTHONDONTWRITEBYTECODE=1",
		"--env", "PYTHONUNBUFFERED=1",
		"--really_quiet",
		"--", cfg.PythonPath, "/tmp/work/main.py",
	}

	// Append extra arguments after main.py (used by the tracer script).
	if len(req.Args) > 0 {
		args = append(args, req.Args...)
	}

	// Add /usr/lib64 bind mount if it exists (needed on some distros).
	if info, err := os.Stat("/usr/lib64"); err == nil && info.IsDir() {
		args = appendBeforeTerminator(args, "--bindmount_ro", "/usr/lib64")
	}

	// Create a derived context with a deadline so that if nsjail hangs beyond
	// its own time_limit, the Go process will kill it. The 2-second buffer
	// accounts for nsjail startup/teardown overhead.
	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second+2*time.Second)
	defer execCancel()

	// Create command with the deadline context.
	cmd := exec.CommandContext(execCtx, cfg.NsjailPath, args...)

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
		} else if execCtx.Err() != nil || ctx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}

	// Detect timeout via context deadline (Go killed the process) or
	// nsjail's own SIGKILL (exit code 137).
	if execCtx.Err() == context.DeadlineExceeded || ctx.Err() == context.DeadlineExceeded {
		timedOut = true
	}
	if exitCode == 137 {
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
	// Replace null bytes.
	s = strings.ReplaceAll(s, "\x00", "_")
	// Replace leading dots.
	for len(s) > 0 && s[0] == '.' {
		s = "_" + s[1:]
	}
	if strings.TrimSpace(s) == "" {
		return "unnamed_file.txt"
	}
	return s
}

// tmpWorkPathRe matches /tmp/work/<filename> in both quoted and unquoted contexts.
var tmpWorkPathRe = regexp.MustCompile(`/tmp/work/([^\s"',;:)\]]+)`)

// sanitizeStderr cleans error output to hide internal paths and OS details.
func sanitizeStderr(stderr string) string {
	// Replace all /tmp/work/<file> paths.
	result := tmpWorkPathRe.ReplaceAllStringFunc(stderr, func(match string) string {
		filename := match[len("/tmp/work/"):]
		if filename == "main.py" {
			return "<student code>"
		}
		return filename
	})

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

// appendBeforeTerminator inserts flag and value before the "--" terminator in args.
func appendBeforeTerminator(args []string, flag, value string) []string {
	for i, a := range args {
		if a == "--" {
			result := make([]string, 0, len(args)+2)
			result = append(result, args[:i]...)
			result = append(result, flag, value)
			result = append(result, args[i:]...)
			return result
		}
	}
	// No terminator found; append at end (shouldn't happen).
	return append(args, flag, value)
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
