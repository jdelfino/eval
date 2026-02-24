package store

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestHandleNotFound_NilError(t *testing.T) {
	err := HandleNotFound(nil)
	if err != nil {
		t.Errorf("HandleNotFound(nil) = %v, want nil", err)
	}
}

func TestHandleNotFound_NoRows(t *testing.T) {
	err := HandleNotFound(pgx.ErrNoRows)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("HandleNotFound(pgx.ErrNoRows) = %v, want ErrNotFound", err)
	}
}

func TestHandleNotFound_OtherError(t *testing.T) {
	originalErr := errors.New("database connection failed")
	err := HandleNotFound(originalErr)
	if err != originalErr {
		t.Errorf("HandleNotFound(otherErr) = %v, want %v", err, originalErr)
	}
}

func TestHandleNotFound_WrappedNoRows(t *testing.T) {
	wrappedErr := errors.Join(errors.New("query failed"), pgx.ErrNoRows)
	err := HandleNotFound(wrappedErr)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("HandleNotFound(wrapped ErrNoRows) = %v, want ErrNotFound", err)
	}
}

func TestErrNotFound_IsSentinel(t *testing.T) {
	if ErrNotFound == nil {
		t.Error("ErrNotFound should not be nil")
	}
	if ErrNotFound.Error() != "record not found" {
		t.Errorf("ErrNotFound.Error() = %q, want %q", ErrNotFound.Error(), "record not found")
	}
}

func TestHandleForbidden_NilError(t *testing.T) {
	err := HandleForbidden(nil)
	if err != nil {
		t.Errorf("HandleForbidden(nil) = %v, want nil", err)
	}
}

func TestHandleForbidden_RLSViolation(t *testing.T) {
	pgErr := &pgconn.PgError{Code: "42501", Message: "new row violates row-level security policy"}
	err := HandleForbidden(pgErr)
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("HandleForbidden(42501) = %v, want ErrForbidden", err)
	}
}

func TestHandleForbidden_OtherError(t *testing.T) {
	originalErr := errors.New("database connection failed")
	err := HandleForbidden(originalErr)
	if err != originalErr {
		t.Errorf("HandleForbidden(otherErr) = %v, want %v", err, originalErr)
	}
}

func TestHandleForbidden_OtherPgError(t *testing.T) {
	pgErr := &pgconn.PgError{Code: "23505", Message: "unique violation"}
	err := HandleForbidden(pgErr)
	if errors.Is(err, ErrForbidden) {
		t.Error("HandleForbidden(23505) should not return ErrForbidden")
	}
}

