package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/internal/auth"
)

func TestRequireRole(t *testing.T) {
	makeUser := func(role auth.Role) *auth.User {
		return &auth.User{
			ID:          uuid.New(),
			Email:       "user@example.com",
			NamespaceID: "test-namespace",
			Role:        role,
		}
	}

	okHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	tests := []struct {
		name         string
		allowedRoles []auth.Role
		user         *auth.User
		wantStatus   int
	}{
		{
			name:         "no user in context returns 401",
			allowedRoles: []auth.Role{auth.RoleInstructor},
			user:         nil,
			wantStatus:   http.StatusUnauthorized,
		},
		{
			name:         "user with allowed role passes through",
			allowedRoles: []auth.Role{auth.RoleInstructor},
			user:         makeUser(auth.RoleInstructor),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "user with disallowed role returns 403",
			allowedRoles: []auth.Role{auth.RoleInstructor},
			user:         makeUser(auth.RoleStudent),
			wantStatus:   http.StatusForbidden,
		},
		{
			name:         "multiple allowed roles - first matches",
			allowedRoles: []auth.Role{auth.RoleInstructor, auth.RoleSystemAdmin},
			user:         makeUser(auth.RoleInstructor),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "multiple allowed roles - second matches",
			allowedRoles: []auth.Role{auth.RoleInstructor, auth.RoleSystemAdmin},
			user:         makeUser(auth.RoleSystemAdmin),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "multiple allowed roles - none match",
			allowedRoles: []auth.Role{auth.RoleInstructor, auth.RoleSystemAdmin},
			user:         makeUser(auth.RoleStudent),
			wantStatus:   http.StatusForbidden,
		},
		{
			name:         "system-admin role allowed",
			allowedRoles: []auth.Role{auth.RoleSystemAdmin},
			user:         makeUser(auth.RoleSystemAdmin),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "namespace-admin role allowed",
			allowedRoles: []auth.Role{auth.RoleNamespaceAdmin},
			user:         makeUser(auth.RoleNamespaceAdmin),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "instructor role allowed",
			allowedRoles: []auth.Role{auth.RoleInstructor},
			user:         makeUser(auth.RoleInstructor),
			wantStatus:   http.StatusOK,
		},
		{
			name:         "student role allowed",
			allowedRoles: []auth.Role{auth.RoleStudent},
			user:         makeUser(auth.RoleStudent),
			wantStatus:   http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			middleware := RequireRole(tc.allowedRoles...)
			wrapped := middleware(okHandler)

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tc.user != nil {
				ctx := auth.WithUser(req.Context(), tc.user)
				req = req.WithContext(ctx)
			}

			rr := httptest.NewRecorder()
			wrapped.ServeHTTP(rr, req)

			if rr.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", rr.Code, tc.wantStatus)
			}

			// Verify JSON error body for 401 and 403
			if tc.wantStatus == http.StatusUnauthorized || tc.wantStatus == http.StatusForbidden {
				var body map[string]string
				if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
					t.Fatalf("failed to decode JSON error body: %v", err)
				}
				if body["error"] == "" {
					t.Error("expected non-empty error field in JSON body")
				}
				if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
					t.Errorf("Content-Type = %q, want %q", ct, "application/json")
				}
			}
		})
	}
}
