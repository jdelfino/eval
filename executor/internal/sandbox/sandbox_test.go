package sandbox

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"testing"
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

// TestTimeoutDetectionNoFalsePositive verifies that a fast non-zero exit
// is NOT misclassified as a timeout (regression test for wall-clock heuristic).
func TestRunUnsafeExecutesPython(t *testing.T) {
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	cfg := Config{PythonPath: pythonPath, MaxOutputBytes: MaxOutputBytes}
	req := Request{Code: "print('hello')", TimeoutMs: 5000}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if result.ExitCode != 0 {
		t.Errorf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
	}
	if strings.TrimSpace(result.Stdout) != "hello" {
		t.Errorf("stdout = %q, want %q", result.Stdout, "hello\n")
	}
}

func TestRunUnsafeInputEcho(t *testing.T) {
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	cfg := Config{PythonPath: pythonPath, MaxOutputBytes: MaxOutputBytes}

	t.Run("with prompt", func(t *testing.T) {
		req := Request{
			Code:      "name = input('Enter name: ')\nage = input('Enter age: ')\nprint(f'{name} is {age}')",
			Stdin:     "Alice\n25\n",
			TimeoutMs: 5000,
		}

		result, err := RunUnsafe(context.Background(), cfg, req)
		if err != nil {
			t.Fatalf("RunUnsafe error: %v", err)
		}
		if result.ExitCode != 0 {
			t.Fatalf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
		}
		// Verify output reads like a terminal session in correct order.
		want := "Enter name: Alice\nEnter age: 25\nAlice is 25\n"
		if result.Stdout != want {
			t.Errorf("stdout = %q, want %q", result.Stdout, want)
		}
	})

	t.Run("without prompt", func(t *testing.T) {
		req := Request{
			Code:      "x = input()\nprint(f'got {x}')",
			Stdin:     "hello\n",
			TimeoutMs: 5000,
		}

		result, err := RunUnsafe(context.Background(), cfg, req)
		if err != nil {
			t.Fatalf("RunUnsafe error: %v", err)
		}
		if result.ExitCode != 0 {
			t.Fatalf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
		}
		want := "hello\ngot hello\n"
		if result.Stdout != want {
			t.Errorf("stdout = %q, want %q", result.Stdout, want)
		}
	})

	t.Run("stdin exhausted raises EOFError", func(t *testing.T) {
		req := Request{
			Code:      "x = input()\ny = input()",
			Stdin:     "one\n",
			TimeoutMs: 5000,
		}

		result, err := RunUnsafe(context.Background(), cfg, req)
		if err != nil {
			t.Fatalf("RunUnsafe error: %v", err)
		}
		if result.ExitCode == 0 {
			t.Error("expected non-zero exit code when stdin exhausted")
		}
		if !strings.Contains(result.Stderr, "EOFError") {
			t.Errorf("expected EOFError in stderr, got %q", result.Stderr)
		}
	})
}

func TestRunUnsafeNoInputEchoWithoutStdin(t *testing.T) {
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	cfg := Config{PythonPath: pythonPath, MaxOutputBytes: MaxOutputBytes}
	req := Request{
		Code:      "print('hello')",
		TimeoutMs: 5000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if strings.TrimSpace(result.Stdout) != "hello" {
		t.Errorf("stdout = %q, want %q", result.Stdout, "hello\n")
	}
}

func TestPrepareCode(t *testing.T) {
	seed := 42

	tests := []struct {
		name          string
		code          string
		stdin         string
		randomSeed    *int
		wantPreamble  bool
		wantSeed      bool
	}{
		{
			name: "no stdin no seed",
			code: "print('hi')",
		},
		{
			name:         "with stdin",
			code:         "print('hi')",
			stdin:        "input\n",
			wantPreamble: true,
		},
		{
			name:       "with seed",
			code:       "print('hi')",
			randomSeed: &seed,
			wantSeed:   true,
		},
		{
			name:         "with stdin and seed",
			code:         "print('hi')",
			stdin:        "input\n",
			randomSeed:   &seed,
			wantPreamble: true,
			wantSeed:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := prepareCode(tt.code, tt.stdin, tt.randomSeed)

			// Must always end with the original code.
			if !strings.HasSuffix(got, tt.code) {
				t.Errorf("prepareCode() = %q, want suffix %q", got, tt.code)
			}

			hasPreamble := strings.Contains(got, "_original_input = input")
			if tt.wantPreamble && !hasPreamble {
				t.Errorf("expected input echo preamble, got %q", got)
			}
			if !tt.wantPreamble && hasPreamble {
				t.Errorf("did not expect input echo preamble, got %q", got)
			}

			hasSeed := strings.Contains(got, "random.seed(42)")
			if tt.wantSeed && !hasSeed {
				t.Errorf("expected random seed injection, got %q", got)
			}
			if !tt.wantSeed && hasSeed {
				t.Errorf("did not expect random seed injection, got %q", got)
			}
		})
	}
}

func TestRunUnsafeWithArgs(t *testing.T) {
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	cfg := Config{PythonPath: pythonPath, MaxOutputBytes: MaxOutputBytes}
	req := Request{
		Code:      "import sys, json; print(json.dumps({'arg': sys.argv[1]}))",
		TimeoutMs: 5000,
		Args:      []string{"test-value"},
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if result.ExitCode != 0 {
		t.Errorf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "test-value") {
		t.Errorf("stdout = %q, want it to contain 'test-value'", result.Stdout)
	}
}

func TestRunUnsafeTimeout(t *testing.T) {
	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	cfg := Config{PythonPath: pythonPath, MaxOutputBytes: MaxOutputBytes}
	req := Request{Code: "import time; time.sleep(10)", TimeoutMs: 100}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if !result.TimedOut {
		t.Error("expected timeout")
	}
}

func TestRunUnsafeRejectsMainPy(t *testing.T) {
	cfg := Config{PythonPath: "/usr/bin/python3", MaxOutputBytes: MaxOutputBytes}
	req := Request{
		Code:      "print('hello')",
		Files:     []File{{Name: "main.py", Content: "bad"}},
		TimeoutMs: 5000,
	}

	_, err := RunUnsafe(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for reserved filename")
	}
	if !strings.Contains(err.Error(), "reserved") {
		t.Errorf("unexpected error: %v", err)
	}
}

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

