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

const (
	// userKey is the context key for storing/retrieving the authenticated user.
	userKey contextKey = "auth.user"
	// claimsKey is the context key for storing/retrieving JWT claims.
	claimsKey contextKey = "auth.claims"
	// previewContextKey is the context key for storing preview mode state.
	previewContextKey contextKey = "auth.preview"
)

// PreviewContext holds the state for an active instructor preview session.
// It records who the real instructor is (before identity swap) and which
// section is being previewed, so downstream handlers can restore the original
// identity or reference the section without re-parsing request headers.
type PreviewContext struct {
	// OriginalUser is the instructor whose identity was swapped out.
	OriginalUser *User
	// SectionID is the section being previewed.
	SectionID uuid.UUID
}

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

// ClaimsFromContext retrieves the JWT claims from the context.
// Returns nil if no claims are present (unauthenticated request).
func ClaimsFromContext(ctx context.Context) *Claims {
	claims, ok := ctx.Value(claimsKey).(*Claims)
	if !ok {
		return nil
	}
	return claims
}

// WithClaims returns a new context with the given claims attached.
func WithClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}

// WithPreviewContext returns a new context with the given PreviewContext attached.
// This is set by PreviewMiddleware when an instructor is actively previewing as a student.
func WithPreviewContext(ctx context.Context, pc PreviewContext) context.Context {
	return context.WithValue(ctx, previewContextKey, &pc)
}

// PreviewContextFrom retrieves the PreviewContext from the context.
// Returns nil if preview mode is not active.
func PreviewContextFrom(ctx context.Context) *PreviewContext {
	pc, ok := ctx.Value(previewContextKey).(*PreviewContext)
	if !ok {
		return nil
	}
	return pc
}

// IsPreview reports whether the current request is being executed in instructor
// preview-as-student mode.
func IsPreview(ctx context.Context) bool {
	return PreviewContextFrom(ctx) != nil
}
