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
	// ErrDuplicate indicates a unique constraint violation.
	ErrDuplicate = errors.New("duplicate record")
	// ErrLastMember indicates the operation would remove the last member of a required role.
	ErrLastMember = errors.New("cannot remove last member")
	// ErrForbidden indicates the operation was blocked by a row-level security policy.
	ErrForbidden = errors.New("forbidden by row-level security")
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

// HandleForbidden converts PostgreSQL insufficient_privilege (42501) to ErrForbidden.
// This error occurs when a row-level security policy blocks the operation.
// Other errors are returned unchanged. Nil errors return nil.
func HandleForbidden(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42501" {
		return ErrForbidden
	}
	return err
}

// IsUniqueViolation checks whether the error is a PostgreSQL unique constraint
// violation (23505) on the given constraint name. Returns false for nil errors.
func IsUniqueViolation(err error, constraintName string) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraintName
}
