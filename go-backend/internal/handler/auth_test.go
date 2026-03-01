package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

func testUser() *store.User {
	return &store.User{
		ID:          uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		Email:       "test@example.com",
		Role:        "student",
		DisplayName: strPtr("Test User"),
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func strPtr(s string) *string { return &s }

// authTestRepos embeds stubRepos and delegates UserRepository methods to a StubUserRepo.
type authTestRepos struct {
	stubRepos
	userRepo *StubUserRepo
}

var _ store.Repos = (*authTestRepos)(nil)

func (r *authTestRepos) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	return r.userRepo.GetUserByID(ctx, id)
}
func (r *authTestRepos) GetUserByExternalID(ctx context.Context, externalID string) (*store.User, error) {
	return r.userRepo.GetUserByExternalID(ctx, externalID)
}
func (r *authTestRepos) UpdateUser(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
	return r.userRepo.UpdateUser(ctx, id, params)
}
func (r *authTestRepos) CreateUser(ctx context.Context, params store.CreateUserParams) (*store.User, error) {
	return r.userRepo.CreateUser(ctx, params)
}
func (r *authTestRepos) GetUserByEmail(ctx context.Context, email string) (*store.User, error) {
	return r.userRepo.GetUserByEmail(ctx, email)
}
func (r *authTestRepos) ListUsers(ctx context.Context, f store.UserFilters) ([]store.User, error) {
	return r.userRepo.ListUsers(ctx, f)
}
func (r *authTestRepos) UpdateUserAdmin(ctx context.Context, id uuid.UUID, p store.UpdateUserAdminParams) (*store.User, error) {
	return r.userRepo.UpdateUserAdmin(ctx, id, p)
}
func (r *authTestRepos) DeleteUser(ctx context.Context, id uuid.UUID) error {
	return r.userRepo.DeleteUser(ctx, id)
}
func (r *authTestRepos) CountUsersByRole(ctx context.Context, ns string) (map[string]int, error) {
	return r.userRepo.CountUsersByRole(ctx, ns)
}

func withAuthRepos(ctx context.Context, repo *StubUserRepo) context.Context {
	return store.WithRepos(ctx, &authTestRepos{userRepo: repo})
}

func TestGetMe_Success(t *testing.T) {
	user := testUser()
	repo := &StubUserRepo{
		GetUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			if id != user.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return user, nil
		},
	}

	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: user.ID, Email: user.Email, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, &authTestRepos{stubRepos: stubRepos{}, userRepo: repo})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetMe(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got struct {
		store.User
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Email != user.Email {
		t.Errorf("expected email %q, got %q", user.Email, got.Email)
	}

	// Verify permissions match those for the student role (from DB user's role).
	expectedPerms := auth.RolePermissions(auth.RoleStudent)
	if len(got.Permissions) != len(expectedPerms) {
		t.Fatalf("expected %d permissions, got %d: %v", len(expectedPerms), len(got.Permissions), got.Permissions)
	}
	permSet := make(map[string]struct{}, len(expectedPerms))
	for _, p := range expectedPerms {
		permSet[string(p)] = struct{}{}
	}
	for _, p := range got.Permissions {
		if _, ok := permSet[p]; !ok {
			t.Errorf("unexpected permission %q in response", p)
		}
	}
}

func TestUpdateMe_SuccessIncludesPermissions(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	newName := "Updated Name"
	updatedUser := testUser()
	updatedUser.DisplayName = &newName

	repo := &StubUserRepo{
		UpdateUserFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
			return updatedUser, nil
		},
	}

	body, _ := json.Marshal(map[string]string{"display_name": newName})
	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodPut, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = withAuthRepos(ctx, repo)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got struct {
		store.User
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// Verify permissions match those for the student role (from DB user's role).
	expectedPerms := auth.RolePermissions(auth.RoleStudent)
	if len(got.Permissions) != len(expectedPerms) {
		t.Fatalf("expected %d permissions, got %d: %v", len(expectedPerms), len(got.Permissions), got.Permissions)
	}
}

func TestGetMe_Unauthorized(t *testing.T) {
	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()

	h.GetMe(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestGetMe_NotFound(t *testing.T) {
	repo := &StubUserRepo{
		GetUserByIDFn: func(_ context.Context, _ uuid.UUID) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withAuthRepos(ctx, repo)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetMe(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateMe_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	newName := "Updated Name"
	updatedUser := testUser()
	updatedUser.DisplayName = &newName

	repo := &StubUserRepo{
		UpdateUserFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
			if id != userID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.DisplayName == nil || *params.DisplayName != newName {
				t.Fatalf("unexpected display_name: %v", params.DisplayName)
			}
			return updatedUser, nil
		},
	}

	body, _ := json.Marshal(map[string]string{"display_name": newName})
	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodPut, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = withAuthRepos(ctx, repo)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.User
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.DisplayName == nil || *got.DisplayName != newName {
		t.Errorf("expected display_name %q, got %v", newName, got.DisplayName)
	}
}

func TestUpdateMe_Unauthorized(t *testing.T) {
	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodPut, "/me", nil)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestUpdateMe_NotFound(t *testing.T) {
	repo := &StubUserRepo{
		UpdateUserFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	body, _ := json.Marshal(map[string]string{"display_name": "New Name"})
	h := NewAuthHandler("")
	req := httptest.NewRequest(http.MethodPut, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withAuthRepos(ctx, repo)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
