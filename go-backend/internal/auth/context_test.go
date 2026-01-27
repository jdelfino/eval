package auth

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestUserFromContext_NoUser(t *testing.T) {
	ctx := context.Background()

	user := UserFromContext(ctx)
	if user != nil {
		t.Errorf("UserFromContext() = %v, want nil", user)
	}
}

func TestUserFromContext_WithUser(t *testing.T) {
	ctx := context.Background()
	expectedID := uuid.New()
	expectedUser := &User{
		ID:          expectedID,
		Email:       "test@example.com",
		NamespaceID: "test-namespace",
		Role:        RoleInstructor,
	}

	ctx = WithUser(ctx, expectedUser)
	user := UserFromContext(ctx)

	if user == nil {
		t.Fatal("UserFromContext() returned nil, want user")
	}
	if user.ID != expectedID {
		t.Errorf("user.ID = %v, want %v", user.ID, expectedID)
	}
	if user.Email != "test@example.com" {
		t.Errorf("user.Email = %q, want %q", user.Email, "test@example.com")
	}
	if user.NamespaceID != "test-namespace" {
		t.Errorf("user.NamespaceID = %q, want %q", user.NamespaceID, "test-namespace")
	}
	if user.Role != RoleInstructor {
		t.Errorf("user.Role = %q, want %q", user.Role, RoleInstructor)
	}
}

func TestContextRoundTrip_AllRoles(t *testing.T) {
	testCases := []struct {
		name        string
		role        Role
		namespaceID string
	}{
		{
			name:        "system-admin has empty namespace",
			role:        RoleSystemAdmin,
			namespaceID: "", // system-admin must NOT have namespace_id
		},
		{
			name:        "namespace-admin has namespace",
			role:        RoleNamespaceAdmin,
			namespaceID: "stanford",
		},
		{
			name:        "instructor has namespace",
			role:        RoleInstructor,
			namespaceID: "mit",
		},
		{
			name:        "student has namespace",
			role:        RoleStudent,
			namespaceID: "berkeley",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			userID := uuid.New()
			original := &User{
				ID:          userID,
				Email:       "user@example.com",
				NamespaceID: tc.namespaceID,
				Role:        tc.role,
			}

			ctx = WithUser(ctx, original)
			retrieved := UserFromContext(ctx)

			if retrieved == nil {
				t.Fatal("UserFromContext() returned nil")
			}
			if retrieved.ID != userID {
				t.Errorf("ID = %v, want %v", retrieved.ID, userID)
			}
			if retrieved.NamespaceID != tc.namespaceID {
				t.Errorf("NamespaceID = %q, want %q", retrieved.NamespaceID, tc.namespaceID)
			}
			if retrieved.Role != tc.role {
				t.Errorf("Role = %q, want %q", retrieved.Role, tc.role)
			}
		})
	}
}

func TestRoleConstants(t *testing.T) {
	// Verify role constants match database CHECK constraints exactly
	expectedRoles := map[Role]string{
		RoleSystemAdmin:    "system-admin",
		RoleNamespaceAdmin: "namespace-admin",
		RoleInstructor:     "instructor",
		RoleStudent:        "student",
	}

	for role, expected := range expectedRoles {
		if string(role) != expected {
			t.Errorf("Role constant %q = %q, want %q", role, string(role), expected)
		}
	}
}

func TestWithUser_NilUser(t *testing.T) {
	ctx := context.Background()
	ctx = WithUser(ctx, nil)

	// Should return nil when nil was stored
	user := UserFromContext(ctx)
	if user != nil {
		t.Errorf("UserFromContext() = %v, want nil", user)
	}
}

func TestWithUser_OverwritesExisting(t *testing.T) {
	ctx := context.Background()

	firstUser := &User{
		ID:    uuid.New(),
		Email: "first@example.com",
		Role:  RoleStudent,
	}
	secondUser := &User{
		ID:    uuid.New(),
		Email: "second@example.com",
		Role:  RoleInstructor,
	}

	ctx = WithUser(ctx, firstUser)
	ctx = WithUser(ctx, secondUser)

	retrieved := UserFromContext(ctx)
	if retrieved == nil {
		t.Fatal("UserFromContext() returned nil")
	}
	if retrieved.Email != "second@example.com" {
		t.Errorf("Email = %q, want %q", retrieved.Email, "second@example.com")
	}
}
