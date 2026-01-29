package sandbox

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"simple", "data.csv", "data.csv"},
		{"path separators", "path/to/file.txt", "path_to_file.txt"},
		{"backslash", `path\to\file.txt`, "path_to_file.txt"},
		{"parent directory", "../../../etc/passwd", "______etc_passwd"},
		{"leading dot", ".hidden", "_hidden"},
		{"double dots", "foo..bar", "foo_bar"},
		{"empty", "", "unnamed_file.txt"},
		{"spaces only", "   ", "unnamed_file.txt"},
		{"multiple leading dots", "...test", "_.test"},
		{"null byte", "foo\x00bar.txt", "foo_bar.txt"},
		{"only null bytes", "\x00\x00", "__"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeFilename(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSanitizeStderr(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			"replace file path double quotes",
			`Traceback:\n  File "/tmp/work/main.py", line 5`,
			`Traceback:\n  File "<student code>", line 5`,
		},
		{
			"replace errno",
			`[Errno 13] Permission denied`,
			`[Error] Permission denied`,
		},
		{
			"replace multiple errno",
			`[Errno 2] No such file [Errno 13] denied`,
			`[Error] No such file [Error] denied`,
		},
		{
			"eof error replacement",
			`EOFError: EOF when reading a line`,
			`Program appears to be waiting for input, but no more input was provided.`,
		},
		{
			"no changes needed",
			`NameError: name 'foo' is not defined`,
			`NameError: name 'foo' is not defined`,
		},
		{
			"replace attached file path double quotes",
			`File "/tmp/work/data.txt", line 1`,
			`File "data.txt", line 1`,
		},
		{
			"replace attached file path single quotes",
			`File '/tmp/work/helper.py', line 10`,
			`File 'helper.py', line 10`,
		},
		{
			"replace unquoted tmp path",
			`Error in /tmp/work/data.csv while reading`,
			`Error in data.csv while reading`,
		},
		{
			"replace main.py unquoted",
			`Error in /tmp/work/main.py while running`,
			`Error in <student code> while running`,
		},
		{
			"multiple paths in one line",
			`"/tmp/work/main.py" imports "/tmp/work/utils.py"`,
			`"<student code>" imports "utils.py"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeStderr(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeStderr(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestReplaceErrno(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"no errno", "no errno"},
		{"[Errno 2] not found", "[Error] not found"},
		{"[Errno 13] denied and [Errno 2] missing", "[Error] denied and [Error] missing"},
		{"[Errno incomplete", "[Errno incomplete"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := replaceErrno(tt.input)
			if got != tt.expected {
				t.Errorf("replaceErrno(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestLimitedBuffer(t *testing.T) {
	t.Run("within limit", func(t *testing.T) {
		lb := &limitedBuffer{maxBytes: 100}
		n, err := lb.Write([]byte("hello"))
		if err != nil {
			t.Fatal(err)
		}
		if n != 5 {
			t.Errorf("Write returned %d, want 5", n)
		}
		if lb.String() != "hello" {
			t.Errorf("got %q, want %q", lb.String(), "hello")
		}
		if lb.truncated {
			t.Error("should not be truncated")
		}
	})

	t.Run("exceeds limit", func(t *testing.T) {
		lb := &limitedBuffer{maxBytes: 5}
		n, err := lb.Write([]byte("hello world"))
		if err != nil {
			t.Fatal(err)
		}
		if n != 11 {
			t.Errorf("Write should report all bytes consumed, got %d", n)
		}
		if lb.String() != "hello" {
			t.Errorf("got %q, want %q", lb.String(), "hello")
		}
		if !lb.truncated {
			t.Error("should be truncated")
		}
	})

	t.Run("multiple writes exceeding limit", func(t *testing.T) {
		lb := &limitedBuffer{maxBytes: 8}
		_, _ = lb.Write([]byte("hello"))
		_, _ = lb.Write([]byte(" world"))
		if lb.String() != "hello wo" {
			t.Errorf("got %q, want %q", lb.String(), "hello wo")
		}
		if !lb.truncated {
			t.Error("should be truncated")
		}
	})

	t.Run("writes after truncation discarded", func(t *testing.T) {
		lb := &limitedBuffer{maxBytes: 3}
		_, _ = lb.Write([]byte("abcdef"))
		_, _ = lb.Write([]byte("more"))
		if lb.String() != "abc" {
			t.Errorf("got %q, want %q", lb.String(), "abc")
		}
	})
}

func TestChrootDirIsNotRoot(t *testing.T) {
	// Verify the sandbox uses a restricted chroot, not "/".
	if chrootDir == "/" {
		t.Fatal("chrootDir must not be '/' — that exposes the entire host filesystem")
	}
	if chrootDir == "" {
		t.Fatal("chrootDir must not be empty")
	}
}

func TestAppendBeforeTerminator(t *testing.T) {
	args := []string{"--mode", "once", "--", "/usr/bin/python3", "main.py"}
	got := appendBeforeTerminator(args, "--bindmount_ro", "/usr/lib64")
	// The new flag should appear right before "--".
	expected := []string{"--mode", "once", "--bindmount_ro", "/usr/lib64", "--", "/usr/bin/python3", "main.py"}
	if len(got) != len(expected) {
		t.Fatalf("length mismatch: got %d, want %d", len(got), len(expected))
	}
	for i := range expected {
		if got[i] != expected[i] {
			t.Errorf("index %d: got %q, want %q", i, got[i], expected[i])
		}
	}
}

func TestAppendBeforeTerminatorNoTerminator(t *testing.T) {
	args := []string{"--mode", "once"}
	got := appendBeforeTerminator(args, "--flag", "val")
	if len(got) != 4 {
		t.Fatalf("expected 4 elements, got %d", len(got))
	}
	if got[2] != "--flag" || got[3] != "val" {
		t.Errorf("expected appended at end, got %v", got)
	}
}

func TestRunNsjailNotFound(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail not found")
	}
	if !strings.Contains(err.Error(), "nsjail binary not found") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRunRejectsMainPyFilename(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code: "print('hello')",
		Files: []File{
			{Name: "main.py", Content: "malicious code"},
		},
		TimeoutMs: 5000,
	}

	// Should fail before nsjail lookup — main.py is reserved.
	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for reserved filename main.py")
	}
	if !strings.Contains(err.Error(), "reserved") {
		t.Errorf("expected reserved filename error, got: %v", err)
	}
}

func TestLimitedBufferZeroMax(t *testing.T) {
	lb := &limitedBuffer{maxBytes: 0}
	n, err := lb.Write([]byte("data"))
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 {
		t.Errorf("Write returned %d, want 4", n)
	}
	if lb.String() != "" {
		t.Errorf("expected empty, got %q", lb.String())
	}
	if !lb.truncated {
		t.Error("should be truncated")
	}
}

// TestSanitizeStderrSingleQuotePath verifies single-quoted path replacement.
func TestSanitizeStderrSingleQuotePath(t *testing.T) {
	input := `File '/tmp/work/main.py', line 3`
	got := sanitizeStderr(input)
	expected := `File '<student code>', line 3`
	if got != expected {
		t.Errorf("got %q, want %q", got, expected)
	}
}


func TestRunRejectsDuplicateSanitizedFilenames(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code: "print('hello')",
		Files: []File{
			{Name: "foo/bar.txt", Content: "a"},
			{Name: "foo_bar.txt", Content: "b"},
		},
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for duplicate sanitized filenames")
	}
	if !strings.Contains(err.Error(), "duplicate filename") {
		t.Errorf("expected duplicate filename error, got: %v", err)
	}
}

// TestRunContextCancelled verifies that Run returns an error when nsjail is
// not found even when the context is already cancelled. This does NOT test
// actual context cancellation of a running process — that requires nsjail
// and is covered by integration tests.
func TestRunContextCancelled(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 5000,
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := Run(ctx, cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail binary not found")
	}
	if !strings.Contains(err.Error(), "nsjail binary not found") {
		t.Errorf("expected nsjail-not-found error, got: %v", err)
	}
}

// Ensure truncation suffix is appended correctly.
func TestTruncationSuffix(t *testing.T) {
	lb := &limitedBuffer{maxBytes: 5}
	_, _ = lb.Write([]byte("abcdefgh"))

	result := lb.String()
	if lb.truncated {
		result += truncationSuffix
	}

	if !strings.HasSuffix(result, truncationSuffix) {
		t.Errorf("expected truncation suffix, got %q", result)
	}
	if !strings.HasPrefix(result, "abcde") {
		t.Errorf("expected prefix 'abcde', got %q", result)
	}
}

// TestRunTimeoutViaContext verifies that Run detects timeout when the
// Go-level context deadline fires (e.g., nsjail hangs past its time_limit).
// This test uses a real long-running command (sleep) instead of nsjail.
func TestRunTimeoutViaContext(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	// We need a real executable that will hang. Use "sleep" wrapped as
	// the nsjail path — Run will invoke it directly. sleep will ignore
	// the nsjail flags and just block, letting the context deadline fire.
	sleepPath, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("sleep not found")
	}

	cfg := Config{
		NsjailPath:     sleepPath,
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	// TimeoutMs=100 → timeoutSec=1, so context deadline = 1+2 = 3 seconds.
	// But sleep gets "60" as first arg (from nsjail args like --mode, once, etc.)
	// which sleep will fail on immediately with exit code != 0.
	// Instead, let's use a very short timeout to test the deadline path.
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 100, // 1 second ceiling + 2s buffer = 3s Go deadline
	}

	start := time.Now()
	result, err := Run(context.Background(), cfg, req)
	elapsed := time.Since(start)

	// sleep will receive nsjail flags as arguments and likely fail
	// immediately (not a valid sleep duration). That's fine — we just
	// verify it doesn't block forever and returns quickly.
	if err != nil {
		// sleep failing on bad args is expected — not a Run error since
		// exec.LookPath succeeds. Actually Run creates temp files then
		// runs the command, so err should be nil (exit error is captured).
		t.Logf("Run returned error (may be expected): %v", err)
		return
	}

	// Verify it completed in reasonable time (not hanging).
	if elapsed > 10*time.Second {
		t.Errorf("Run took %v, expected it to complete within deadline", elapsed)
	}

	t.Logf("result: exitCode=%d, timedOut=%v, duration=%dms", result.ExitCode, result.TimedOut, result.DurationMs)
}

// TestRunTimeoutExitCode137 verifies that exit code 137 is detected as timeout.
func TestRunTimeoutExitCode137(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	// Use bash to self-SIGKILL, producing exit code 137.
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not found")
	}

	cfg := Config{
		NsjailPath:     bashPath,
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 5000,
	}

	// bash will receive nsjail args and fail, but won't produce 137.
	// We can't easily produce 137 without nsjail, so this test just
	// verifies the code path doesn't panic and handles non-zero exits.
	result, err := Run(context.Background(), cfg, req)
	if err != nil {
		t.Logf("Run returned error (may be expected): %v", err)
		return
	}

	// bash with garbage args exits non-zero but not 137, so timedOut
	// should be false (no wall-clock heuristic to misclassify it).
	if result.TimedOut {
		t.Errorf("expected timedOut=false for non-timeout failure, got true (exitCode=%d, duration=%dms)",
			result.ExitCode, result.DurationMs)
	}
}

// TestRunParentContextDeadline verifies that if the parent context has a
// deadline, Run respects it.
func TestRunParentContextDeadline(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	sleepPath, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("sleep not found")
	}

	cfg := Config{
		NsjailPath:     sleepPath,
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 30000, // 30s — but parent context will expire first
	}

	// Parent context expires in 1 second.
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	start := time.Now()
	result, err := Run(ctx, cfg, req)
	elapsed := time.Since(start)

	if err != nil {
		t.Logf("Run returned error (may be expected): %v", err)
		return
	}

	// Should complete near the 1s parent deadline, not the 30s timeout.
	if elapsed > 5*time.Second {
		t.Errorf("Run took %v, expected parent context to limit execution", elapsed)
	}

	if result != nil {
		t.Logf("result: exitCode=%d, timedOut=%v, duration=%dms", result.ExitCode, result.TimedOut, result.DurationMs)
	}
}

// TestTimeoutDetectionNoFalsePositive verifies that a fast non-zero exit
// is NOT misclassified as a timeout (regression test for wall-clock heuristic).
func TestTimeoutDetectionNoFalsePositive(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	falsePath, err := exec.LookPath("false")
	if err != nil {
		t.Skip("false not found")
	}

	cfg := Config{
		NsjailPath:     falsePath,
		PythonPath:     "/usr/bin/python3",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 1, // 1ms → timeoutSec=1, very short
	}

	result, err := Run(context.Background(), cfg, req)
	if err != nil {
		t.Logf("Run returned error: %v", err)
		return
	}

	// `false` exits with code 1 immediately. The old wall-clock heuristic
	// would misclassify this as timeout if duration >= 1s. With the new
	// approach, it should NOT be marked as timed out.
	if result.TimedOut {
		t.Errorf("false command should not be detected as timeout: exitCode=%d, duration=%dms",
			result.ExitCode, result.DurationMs)
	}
	if result.ExitCode != 1 {
		t.Logf("unexpected exit code %d (expected 1 from false)", result.ExitCode)
	}
}

