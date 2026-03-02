// Package slogutil provides shared helpers for configuring structured logging.
package slogutil

import (
	"io"
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

// cloudLoggingSeverity maps slog.Level values to Cloud Logging severity strings.
// Cloud Logging expects the field to be named "severity" (not "level") and uses
// specific string values. Without this mapping all logs appear as DEFAULT severity.
func cloudLoggingSeverity(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "ERROR"
	case level >= slog.LevelWarn:
		return "WARNING"
	case level >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}

// cloudLoggingReplaceAttr is an slog.HandlerOptions.ReplaceAttr function that
// renames the "level" key to "severity" and maps its value to Cloud Logging
// severity strings, enabling Cloud Logging to parse log severity correctly.
func cloudLoggingReplaceAttr(_ []string, a slog.Attr) slog.Attr {
	if a.Key == slog.LevelKey {
		level, ok := a.Value.Any().(slog.Level)
		if !ok {
			return a
		}
		return slog.String("severity", cloudLoggingSeverity(level))
	}
	return a
}

// NewLogger creates a configured *slog.Logger.
// When environment is "local", a human-readable text handler is used;
// otherwise a JSON handler suitable for structured log ingestion is used.
// For non-local environments, the "level" field is renamed to "severity" and
// mapped to Cloud Logging severity values.
func NewLogger(environment, level string) *slog.Logger {
	return newLoggerWithWriter(environment, level, os.Stdout)
}

// newLoggerWithWriter creates a configured *slog.Logger writing to w.
// This is the internal constructor used by both NewLogger and tests.
func newLoggerWithWriter(environment, level string, w io.Writer) *slog.Logger {
	opts := &slog.HandlerOptions{
		Level: ParseLevel(level),
	}
	if environment == "local" {
		return slog.New(slog.NewTextHandler(w, opts))
	}
	opts.ReplaceAttr = cloudLoggingReplaceAttr
	return slog.New(slog.NewJSONHandler(w, opts))
}
