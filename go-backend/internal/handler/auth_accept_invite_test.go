package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/store"
)

func newAuthHandlerWithDeps(users store.UserRepository, invitations store.InvitationRepository, memberships store.MembershipRepository, classes store.ClassRepository) *AuthHandler {
	return NewAuthHandler(users, invitations, memberships, classes)
}

// --- GET /auth/accept-invite ---

func TestAcceptInviteGet_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, id uuid.UUID) (*store.Invitation, error) {
			if id != inv.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return inv, nil
		},
	}

	h := newAuthHandlerWithDeps(&mockUserRepo{}, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Invitation
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Email != inv.Email {
		t.Errorf("expected email %q, got %q", inv.Email, got.Email)
	}
}

func TestAcceptInviteGet_MissingToken(t *testing.T) {
	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/accept-invite", nil)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAcceptInviteGet_InvalidUUID(t *testing.T) {
	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token=not-a-uuid", nil)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAcceptInviteGet_NotFound(t *testing.T) {
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}
	h := newAuthHandlerWithDeps(&mockUserRepo{}, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+uuid.New().String(), nil)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestAcceptInviteGet_NotPending(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "consumed"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}
	h := newAuthHandlerWithDeps(&mockUserRepo{}, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
}

// --- POST /auth/accept-invite ---

func TestAcceptInvitePost_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	createdUser := &store.User{
		ID:          uuid.MustParse("33333333-3333-3333-3333-333333333333"),
		Email:       inv.Email,
		Role:        inv.TargetRole,
		NamespaceID: &inv.NamespaceID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, id uuid.UUID) (*store.Invitation, error) {
			if id != inv.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return inv, nil
		},
		consumeInvitationFn: func(_ context.Context, id uuid.UUID, userID uuid.UUID) (*store.Invitation, error) {
			if id != inv.ID {
				t.Fatalf("unexpected invitation id: %v", id)
			}
			if userID != createdUser.ID {
				t.Fatalf("unexpected user id: %v", userID)
			}
			consumed := *inv
			consumed.Status = "consumed"
			return &consumed, nil
		},
	}

	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, params store.CreateUserParams) (*store.User, error) {
			if params.Email != inv.Email {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.Role != inv.TargetRole {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			return createdUser, nil
		},
	}

	h := newAuthHandlerWithDeps(userRepo, invRepo, &mockMembershipRepo{}, &mockClassRepo{})

	body, _ := json.Marshal(map[string]string{
		"token":        inv.ID.String(),
		"external_id":  "firebase-uid-123",
		"display_name": "New User",
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.User
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Email != inv.Email {
		t.Errorf("expected email %q, got %q", inv.Email, got.Email)
	}
}

func TestAcceptInvitePost_InvitationNotPending(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "revoked"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := newAuthHandlerWithDeps(&mockUserRepo{}, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"token":       inv.ID.String(),
		"external_id": "firebase-uid-123",
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAcceptInvitePost_InvitationNotFound(t *testing.T) {
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}

	h := newAuthHandlerWithDeps(&mockUserRepo{}, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"token":       uuid.New().String(),
		"external_id": "firebase-uid-123",
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAcceptInvitePost_CreateUserError(t *testing.T) {
	inv := testInvitation("test-ns")
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}
	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, errors.New("db error")
		},
	}

	h := newAuthHandlerWithDeps(userRepo, invRepo, &mockMembershipRepo{}, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"token":       inv.ID.String(),
		"external_id": "firebase-uid-123",
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
