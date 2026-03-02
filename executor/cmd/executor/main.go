package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/server"
	"github.com/jdelfino/eval/pkg/slogutil"
	"github.com/jdelfino/eval/pkg/tracing"
)

func main() {
	// Load config
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Configure logger based on environment
	logger := slogutil.NewLogger(cfg.Environment, cfg.LogLevel)
	slog.SetDefault(logger)

	ctx := context.Background()

	// Initialize distributed tracing if enabled
	if cfg.TracingEnabled {
		shutdownTracing, err := tracing.Init(ctx, "executor", cfg.TracingSampleRate)
		if err != nil {
			logger.Warn("failed to initialize tracing", "error", err)
		} else {
			defer func() {
				if err := shutdownTracing(context.Background()); err != nil {
					logger.Warn("tracing shutdown error", "error", err)
				}
			}()
			logger.Info("tracing initialized", "sample_rate", cfg.TracingSampleRate)
		}
	}

	// Create and start server
	srv := server.New(cfg, logger)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		logger.Info("shutting down server")

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			logger.Error("server shutdown error", "error", err)
		}
	}()

	// Start server (blocks until shutdown)
	if err := srv.Start(); err != nil && err != http.ErrServerClosed {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
