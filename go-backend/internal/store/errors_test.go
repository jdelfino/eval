package store

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
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

func TestErrNoConnection_IsSentinel(t *testing.T) {
	if ErrNoConnection == nil {
		t.Error("ErrNoConnection should not be nil")
	}
	if ErrNoConnection.Error() != "no database connection in context" {
		t.Errorf("ErrNoConnection.Error() = %q, want %q", ErrNoConnection.Error(), "no database connection in context")
	}
}
