package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// User represents a user in the database.
type User struct {
	ID          uuid.UUID
	ExternalID  *string // Identity Platform uid, nullable
	Email       string
	Role        string // system-admin, namespace-admin, instructor, student
	NamespaceID *string
	DisplayName *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// UpdateUserParams contains the fields that can be updated on a user.
type UpdateUserParams struct {
	DisplayName *string
}

// UserRepository defines the interface for user data access.
type UserRepository interface {
	// GetUserByID retrieves a user by their primary key ID.
	// Returns ErrNotFound if the user does not exist.
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)

	// GetUserByExternalID retrieves a user by their Identity Platform uid (external_id).
	// Returns ErrNotFound if the user does not exist.
	GetUserByExternalID(ctx context.Context, externalID string) (*User, error)

	// UpdateUser updates a user's mutable fields and returns the updated user.
	// Returns ErrNotFound if the user does not exist.
	UpdateUser(ctx context.Context, id uuid.UUID, params UpdateUserParams) (*User, error)
}
