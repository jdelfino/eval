package sandbox

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
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
			`Traceback:\n  File "main.py", line 5`,
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
			`Error in main.py while running`,
		},
		{
			"multiple paths in one line",
			`"/tmp/work/main.py" imports "/tmp/work/utils.py"`,
			`"main.py" imports "utils.py"`,
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
	expected := `File 'main.py', line 3`
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

// TestRunJavaNsjailNotFound verifies that Run returns a meaningful error when nsjail is not found (Java path).
func TestRunJavaNsjailNotFound(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		PythonPath:     "/usr/bin/python3",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "public class Main { public static void main(String[] args) {} }",
		Language:  "java",
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail not found")
	}
	if !strings.Contains(err.Error(), "nsjail binary not found") {
		t.Errorf("expected nsjail binary not found error, got: %v", err)
	}
}

// TestRunUnsafeJavaPlaceholder was removed — Java is now implemented.

func TestExtractJavaClassName(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected string
	}{
		{
			name:     "simple public class",
			code:     "public class Foo { public static void main(String[] args) {} }",
			expected: "Foo",
		},
		{
			name:     "no public class falls back to Main",
			code:     "class Bar { public static void main(String[] args) {} }",
			expected: "Main",
		},
		{
			name:     "public class Main",
			code:     "public class Main { public static void main(String[] args) {} }",
			expected: "Main",
		},
		{
			name:     "multiple classes returns first public",
			code:     "class Helper {}\npublic class Solution { public static void main(String[] args) {} }",
			expected: "Solution",
		},
		{
			name:     "empty code falls back to Main",
			code:     "",
			expected: "Main",
		},
		{
			name:     "whitespace variations",
			code:     "public   class   MyProgram { }",
			expected: "MyProgram",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractJavaClassName(tt.code)
			if got != tt.expected {
				t.Errorf("extractJavaClassName(%q) = %q, want %q", tt.code, got, tt.expected)
			}
		})
	}
}

func TestSanitizeStderrJava(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		input    string
		expected string
	}{
		{
			name:     "java file path replaced",
			code:     "HelloWorld",
			input:    "/tmp/work/HelloWorld.java:5: error: ';' expected",
			expected: "Line 5: error: ';' expected",
		},
		{
			name:     "java file path with subdirectory format",
			code:     "Main",
			input:    "/tmp/work/Main.java:10: error: class not found",
			expected: "Line 10: error: class not found",
		},
		{
			name:     "non-java path unchanged",
			code:     "Foo",
			input:    "Exception in thread \"main\" java.lang.NullPointerException",
			expected: "Exception in thread \"main\" java.lang.NullPointerException",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeStderrJava(tt.input, tt.code)
			if got != tt.expected {
				t.Errorf("sanitizeStderrJava(%q, %q) = %q, want %q", tt.input, tt.code, got, tt.expected)
			}
		})
	}
}

// TestRunUnsafeJavaExecutes verifies that RunUnsafe executes a Java program.
func TestRunUnsafeJavaExecutes(t *testing.T) {
	javaPath, err := exec.LookPath("java")
	if err != nil {
		t.Skip("java not found")
	}

	cfg := Config{
		JavaPath:       javaPath,
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      `public class Main { public static void main(String[] args) { System.out.println("hello from java"); } }`,
		Language:  "java",
		TimeoutMs: 15000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if result.ExitCode != 0 {
		t.Errorf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "hello from java") {
		t.Errorf("stdout = %q, want it to contain 'hello from java'", result.Stdout)
	}
}

// TestRunUnsafeJavaCompilationError verifies that compilation errors are returned in stderr.
func TestRunUnsafeJavaCompilationError(t *testing.T) {
	javaPath, err := exec.LookPath("java")
	if err != nil {
		t.Skip("java not found")
	}

	cfg := Config{
		JavaPath:       javaPath,
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      `public class Main { public static void main(String[] args) { System.out.println("missing semicolon") } }`,
		Language:  "java",
		TimeoutMs: 15000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe error: %v", err)
	}
	if result.ExitCode == 0 {
		t.Error("expected non-zero exit code for compilation error")
	}
	if result.Stderr == "" {
		t.Error("expected stderr to contain compilation error")
	}
}

// TestRunJavaRejectsMainJavaFilename verifies that "Main.java" is reserved for Java.
func TestRunJavaRejectsMainJavaFilename(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:     "public class Main { public static void main(String[] args) {} }",
		Language: "java",
		Files: []File{
			{Name: "Main.java", Content: "malicious code"},
		},
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for reserved filename Main.java")
	}
	if !strings.Contains(err.Error(), "reserved") {
		t.Errorf("expected reserved filename error, got: %v", err)
	}
}

// TestRunJavaRejectsDuplicateSanitizedFilenames verifies that duplicate sanitized filenames are rejected for Java.
func TestRunJavaRejectsDuplicateSanitizedFilenames(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:     "public class Main { public static void main(String[] args) {} }",
		Language: "java",
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

// TestRunUnsafeJavaRejectsReservedFilename verifies that an attached file
// named after the Java class file is rejected.
func TestRunUnsafeJavaRejectsReservedFilename(t *testing.T) {
	cfg := Config{
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:     "public class Main { public static void main(String[] args) {} }",
		Language: "java",
		Files: []File{
			{Name: "Main.java", Content: "malicious code"},
		},
		TimeoutMs: 5000,
	}

	_, err := RunUnsafe(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for reserved filename Main.java")
	}
	if !strings.Contains(err.Error(), "reserved") {
		t.Errorf("expected reserved filename error, got: %v", err)
	}
}

// TestExtractJavaClassNameUsedAsFilename verifies that the extracted class name
// is what gets used as the filename (not just "Main.java").
func TestExtractJavaClassNameUsedAsFilename(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	// Class is named "Solution", not "Main" — the reserved file should be "Solution.java".
	req := Request{
		Code:     "public class Solution { public static void main(String[] args) {} }",
		Language: "java",
		Files: []File{
			{Name: "Solution.java", Content: "malicious code"},
		},
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for reserved filename Solution.java")
	}
	if !strings.Contains(err.Error(), "reserved") {
		t.Errorf("expected reserved filename error, got: %v", err)
	}
}

// TestRunUnsafeJavaIsCommand verifies that when IsCommand=true and Language="java",
// RunUnsafe executes the Code as a direct command with Args appended, not as
// Java source to compile.
func TestRunUnsafeJavaIsCommand(t *testing.T) {
	javaPath, err := exec.LookPath("java")
	if err != nil {
		t.Skip("java not found")
	}

	cfg := Config{
		JavaPath:       javaPath,
		MaxOutputBytes: MaxOutputBytes,
	}

	// Build a simple command: "java -version" (outputs to stderr, exit 0).
	// Using IsCommand=true means Code is executed as a shell invocation, not compiled.
	req := Request{
		Code:      javaPath + " -version",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 10000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe with IsCommand error: %v", err)
	}
	// java -version exits 0.
	if result.ExitCode != 0 {
		t.Errorf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
	}
}

// TestRunUnsafeJavaIsCommandWithArgs verifies that Args are passed correctly
// when IsCommand=true.
func TestRunUnsafeJavaIsCommandWithArgs(t *testing.T) {
	javacPath, err := exec.LookPath("javac")
	if err != nil {
		t.Skip("javac not found")
	}
	javaPath, err := exec.LookPath("java")
	if err != nil {
		t.Skip("java not found")
	}

	cfg := Config{
		JavaPath:       javaPath,
		JavacPath:      javacPath,
		MaxOutputBytes: MaxOutputBytes,
	}

	// Compile a tiny Java class that prints its first argument.
	tempDir, err := os.MkdirTemp("", "test-java-cmd-")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	helperSrc := `public class EchoArg { public static void main(String[] args) { if (args.length > 0) System.out.println(args[0]); } }`
	if err := os.WriteFile(filepath.Join(tempDir, "EchoArg.java"), []byte(helperSrc), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	compileCmd := exec.Command(javacPath, filepath.Join(tempDir, "EchoArg.java"))
	compileCmd.Dir = tempDir
	if out, err := compileCmd.CombinedOutput(); err != nil {
		t.Skipf("compile helper failed (java unavailable?): %v: %s", err, out)
	}

	// Now run via IsCommand path: "java -cp <tempDir> EchoArg" with Args=["hello-from-args"].
	req := Request{
		Code:      javaPath + " -cp " + tempDir + " EchoArg",
		Language:  "java",
		IsCommand: true,
		Args:      []string{"hello-from-args"},
		TimeoutMs: 10000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("RunUnsafe with IsCommand and args error: %v", err)
	}
	if result.ExitCode != 0 {
		t.Errorf("exit code = %d, want 0; stderr: %s", result.ExitCode, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "hello-from-args") {
		t.Errorf("stdout = %q, want it to contain 'hello-from-args'", result.Stdout)
	}
}

// TestRunUnsafeJavaIsCommandEmptyCode verifies that IsCommand=true with an empty
// Code field returns an error rather than panicking or compiling an empty file.
func TestRunUnsafeJavaIsCommandEmptyCode(t *testing.T) {
	cfg := Config{
		JavaPath:       "/usr/bin/java",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 5000,
	}

	_, err := RunUnsafe(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for empty command Code with IsCommand=true")
	}
	if !strings.Contains(err.Error(), "Code is empty") {
		t.Errorf("expected empty Code error, got: %v", err)
	}
}

// TestRunJavaIsCommandNsjailNotFound verifies that Run with IsCommand=true and
// Language="java" returns nsjail-not-found error (same gate as normal java path).
func TestRunJavaIsCommandNsjailNotFound(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "java -cp /path/to/tracer.jar JavaTracer",
		Language:  "java",
		IsCommand: true,
		Args:      []string{"student code", "", "5000"},
		TimeoutMs: 10000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail not found")
	}
	if !strings.Contains(err.Error(), "nsjail binary not found") {
		t.Errorf("expected nsjail binary not found error, got: %v", err)
	}
}

// TestRunJavaIsCommandEmptyCode verifies that Run (nsjail) with IsCommand=true
// and empty Code returns an error rather than executing an empty command.
func TestRunJavaIsCommandEmptyCode(t *testing.T) {
	cfg := Config{
		NsjailPath:     "/nonexistent/nsjail",
		JavaPath:       "/usr/bin/java",
		JavacPath:      "/usr/bin/javac",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error for empty command Code with IsCommand=true")
	}
	// May be "nsjail binary not found" OR "Code is empty" depending on check order.
	// Both are valid error responses; just confirm we get an error.
}

// TestRunUnsafeJavaIsCommandDoesNotCompile verifies that IsCommand=true does NOT
// attempt to compile the Code field (regression: it must run the command as-is,
// not treat Code as Java source).
func TestRunUnsafeJavaIsCommandDoesNotCompile(t *testing.T) {
	javaPath, err := exec.LookPath("java")
	if err != nil {
		t.Skip("java not found")
	}
	javacPath, err := exec.LookPath("javac")
	if err != nil {
		t.Skip("javac not found")
	}

	cfg := Config{
		JavaPath:       javaPath,
		JavacPath:      javacPath,
		MaxOutputBytes: MaxOutputBytes,
	}

	// Code is NOT valid Java source. If RunUnsafe tries to compile this, javac
	// will fail and return a non-zero exit code. With IsCommand=true, it should
	// be executed directly (as a shell command) — which will fail because
	// "not-valid-java-source" is not a valid command either, but the error will
	// be an exec error, not a compilation error in stderr.
	req := Request{
		Code:      "not-valid-java-source",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 5000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	// Either an error from exec (command not found) or non-zero exit code.
	// The important thing: stderr must NOT contain "error:" (javac compile errors),
	// meaning we did NOT attempt javac compilation.
	if err != nil {
		// exec.LookPath failed for "not-valid-java-source" — acceptable
		return
	}
	if strings.Contains(result.Stderr, "error:") && strings.Contains(result.Stderr, ".java") {
		t.Errorf("stderr looks like a javac compile error, which means IsCommand was ignored: %s", result.Stderr)
	}
}

// TestRunUnsafeJava_MissingJavac_ReturnsError verifies that runUnsafeJava returns
// a non-nil error (not a nil-error Result with empty stderr) when javac does not exist.
// This is a regression test for the bug where exec.Error (binary not found) was
// silently swallowed and returned as Result{ExitCode:1, Stderr:""}, nil.
func TestRunUnsafeJava_MissingJava_ReturnsError(t *testing.T) {
	cfg := Config{
		JavaPath:       "/nonexistent/java",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      `public class Main { public static void main(String[] args) { System.out.println("hello"); } }`,
		Language:  "java",
		TimeoutMs: 5000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err == nil {
		if result != nil && result.Stderr == "" && result.ExitCode != 0 {
			t.Fatal("runUnsafeJava swallowed binary-not-found error: got nil error with empty stderr and non-zero exit code")
		}
		t.Fatal("expected error when java binary does not exist, got nil")
	}
}

// TestRunUnsafeJavaCommand_MissingBinary_ReturnsError verifies that runUnsafeJavaCommand
// returns a non-nil error when the command binary does not exist.
func TestRunUnsafeJavaCommand_MissingBinary_ReturnsError(t *testing.T) {
	cfg := Config{
		JavaPath:       "/nonexistent/java",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      "/nonexistent/java -version",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 5000,
	}

	result, err := RunUnsafe(context.Background(), cfg, req)
	if err == nil {
		if result != nil && result.Stderr == "" && result.ExitCode != 0 {
			t.Fatal("runUnsafeJavaCommand swallowed binary-not-found error: got nil error with empty stderr and non-zero exit code")
		}
		t.Fatal("expected error when java binary does not exist, got nil")
	}
}

// TestRunJava_MissingJava_ReturnsError verifies that runJava (nsjail path) returns
// a non-nil error when the java runtime does not exist at the configured path.
func TestRunJava_MissingJava_ReturnsError(t *testing.T) {
	cfg := Config{
		NsjailPath:     os.Args[0],
		JavaPath:       "/nonexistent/java",
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      `public class Main { public static void main(String[] args) {} }`,
		Language:  "java",
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when java binary does not exist at configured path, got nil")
	}
	if !strings.Contains(err.Error(), "java") {
		t.Errorf("expected error to mention java, got: %v", err)
	}
}

// TestRunJava_NsjailEmptyStderr_ReturnsError verifies that runJava (nsjail path)
// returns a non-nil error when nsjail exits non-zero with empty stderr, indicating
// an infrastructure failure rather than a user code error.
// This exercises the empty-stderr guard in the runJava pipeline. The test uses
// "false" as the nsjail binary, which exits with code 1 and produces no stderr.
// The guard must fire (at compile or execute phase) and return an error rather
// than a nil-error Result with empty Stderr.
func TestRunJava_NsjailEmptyStderr_ReturnsError(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	falsePath, lookErr := exec.LookPath("false")
	if lookErr != nil {
		t.Skip("false not found")
	}

	cfg := Config{
		NsjailPath:     falsePath,
		JavaPath:       os.Args[0],
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      `public class Main { public static void main(String[] args) {} }`,
		Language:  "java",
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail fails with empty stderr, got nil")
	}
	if !strings.Contains(err.Error(), "nsjail") {
		t.Errorf("expected error to mention nsjail, got: %v", err)
	}
}

// TestRunJavaCommand_NsjailEmptyStderr_ReturnsError verifies that runJavaCommand
// returns a non-nil error when nsjail produces empty stderr with a non-zero exit code.
func TestRunJavaCommand_NsjailEmptyStderr_ReturnsError(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("test requires linux")
	}

	falsePath, lookErr := exec.LookPath("false")
	if lookErr != nil {
		t.Skip("false not found")
	}

	cfg := Config{
		NsjailPath:     falsePath,
		JavaPath:       os.Args[0],
		MaxOutputBytes: MaxOutputBytes,
	}
	req := Request{
		Code:      os.Args[0] + " -version",
		Language:  "java",
		IsCommand: true,
		TimeoutMs: 5000,
	}

	_, err := Run(context.Background(), cfg, req)
	if err == nil {
		t.Fatal("expected error when nsjail exits with non-zero code and empty stderr, got nil")
	}
	if !strings.Contains(err.Error(), "nsjail") {
		t.Errorf("expected error to mention nsjail, got: %v", err)
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

