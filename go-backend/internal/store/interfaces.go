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

// UserRepository defines the interface for user data access.
type UserRepository interface {
	// GetUserByID retrieves a user by their primary key ID.
	// Returns ErrNotFound if the user does not exist.
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)
}
