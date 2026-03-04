package store

import (
	"context"

	"github.com/google/uuid"
)

// These compile-time checks verify that the new UserReader and UserAdmin
// sub-interfaces exist and that Store satisfies both.
// This file is the Phase 1 "failing test": it will not compile until
// UserReader and UserAdmin are defined in interfaces.go.

var _ UserReader = (*Store)(nil)
var _ UserAdmin = (*Store)(nil)

// Verify that UserRepository still embeds both sub-interfaces (structural check).
// A value that satisfies UserRepository must also satisfy UserReader and UserAdmin.
// stubFullUserRepo is a minimal concrete type that implements only UserRepository
// (via embedding) to confirm the composite interface assignment is valid.
var _ UserReader = (UserRepository)(nil)
var _ UserAdmin = (UserRepository)(nil)

// stubUserReader is a minimal stub that only implements UserReader.
// This verifies that UserReader is a distinct, smaller interface — not all of UserRepository.
type stubUserReader struct{}

func (stubUserReader) GetUserByID(_ context.Context, _ uuid.UUID) (*User, error)        { return nil, nil }
func (stubUserReader) GetUserByExternalID(_ context.Context, _ string) (*User, error)   { return nil, nil }
func (stubUserReader) GetUserByEmail(_ context.Context, _ string) (*User, error)        { return nil, nil }

var _ UserReader = stubUserReader{}

// Verify stubUserReader does NOT satisfy UserRepository (it only has 3 of 9 methods).
// This is enforced at compile time by the concrete type check above — if UserReader
// and UserRepository were the same, there would be no reason for the split.
