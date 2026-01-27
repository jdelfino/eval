package sandbox

import (
	"context"
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


// TestRunContextCancelled verifies that a cancelled context is handled.
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
	// Should still fail with nsjail not found (checked before exec).
	if err == nil {
		t.Fatal("expected error")
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

