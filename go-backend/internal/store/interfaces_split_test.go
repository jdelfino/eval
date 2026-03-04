package store

import (
	"context"

	"github.com/google/uuid"
)

// Compile-time checks verifying the UserReader/UserAdmin interface split.
// Store-level checks (UserReader, UserAdmin, UserRepository) live in users.go.

// Verify that UserRepository embeds both sub-interfaces: any value satisfying
// UserRepository must also satisfy UserReader and UserAdmin.
var _ UserReader = (UserRepository)(nil)
var _ UserAdmin = (UserRepository)(nil)

// stubUserReader is a minimal stub that only implements UserReader.
// This verifies that UserReader is a distinct, smaller interface — not all of UserRepository.
type stubUserReader struct{}

func (stubUserReader) GetUserByID(_ context.Context, _ uuid.UUID) (*User, error)      { return nil, nil }
func (stubUserReader) GetUserByExternalID(_ context.Context, _ string) (*User, error)  { return nil, nil }
func (stubUserReader) GetUserByEmail(_ context.Context, _ string) (*User, error)       { return nil, nil }

var _ UserReader = stubUserReader{}
