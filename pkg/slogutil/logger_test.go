package slogutil

import (
	"log/slog"
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
	t.Run("local environment returns non-nil logger", func(t *testing.T) {
		logger := NewLogger("local", "debug")
		if logger == nil {
			t.Fatal("expected non-nil logger")
		}
	})

	t.Run("production environment returns non-nil logger", func(t *testing.T) {
		logger := NewLogger("production", "info")
		if logger == nil {
			t.Fatal("expected non-nil logger")
		}
	})
}
