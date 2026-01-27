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

// Namespace represents a namespace (tenant) in the database.
type Namespace struct {
	ID             string     `json:"id"`
	DisplayName    string     `json:"display_name"`
	Active         bool       `json:"active"`
	MaxInstructors *int       `json:"max_instructors"`
	MaxStudents    *int       `json:"max_students"`
	CreatedAt      time.Time  `json:"created_at"`
	CreatedBy      *uuid.UUID `json:"created_by"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// CreateNamespaceParams contains the fields for creating a namespace.
type CreateNamespaceParams struct {
	ID             string
	DisplayName    string
	MaxInstructors *int
	MaxStudents    *int
	CreatedBy      *uuid.UUID
}

// UpdateNamespaceParams contains the fields that can be updated on a namespace.
type UpdateNamespaceParams struct {
	DisplayName    *string
	Active         *bool
	MaxInstructors *int
	MaxStudents    *int
}

// NamespaceRepository defines the interface for namespace data access.
type NamespaceRepository interface {
	// ListNamespaces retrieves all namespaces visible to the current user (RLS-filtered).
	ListNamespaces(ctx context.Context) ([]Namespace, error)
	// GetNamespace retrieves a namespace by ID.
	// Returns ErrNotFound if the namespace does not exist.
	GetNamespace(ctx context.Context, id string) (*Namespace, error)
	// CreateNamespace creates a new namespace and returns it.
	CreateNamespace(ctx context.Context, params CreateNamespaceParams) (*Namespace, error)
	// UpdateNamespace updates a namespace's mutable fields and returns the updated namespace.
	// Returns ErrNotFound if the namespace does not exist.
	UpdateNamespace(ctx context.Context, id string, params UpdateNamespaceParams) (*Namespace, error)
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
