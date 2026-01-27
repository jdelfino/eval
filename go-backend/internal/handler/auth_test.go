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

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// mockUserRepo implements store.UserRepository for testing.
type mockUserRepo struct {
	getUserByIDFn         func(ctx context.Context, id uuid.UUID) (*store.User, error)
	getUserByExternalIDFn func(ctx context.Context, externalID string) (*store.User, error)
	updateUserFn          func(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error)
}

func (m *mockUserRepo) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	return m.getUserByIDFn(ctx, id)
}

func (m *mockUserRepo) GetUserByExternalID(ctx context.Context, externalID string) (*store.User, error) {
	return m.getUserByExternalIDFn(ctx, externalID)
}

func (m *mockUserRepo) UpdateUser(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
	return m.updateUserFn(ctx, id, params)
}

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

func TestGetMe_Success(t *testing.T) {
	user := testUser()
	repo := &mockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			if id != user.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return user, nil
		},
	}

	h := NewAuthHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: user.ID, Email: user.Email, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetMe(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.User
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Email != user.Email {
		t.Errorf("expected email %q, got %q", user.Email, got.Email)
	}
}

func TestGetMe_Unauthorized(t *testing.T) {
	h := NewAuthHandler(&mockUserRepo{})
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()

	h.GetMe(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestGetMe_NotFound(t *testing.T) {
	repo := &mockUserRepo{
		getUserByIDFn: func(_ context.Context, _ uuid.UUID) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewAuthHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	repo := &mockUserRepo{
		updateUserFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
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
	h := NewAuthHandler(repo)
	req := httptest.NewRequest(http.MethodPut, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
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
	h := NewAuthHandler(&mockUserRepo{})
	req := httptest.NewRequest(http.MethodPut, "/me", nil)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestUpdateMe_NotFound(t *testing.T) {
	repo := &mockUserRepo{
		updateUserFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	body, _ := json.Marshal(map[string]string{"display_name": "New Name"})
	h := NewAuthHandler(repo)
	req := httptest.NewRequest(http.MethodPut, "/me", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateMe(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
