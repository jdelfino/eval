// Command bootstrap creates or updates the initial system-admin user.
//
// Usage:
//
//	go run ./cmd/bootstrap --email admin@example.com --external-id <firebase-uid>
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/jdelfino/eval/internal/config"
	"github.com/jdelfino/eval/internal/db"
	"github.com/jdelfino/eval/internal/store"
)

func main() {
	email := flag.String("email", "", "Email address for the admin user (required)")
	externalID := flag.String("external-id", "", "Firebase UID / external ID for the admin user (required)")
	flag.Parse()

	if *email == "" || *externalID == "" {
		fmt.Fprintln(os.Stderr, "Usage: bootstrap --email <email> --external-id <firebase-uid>")
		flag.PrintDefaults()
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabasePoolConfig())
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	s := store.New(pool.PgxPool())
	user, err := s.UpsertUser(ctx, store.CreateUserParams{
		ExternalID: *externalID,
		Email:      *email,
		Role:       "system-admin",
	})
	if err != nil {
		slog.Error("failed to upsert admin user", "error", err)
		os.Exit(1)
	}

	fmt.Printf("System admin ready: id=%s email=%s role=%s\n", user.ID, user.Email, user.Role)
}
