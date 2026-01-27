// Package auth provides authentication types and context helpers.
// This package defines the interface for user authentication that will be
// completed by PLAT-nqj (Auth Layer).
package auth

import (
	"context"

	"github.com/google/uuid"
)

// Role represents a user's role in the system.
// These values match the database CHECK constraint on users.role.
type Role string

const (
	// RoleSystemAdmin has full access across all namespaces.
	RoleSystemAdmin Role = "system-admin"
	// RoleNamespaceAdmin has admin access within a single namespace.
	RoleNamespaceAdmin Role = "namespace-admin"
	// RoleInstructor can create classes, sections, and problems within a namespace.
	RoleInstructor Role = "instructor"
	// RoleStudent can join sections and participate in sessions.
	RoleStudent Role = "student"
)

// User represents an authenticated user in the system.
type User struct {
	// ID is the primary key in the users table.
	ID uuid.UUID
	// Email is the user's email address.
	Email string
	// NamespaceID is the user's namespace (empty for system-admin).
	NamespaceID string
	// Role is the user's authorization level.
	Role Role
}

// contextKey is an unexported type for context keys to prevent collisions.
type contextKey string

// userKey is the context key for storing/retrieving the authenticated user.
const userKey contextKey = "auth.user"

// UserFromContext retrieves the authenticated user from the context.
// Returns nil if no user is present in the context.
func UserFromContext(ctx context.Context) *User {
	user, ok := ctx.Value(userKey).(*User)
	if !ok {
		return nil
	}
	return user
}

// WithUser returns a new context with the given user attached.
func WithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, userKey, user)
}
