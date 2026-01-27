// Package store provides a unified data access layer for the application.
// It implements repository interfaces for testability while keeping all
// SQL logic centralized in a single Store type.
package store

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Sentinel errors for store operations.
var (
	// ErrNotFound indicates the requested record does not exist.
	ErrNotFound = errors.New("record not found")
	// ErrNoConnection indicates no database connection is available in the context.
	// This typically means the RLS middleware did not set up a connection.
	ErrNoConnection = errors.New("no database connection in context")
	// ErrDuplicate indicates a unique constraint violation.
	ErrDuplicate = errors.New("duplicate record")
)

// HandleNotFound converts pgx.ErrNoRows to ErrNotFound.
// Other errors are returned unchanged. Nil errors return nil.
func HandleNotFound(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// HandleDuplicate converts PostgreSQL unique violation (23505) to ErrDuplicate.
// Other errors are returned unchanged. Nil errors return nil.
func HandleDuplicate(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrDuplicate
	}
	return err
}
