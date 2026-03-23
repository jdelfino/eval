// Package sandbox provides secure code execution using nsjail.
package sandbox

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
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

// javaClassNameRe matches the first public class declaration in Java source.
var javaClassNameRe = regexp.MustCompile(`public\s+class\s+(\w+)`)

// javacErrorRe matches javac error lines of the form "<ClassName>.java:N: error:".
// It captures the line number.
var javacErrorRe = regexp.MustCompile(`\w+\.java:(\d+):`)

// extractJavaClassName extracts the public class name from Java source code.
// Falls back to "Main" if no public class declaration is found.
func extractJavaClassName(code string) string {
	m := javaClassNameRe.FindStringSubmatch(code)
	if m == nil {
		return "Main"
	}
	return m[1]
}

// Config holds paths and limits for sandbox execution.
type Config struct {
	NsjailPath     string
	PythonPath     string
	JavaPath       string
	JavacPath      string
	MaxOutputBytes int
}

// Request describes what to execute inside the sandbox.
type Request struct {
	Code          string
	Stdin         string
	Files         []File
	TimeoutMs     int
	Args          []string // Additional arguments passed to the Python script.
	Language      string   // Target language: "", "python", or "java".
	InnerLanguage string   // Language of subprocesses spawned by the script (e.g. "java" for io_test_runner).
	IsCommand     bool     // When true, Code is a command string to execute directly (not source to compile).
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

// RunUnsafe executes code directly without nsjail sandboxing.
// Use only in environments where nsjail cannot run (CI, devcontainers).
// Provides timeout enforcement and output capture but no isolation.
func RunUnsafe(ctx context.Context, cfg Config, req Request) (*Result, error) {
	if req.Language == "java" {
		if req.IsCommand {
			return runUnsafeJavaCommand(ctx, cfg, req)
		}
		return runUnsafeJava(ctx, cfg, req)
	}

	tempDir, err := os.MkdirTemp("", "sandbox-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	mainPath := filepath.Join(tempDir, "main.py")
	if err := os.WriteFile(mainPath, []byte(req.Code), 0644); err != nil {
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

// runUnsafeJava executes Java code directly (no nsjail) for local dev / CI.
// Uses JEP 330 single-file source launcher to compile and run in one JVM.
func runUnsafeJava(ctx context.Context, cfg Config, req Request) (*Result, error) {
	tempDir, err := os.MkdirTemp("", "sandbox-java-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	className := extractJavaClassName(req.Code)
	javaFile := className + ".java"

	// Reject attached files that conflict with the generated source file.
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		if name == javaFile {
			return nil, fmt.Errorf("file name %q is reserved", f.Name)
		}
		p := filepath.Join(tempDir, name)
		if err := os.WriteFile(p, []byte(f.Content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write attached file %q: %w", name, err)
		}
	}

	mainPath := filepath.Join(tempDir, javaFile)
	if err := os.WriteFile(mainPath, []byte(req.Code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write %s: %w", javaFile, err)
	}

	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	maxOut := cfg.MaxOutputBytes
	if maxOut <= 0 {
		maxOut = MaxOutputBytes
	}

	start := time.Now()

	// Single-phase: compile and run in one JVM using JEP 330 source launcher.
	// This eliminates the second JVM startup that the old javac+java approach required.
	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer execCancel()

	javaCmd := exec.CommandContext(execCtx, cfg.JavaPath, "-XX:TieredStopAtLevel=1", mainPath)
	javaCmd.Dir = tempDir

	if req.Stdin != "" {
		javaCmd.Stdin = strings.NewReader(req.Stdin)
	}

	var stdoutBuf, stderrBuf limitedBuffer
	stdoutBuf.maxBytes = maxOut
	stderrBuf.maxBytes = maxOut
	javaCmd.Stdout = &stdoutBuf
	javaCmd.Stderr = &stderrBuf

	runErr := javaCmd.Run()
	duration := time.Since(start)

	exitCode := 0
	timedOut := false

	if runErr != nil {
		var pathErr *fs.PathError
		if errors.As(runErr, &pathErr) && execCtx.Err() == nil && ctx.Err() == nil {
			// Binary not found — infrastructure failure, not a code error.
			return nil, fmt.Errorf("java binary not found at %s: %w", cfg.JavaPath, runErr)
		}
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if execCtx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}
	if execCtx.Err() == context.DeadlineExceeded {
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

	stderr = sanitizeStderrJava(stderr, className)

	return &Result{
		Stdout:     stdout,
		Stderr:     stderr,
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// runUnsafeJavaCommand executes a pre-built Java command directly (no nsjail, no compilation).
// req.Code is a command string (e.g. "java -cp /path/to/tracer.jar JavaTracer") and req.Args
// are appended as additional arguments. Used for the Java tracer JAR invocation path.
func runUnsafeJavaCommand(ctx context.Context, cfg Config, req Request) (*Result, error) {
	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer execCancel()

	// Split the command string into binary + args.
	parts := strings.Fields(req.Code)
	if len(parts) == 0 {
		return nil, fmt.Errorf("IsCommand=true but Code is empty")
	}
	binary := parts[0]
	cmdArgs := append(parts[1:], req.Args...)

	cmd := exec.CommandContext(execCtx, binary, cmdArgs...)

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
	err := cmd.Run()
	duration := time.Since(start)

	exitCode := 0
	timedOut := false

	if err != nil {
		var pathErr *fs.PathError
		if errors.As(err, &pathErr) && execCtx.Err() == nil && ctx.Err() == nil {
			// Binary not found — infrastructure failure, not a code error.
			return nil, fmt.Errorf("command binary not found: %w", err)
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if execCtx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}
	if execCtx.Err() == context.DeadlineExceeded {
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

	return &Result{
		Stdout:     stdout,
		Stderr:     stderr,
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// Run executes code inside an nsjail sandbox.
func Run(ctx context.Context, cfg Config, req Request) (*Result, error) {
	if req.Language == "java" {
		if req.IsCommand {
			return runJavaCommand(ctx, cfg, req)
		}
		return runJava(ctx, cfg, req)
	}

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
	// MkdirTemp creates with 0700 but the sandboxed process runs as nobody
	// (uid 65534), so we widen to 0777 to allow writing output files.
	tempDir, err := os.MkdirTemp("", "sandbox-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()
	if err := os.Chmod(tempDir, 0777); err != nil {
		return nil, fmt.Errorf("failed to chmod temp directory: %w", err)
	}

	// Write main.py.
	mainPath := filepath.Join(tempDir, "main.py")
	if err := os.WriteFile(mainPath, []byte(req.Code), 0644); err != nil {
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
	// --disable_clone_newuser: Skip user namespace creation to avoid
	//   uid_map/gid_map write restrictions on GKE Ubuntu nodes
	//   (kernel.apparmor_restrict_unprivileged_userns).
	// --experimental_mnt old: Use legacy mount(2) syscall instead of
	//   mount_setattr which fails on "locked" mounts in containers.
	//
	// These flags are required for running nsjail inside GKE containers.
	// For environments where nsjail cannot run at all (CI, devcontainers),
	// use DISABLE_SANDBOX=true to run with RunUnsafe instead.
	//
	// When InnerLanguage is "java", the script will spawn a JVM subprocess.
	// The JVM requires more virtual address space than pure Python, so we use
	// --rlimit_as soft and add the Java-specific bind mounts.
	rlimitAS := "128"
	rlimitNProc := "10"
	if req.InnerLanguage == "java" {
		rlimitAS = "soft"
		rlimitNProc = "64"
	}
	args := []string{
		"--mode", "once",
		"--chroot", chrootDir,
		"--disable_clone_newuser",
		"--experimental_mnt", "old",
		"--user", "65534",
		"--group", "65534",
		"--time_limit", fmt.Sprintf("%d", timeoutSec),
		"--rlimit_as", rlimitAS,
		"--rlimit_fsize", "10",
		"--rlimit_nproc", rlimitNProc,
		"--cwd", "/tmp/work",
		"--bindmount_ro", "/usr/bin",
		"--bindmount_ro", "/usr/lib",
		"--bindmount_ro", "/lib",
		"--bindmount_ro", "/dev/null",
		"--bindmount_ro", "/dev/urandom",
		"--tmpfsmount", "/tmp",
		"--bindmount", tempDir + ":/tmp/work",
		"--env", "PATH=/usr/bin:/bin",
		"--env", "HOME=/tmp",
		"--env", "PYTHONDONTWRITEBYTECODE=1",
		"--env", "PYTHONUNBUFFERED=1",
		"--disable_proc",
		"--really_quiet",
		"--", cfg.PythonPath, "/tmp/work/main.py",
	}

	// Append extra arguments after main.py (used by the tracer script).
	if len(req.Args) > 0 {
		args = append(args, req.Args...)
	}

	// Add /lib64 bind mount if it exists (amd64 only; absent on arm64).
	if info, err := os.Stat("/lib64"); err == nil && info.IsDir() {
		args = appendBeforeTerminator(args, "--bindmount_ro", "/lib64")
	}
	// Add /usr/lib64 bind mount if it exists (needed on some distros).
	if info, err := os.Stat("/usr/lib64"); err == nil && info.IsDir() {
		args = appendBeforeTerminator(args, "--bindmount_ro", "/usr/lib64")
	}
	// Add Java-specific bind mounts when the script will spawn a JVM subprocess.
	if req.InnerLanguage == "java" {
		// /etc/ld.so.cache — pre-built dynamic linker cache used to find libjli.so
		if _, err := os.Stat("/etc/ld.so.cache"); err == nil {
			args = appendBeforeTerminator(args, "--bindmount_ro", "/etc/ld.so.cache")
		}
		// /etc/alternatives — Debian symlink targets for java/javac
		if info, err := os.Stat("/etc/alternatives"); err == nil && info.IsDir() {
			args = appendBeforeTerminator(args, "--bindmount_ro", "/etc/alternatives")
		}
		// /usr/lib/jvm — JDK installation (may already be covered by /usr/lib, but explicit is safer)
		if info, err := os.Stat("/usr/lib/jvm"); err == nil && info.IsDir() {
			args = appendBeforeTerminator(args, "--bindmount_ro", "/usr/lib/jvm")
		}
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

// runJava executes Java code inside an nsjail sandbox.
// Uses JEP 330 single-file source launcher to compile and run in one JVM.
func runJava(ctx context.Context, cfg Config, req Request) (*Result, error) {
	className := extractJavaClassName(req.Code)
	javaFile := className + ".java"

	// Validate attached filenames before doing any work.
	seen := make(map[string]string) // sanitized name -> original name
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		if name == javaFile {
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

	// Verify java binary exists before attempting execution.
	if _, err := os.Stat(cfg.JavaPath); err != nil {
		return nil, fmt.Errorf("java binary not found at %s: %w", cfg.JavaPath, err)
	}

	// Create temp directory for code and attached files.
	tempDir, err := os.MkdirTemp("", "sandbox-java-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()
	// Java source launcher needs write access for in-memory compilation artifacts.
	if err := os.Chmod(tempDir, 0777); err != nil {
		return nil, fmt.Errorf("failed to chmod temp directory: %w", err)
	}

	// Write the Java source file.
	mainPath := filepath.Join(tempDir, javaFile)
	if err := os.WriteFile(mainPath, []byte(req.Code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write %s: %w", javaFile, err)
	}

	// Write attached files with sanitized names.
	for _, f := range req.Files {
		name := sanitizeFilename(f.Name)
		p := filepath.Join(tempDir, name)
		if err := os.WriteFile(p, []byte(f.Content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write attached file %q: %w", name, err)
		}
	}

	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	maxOut := cfg.MaxOutputBytes
	if maxOut <= 0 {
		maxOut = MaxOutputBytes
	}

	start := time.Now()

	// Single-phase: compile and run in one JVM using JEP 330 source launcher.
	// This eliminates the second JVM startup that the old javac+java approach required.
	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second+2*time.Second)
	defer execCancel()

	execArgs := buildJavaArgsWithTimeLimit(tempDir, timeoutSec, []string{cfg.JavaPath, "-XX:TieredStopAtLevel=1", "/tmp/work/" + javaFile})

	execCmd := exec.CommandContext(execCtx, cfg.NsjailPath, execArgs...)

	if req.Stdin != "" {
		execCmd.Stdin = strings.NewReader(req.Stdin)
	} else {
		execCmd.Stdin = io.NopCloser(bytes.NewReader(nil))
	}

	var stdoutBuf, stderrBuf limitedBuffer
	stdoutBuf.maxBytes = maxOut
	stderrBuf.maxBytes = maxOut
	execCmd.Stdout = &stdoutBuf
	execCmd.Stderr = &stderrBuf

	runErr := execCmd.Run()
	duration := time.Since(start)

	exitCode := 0
	timedOut := false

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if execCtx.Err() != nil || ctx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}
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

	stderr = sanitizeStderrJava(stderr, className)

	// If stderr is empty and exit code is non-zero, nsjail itself failed
	// (--really_quiet suppresses its own error output). Return an error so the
	// handler returns HTTP 500 instead of HTTP 200 with an empty error string.
	if stderr == "" && !timedOut && exitCode != 0 {
		return nil, fmt.Errorf("nsjail failed with exit code %d (no stderr — likely nsjail infrastructure failure)", exitCode)
	}

	return &Result{
		Stdout:     stdout,
		Stderr:     stderr,
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// runJavaCommand executes a pre-built Java command inside an nsjail sandbox.
// req.Code is a command string (e.g. "java -cp /path/to/tracer.jar JavaTracer") and
// req.Args are appended as additional arguments. The nsjail invocation uses the same
// Java bind-mounts and resource limits as runJava, but skips compilation entirely.
func runJavaCommand(ctx context.Context, cfg Config, req Request) (*Result, error) {
	// Verify nsjail binary exists.
	if _, err := exec.LookPath(cfg.NsjailPath); err != nil {
		return nil, fmt.Errorf("nsjail binary not found at %s: %w", cfg.NsjailPath, err)
	}

	timeoutSec := int(math.Ceil(float64(req.TimeoutMs) / 1000.0))
	if timeoutSec < 1 {
		timeoutSec = 1
	}

	maxOut := cfg.MaxOutputBytes
	if maxOut <= 0 {
		maxOut = MaxOutputBytes
	}

	// Split the command string into binary + args, then append req.Args.
	parts := strings.Fields(req.Code)
	if len(parts) == 0 {
		return nil, fmt.Errorf("IsCommand=true but Code is empty")
	}
	command := append(parts, req.Args...)

	// Use an empty tempDir (no source files needed), but nsjail requires a bind mount.
	// We create a temporary directory just to satisfy the --bindmount requirement.
	tempDir, err := os.MkdirTemp("", "sandbox-java-cmd-")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()
	if err := os.Chmod(tempDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to chmod temp directory: %w", err)
	}

	execCtx, execCancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second+2*time.Second)
	defer execCancel()

	execArgs := buildJavaArgsWithTimeLimit(tempDir, timeoutSec, command)
	execCmd := exec.CommandContext(execCtx, cfg.NsjailPath, execArgs...)

	if req.Stdin != "" {
		execCmd.Stdin = strings.NewReader(req.Stdin)
	} else {
		execCmd.Stdin = io.NopCloser(bytes.NewReader(nil))
	}

	var stdoutBuf, stderrBuf limitedBuffer
	stdoutBuf.maxBytes = maxOut
	stderrBuf.maxBytes = maxOut
	execCmd.Stdout = &stdoutBuf
	execCmd.Stderr = &stderrBuf

	start := time.Now()
	runErr := execCmd.Run()
	duration := time.Since(start)

	exitCode := 0
	timedOut := false

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if execCtx.Err() != nil || ctx.Err() != nil {
			timedOut = true
			exitCode = -1
		}
	}
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

	// If stderr is empty and exit code is non-zero, nsjail itself failed
	// (--really_quiet suppresses its own error output). Return an error so the
	// handler returns HTTP 500 instead of HTTP 200 with an empty error string.
	if stderr == "" && !timedOut && exitCode != 0 {
		return nil, fmt.Errorf("nsjail execute step failed with exit code %d (no stderr — likely nsjail infrastructure failure)", exitCode)
	}

	return &Result{
		Stdout:     stdout,
		Stderr:     stderr,
		ExitCode:   exitCode,
		TimedOut:   timedOut,
		DurationMs: duration.Milliseconds(),
	}, nil
}

// buildJavaArgsWithTimeLimit constructs nsjail args for Java with the given time limit and command.
func buildJavaArgsWithTimeLimit(tempDir string, timeoutSec int, command []string) []string {
	a := []string{
		"--mode", "once",
		"--chroot", chrootDir,
		"--disable_clone_newuser",
		"--experimental_mnt", "old",
		"--user", "65534",
		"--group", "65534",
		"--time_limit", fmt.Sprintf("%d", timeoutSec),
		"--rlimit_as", "soft",
		"--rlimit_fsize", "10",
		"--rlimit_nproc", "64",
		"--cwd", "/tmp/work",
		"--bindmount_ro", "/usr/bin",
		"--bindmount_ro", "/usr/lib",
		"--bindmount_ro", "/lib",
		"--bindmount_ro", "/dev/null",
		"--bindmount_ro", "/dev/urandom",
		"--tmpfsmount", "/tmp",
		"--bindmount", tempDir + ":/tmp/work",
		"--env", "PATH=/usr/bin:/bin",
		"--env", "HOME=/tmp",
		"--disable_proc",
		"--really_quiet",
		"--",
	}
	// Add /lib64 bind mount if it exists (amd64 only; absent on arm64).
	if info, err := os.Stat("/lib64"); err == nil && info.IsDir() {
		a = appendBeforeTerminator(a, "--bindmount_ro", "/lib64")
	}
	// Add /etc/alternatives if it exists (Debian symlink targets for java/javac).
	if info, err := os.Stat("/etc/alternatives"); err == nil && info.IsDir() {
		a = appendBeforeTerminator(a, "--bindmount_ro", "/etc/alternatives")
	}
	// Add /etc/ld.so.cache so the dynamic linker finds JDK shared libraries (libjli.so).
	if _, err := os.Stat("/etc/ld.so.cache"); err == nil {
		a = appendBeforeTerminator(a, "--bindmount_ro", "/etc/ld.so.cache")
	}
	// Add Java config directories under /etc (e.g., /etc/java-17-openjdk).
	if entries, err := filepath.Glob("/etc/java-*"); err == nil {
		for _, entry := range entries {
			a = appendBeforeTerminator(a, "--bindmount_ro", entry)
		}
	}
	// Add /usr/lib/jvm if it exists (JDK installation).
	if info, err := os.Stat("/usr/lib/jvm"); err == nil && info.IsDir() {
		a = appendBeforeTerminator(a, "--bindmount_ro", "/usr/lib/jvm")
	}
	// Add /usr/lib64 if it exists.
	if info, err := os.Stat("/usr/lib64"); err == nil && info.IsDir() {
		a = appendBeforeTerminator(a, "--bindmount_ro", "/usr/lib64")
	}
	a = append(a, command...)
	return a
}

// sanitizeStderrJava sanitizes Java stderr by replacing internal file paths
// and converting javac error format to a cleaner form.
func sanitizeStderrJava(stderr string, className string) string {
	javaFile := className + ".java"
	// Replace "/tmp/work/<ClassName>.java:N:" with "Line N:".
	result := regexp.MustCompile(`/tmp/work/`+regexp.QuoteMeta(javaFile)+`:(\d+):`).
		ReplaceAllStringFunc(stderr, func(match string) string {
			// Extract line number.
			m := javacErrorRe.FindStringSubmatch(match)
			if m != nil {
				return "Line " + m[1] + ":"
			}
			return match
		})
	// Replace any remaining "/tmp/work/<ClassName>.java" references.
	result = strings.ReplaceAll(result, "/tmp/work/"+javaFile, "<student code>")
	// Replace any other /tmp/work/ paths.
	result = tmpWorkPathRe.ReplaceAllStringFunc(result, func(match string) string {
		filename := match[len("/tmp/work/"):]
		return filename
	})
	return result
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
	// Strip /tmp/work/ prefix from file paths so helper filenames are visible
	// but the sandbox path is hidden. main.py is the iotestrunner script (not
	// student code), so we let it through as-is — sandbox-level stderr only
	// appears when the runner itself crashes, not for student errors.
	result := tmpWorkPathRe.ReplaceAllStringFunc(stderr, func(match string) string {
		return match[len("/tmp/work/"):]
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
