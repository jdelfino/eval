package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jdelfino/eval/internal/config"
	"github.com/jdelfino/eval/internal/db"
	"github.com/jdelfino/eval/internal/server"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/slogutil"
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

	// Create database connection pool
	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabasePoolConfig())
	if err != nil {
		logger.Error("failed to create database pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close() // Graceful shutdown of pool

	logger.Info("database pool created",
		"max_conns", cfg.DatabaseMaxConns,
		"min_conns", cfg.DatabaseMinConns,
	)

	// Run database migrations if configured
	if cfg.MigrationsPath != "" {
		if err := db.RunMigrations(cfg.MigrationsPath, db.MigrationDatabaseURL(cfg.DatabasePoolConfig())); err != nil {
			logger.Error("failed to run migrations", "error", err)
			os.Exit(1)
		}
	}

	// Create store for user lookups (uses pool directly, no RLS)
	userStore := store.New(pool.PgxPool())

	// Create and start server
	srv := server.New(cfg, logger, pool, userStore)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		logger.Info("shutting down server")

		// Give active requests time to complete
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
