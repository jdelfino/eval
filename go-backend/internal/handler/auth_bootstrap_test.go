package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// --- POST /auth/bootstrap ---

func TestBootstrapPost_Success(t *testing.T) {
	createdUser := &store.User{
		ID:        uuid.MustParse("55555555-5555-5555-5555-555555555555"),
		Email:     "admin@example.com",
		Role:      "system-admin",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, params store.CreateUserParams) (*store.User, error) {
			if params.ExternalID != "firebase-uid-admin" {
				t.Fatalf("unexpected external_id: %s", params.ExternalID)
			}
			if params.Email != "admin@example.com" {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.Role != "system-admin" {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			if params.NamespaceID != nil {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			return createdUser, nil
		},
	}

	h := NewAuthHandler()
	repos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}

	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	claims := &auth.Claims{
		Subject:      "firebase-uid-admin",
		Email:        "admin@example.com",
		CustomClaims: map[string]any{"role": "system-admin"},
	}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestBootstrapPost_NoClaims(t *testing.T) {
	h := NewAuthHandler()
	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestBootstrapPost_NoCustomClaim(t *testing.T) {
	h := NewAuthHandler()
	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	claims := &auth.Claims{
		Subject: "firebase-uid-admin",
		Email:   "admin@example.com",
		// No CustomClaims
	}
	ctx := auth.WithClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestBootstrapPost_WrongRole(t *testing.T) {
	h := NewAuthHandler()
	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	claims := &auth.Claims{
		Subject:      "firebase-uid-admin",
		Email:        "admin@example.com",
		CustomClaims: map[string]any{"role": "student"},
	}
	ctx := auth.WithClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestBootstrapPost_Duplicate(t *testing.T) {
	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, &pgconn.PgError{Code: "23505", ConstraintName: "users_external_id_key"}
		},
	}

	h := NewAuthHandler()
	repos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}

	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	claims := &auth.Claims{
		Subject:      "firebase-uid-admin",
		Email:        "admin@example.com",
		CustomClaims: map[string]any{"role": "system-admin"},
	}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestBootstrapPost_CreateError(t *testing.T) {
	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewAuthHandler()
	repos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}

	req := httptest.NewRequest(http.MethodPost, "/bootstrap", nil)
	claims := &auth.Claims{
		Subject:      "firebase-uid-admin",
		Email:        "admin@example.com",
		CustomClaims: map[string]any{"role": "system-admin"},
	}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostBootstrap(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
