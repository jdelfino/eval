// Package slogutil provides shared helpers for configuring structured logging.
package slogutil

import (
	"log/slog"
	"os"
)

// ParseLevel converts a string log level name to a slog.Level.
// Supported values: "debug", "warn", "error". All other values default to info.
func ParseLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// NewLogger creates a configured *slog.Logger.
// When environment is "local", a human-readable text handler is used;
// otherwise a JSON handler suitable for structured log ingestion is used.
func NewLogger(environment, level string) *slog.Logger {
	opts := &slog.HandlerOptions{
		Level: ParseLevel(level),
	}
	if environment == "local" {
		return slog.New(slog.NewTextHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}
