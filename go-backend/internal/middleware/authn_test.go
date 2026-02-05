package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/internal/auth"
)

// mockTokenValidator implements auth.TokenValidator for testing.
type mockTokenValidator struct {
	claims *auth.Claims
	err    error
}

func (m *mockTokenValidator) Validate(_ context.Context, _ string) (*auth.Claims, error) {
	return m.claims, m.err
}

// mockUserLookup implements UserLookup for testing.
type mockUserLookup struct {
	record *UserRecord
	err    error
}

func (m *mockUserLookup) GetUserByExternalID(_ context.Context, _ string) (*UserRecord, error) {
	return m.record, m.err
}

func TestAuthenticate(t *testing.T) {
	logger := slog.Default()
	userID := uuid.New()
	nsID := "ns-1"

	validClaims := &auth.Claims{Subject: "ext-123", Email: "test@example.com"}
	validRecord := &UserRecord{
		ID:          userID,
		Email:       "test@example.com",
		Role:        "student",
		NamespaceID: &nsID,
	}

	tests := []struct {
		name       string
		authHeader string
		validator  *mockTokenValidator
		users      *mockUserLookup
		wantStatus int
		wantUser   bool
	}{
		{
			name:       "valid token attaches user to context",
			authHeader: "Bearer valid-token",
			validator:  &mockTokenValidator{claims: validClaims},
			users:      &mockUserLookup{record: validRecord},
			wantStatus: http.StatusOK,
			wantUser:   true,
		},
		{
			name:       "missing authorization header",
			authHeader: "",
			validator:  &mockTokenValidator{},
			users:      &mockUserLookup{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "malformed header not Bearer",
			authHeader: "Basic abc123",
			validator:  &mockTokenValidator{},
			users:      &mockUserLookup{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "Bearer with empty token",
			authHeader: "Bearer ",
			validator:  &mockTokenValidator{},
			users:      &mockUserLookup{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "invalid token from validator",
			authHeader: "Bearer bad-token",
			validator:  &mockTokenValidator{err: errors.New("invalid token")},
			users:      &mockUserLookup{},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "user not found in DB",
			authHeader: "Bearer valid-token",
			validator:  &mockTokenValidator{claims: validClaims},
			users:      &mockUserLookup{err: errors.New("record not found")},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "DB error does not leak details",
			authHeader: "Bearer valid-token",
			validator:  &mockTokenValidator{claims: validClaims},
			users:      &mockUserLookup{err: errors.New("connection refused")},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jwtValidator := NewJWTValidator(tt.validator, logger)
			userLoader := NewUserLoader(tt.users, logger)

			var gotUser *auth.User
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotUser = auth.UserFromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			rec := httptest.NewRecorder()

			// Chain: JWT validation -> User loading -> next handler
			jwtValidator.Validate(userLoader.Load(next)).ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}

			if tt.wantStatus == http.StatusUnauthorized {
				var body map[string]string
				if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
					t.Fatalf("failed to decode error body: %v", err)
				}
				if body["error"] != "authentication required" {
					t.Errorf("error body = %q, want %q", body["error"], "authentication required")
				}
			}

			if tt.wantUser {
				if gotUser == nil {
					t.Fatal("expected user in context, got nil")
				}
				if gotUser.ID != userID {
					t.Errorf("user.ID = %v, want %v", gotUser.ID, userID)
				}
				if gotUser.Email != "test@example.com" {
					t.Errorf("user.Email = %q, want %q", gotUser.Email, "test@example.com")
				}
				if gotUser.Role != auth.RoleStudent {
					t.Errorf("user.Role = %q, want %q", gotUser.Role, auth.RoleStudent)
				}
				if gotUser.NamespaceID != nsID {
					t.Errorf("user.NamespaceID = %q, want %q", gotUser.NamespaceID, nsID)
				}
			} else if gotUser != nil {
				t.Error("expected no user in context, got one")
			}
		})
	}
}
