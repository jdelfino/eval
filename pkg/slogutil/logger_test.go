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
