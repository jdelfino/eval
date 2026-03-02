package slogutil

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input string
		want  slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"warn", slog.LevelWarn},
		{"error", slog.LevelError},
		{"info", slog.LevelInfo},
		{"", slog.LevelInfo},
		{"unknown", slog.LevelInfo},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := ParseLevel(tt.input); got != tt.want {
				t.Errorf("ParseLevel(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestNewLogger(t *testing.T) {
	t.Run("local environment uses TextHandler", func(t *testing.T) {
		logger := NewLogger("local", "debug")
		if logger == nil {
			t.Fatal("expected non-nil logger")
		}
		if _, ok := logger.Handler().(*slog.TextHandler); !ok {
			t.Errorf("expected *slog.TextHandler for local env, got %T", logger.Handler())
		}
	})

	t.Run("production environment uses JSONHandler", func(t *testing.T) {
		logger := NewLogger("production", "info")
		if logger == nil {
			t.Fatal("expected non-nil logger")
		}
		if _, ok := logger.Handler().(*slog.JSONHandler); !ok {
			t.Errorf("expected *slog.JSONHandler for production env, got %T", logger.Handler())
		}
	})
}

// TestNewLogger_CloudLoggingSeverityMapping verifies that the JSON handler
// emits a "severity" field (instead of "level") with Cloud Logging severity
// values, so that Cloud Logging can parse log severity correctly.
func TestNewLogger_CloudLoggingSeverityMapping(t *testing.T) {
	levels := []struct {
		slogLevel        slog.Level
		expectedSeverity string
	}{
		{slog.LevelDebug, "DEBUG"},
		{slog.LevelInfo, "INFO"},
		{slog.LevelWarn, "WARNING"},
		{slog.LevelError, "ERROR"},
	}

	for _, tt := range levels {
		t.Run(tt.expectedSeverity, func(t *testing.T) {
			var buf bytes.Buffer
			logger := newLoggerWithWriter("production", "debug", &buf)

			logger.Log(nil, tt.slogLevel, "test message")

			var entry map[string]any
			if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
				t.Fatalf("failed to unmarshal log entry: %v (raw: %s)", err, buf.String())
			}

			// "level" key must NOT be present
			if _, ok := entry["level"]; ok {
				t.Errorf("unexpected 'level' key in log entry; Cloud Logging uses 'severity'")
			}

			// "severity" key must be present with the correct value
			got, ok := entry["severity"]
			if !ok {
				t.Fatalf("missing 'severity' key in log entry: %s", buf.String())
			}
			if got != tt.expectedSeverity {
				t.Errorf("severity = %q, want %q", got, tt.expectedSeverity)
			}
		})
	}
}

// TestNewLogger_LocalNoSeverityMapping verifies that the local text handler
// does NOT apply the severity renaming (it should remain human-readable).
func TestNewLogger_LocalNoSeverityMapping(t *testing.T) {
	var buf bytes.Buffer
	logger := newLoggerWithWriter("local", "debug", &buf)
	logger.Info("test message")

	output := buf.String()
	// Text handler output should contain "INFO" (not "severity=")
	if len(output) == 0 {
		t.Fatal("expected log output")
	}
	if !strings.Contains(output, "INFO") {
		t.Errorf("local logger output should contain 'INFO', got: %q", output)
	}
	if strings.Contains(output, "severity=") {
		t.Errorf("local logger output should NOT contain 'severity=', got: %q", output)
	}
}
