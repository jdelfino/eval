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

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockAuthRepos is a composite type that embeds stubRepos and delegates to specific mock repos.
type mockAuthRepos struct {
	stubRepos
	userRepo       *StubUserRepo
	invRepo        *mockInvitationRepo
	membershipRepo *mockMembershipRepo
	classRepo      *mockClassRepo
}

// Delegate to the appropriate mock repo for user methods.
func (m *mockAuthRepos) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	return m.userRepo.GetUserByID(ctx, id)
}
func (m *mockAuthRepos) CreateUser(ctx context.Context, params store.CreateUserParams) (*store.User, error) {
	return m.userRepo.CreateUser(ctx, params)
}

// Delegate to the appropriate mock repo for invitation methods.
func (m *mockAuthRepos) GetInvitation(ctx context.Context, id uuid.UUID) (*store.Invitation, error) {
	return m.invRepo.GetInvitation(ctx, id)
}
func (m *mockAuthRepos) ConsumeInvitation(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*store.Invitation, error) {
	return m.invRepo.ConsumeInvitation(ctx, id, userID)
}

// Delegate to the appropriate mock repo for membership methods.
func (m *mockAuthRepos) CreateMembership(ctx context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
	return m.membershipRepo.CreateMembership(ctx, params)
}
func (m *mockAuthRepos) GetSectionByJoinCode(ctx context.Context, code string) (*store.Section, error) {
	return m.membershipRepo.GetSectionByJoinCode(ctx, code)
}

// Delegate to the appropriate mock repo for class methods.
func (m *mockAuthRepos) GetClass(ctx context.Context, id uuid.UUID) (*store.Class, error) {
	return m.classRepo.GetClass(ctx, id)
}

// Verify that mockAuthRepos implements store.Repos
var _ store.Repos = (*mockAuthRepos)(nil)

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

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
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
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite", nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAcceptInviteGet_InvalidUUID(t *testing.T) {
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token=not-a-uuid", nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
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
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+uuid.New().String(), nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
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
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
}

func TestAcceptInviteGet_ConsumedReturnsCode(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "consumed"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["code"] != "INVITATION_CONSUMED" {
		t.Errorf("expected code INVITATION_CONSUMED, got %q", body["code"])
	}
}

func TestAcceptInviteGet_ExpiredReturnsCode(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "expired"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}
	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/accept-invite?token="+inv.ID.String(), nil)
	ctx := store.WithRepos(req.Context(), repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["code"] != "INVITATION_EXPIRED" {
		t.Errorf("expected code INVITATION_EXPIRED, got %q", body["code"])
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

	userRepo := &StubUserRepo{
		CreateUserFn: func(_ context.Context, params store.CreateUserParams) (*store.User, error) {
			if params.Email != inv.Email {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.Role != inv.TargetRole {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			if params.ExternalID != "firebase-uid-123" {
				t.Fatalf("unexpected external_id: %s", params.ExternalID)
			}
			return createdUser, nil
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}

	body, _ := json.Marshal(map[string]string{
		"token":        inv.ID.String(),
		"display_name": "New User",
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Add claims to context (simulating JWT validation middleware)
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
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

func TestAcceptInvitePost_EmailNotVerified(t *testing.T) {
	inv := testInvitation("test-ns")
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": inv.ID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: false}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
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

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": inv.ID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAcceptInvitePost_ConsumedReturnsCode(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "consumed"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": inv.ID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
	var respBody map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&respBody); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if respBody["code"] != "INVITATION_CONSUMED" {
		t.Errorf("expected code INVITATION_CONSUMED, got %q", respBody["code"])
	}
}

func TestAcceptInvitePost_ExpiredReturnsCode(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "expired"
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": inv.ID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
	var respBody map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&respBody); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if respBody["code"] != "INVITATION_EXPIRED" {
		t.Errorf("expected code INVITATION_EXPIRED, got %q", respBody["code"])
	}
}

func TestAcceptInvitePost_InvitationNotFound(t *testing.T) {
	invRepo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": uuid.New().String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: "test@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
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
	userRepo := &StubUserRepo{
		CreateUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewAuthHandler("")
	repos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        invRepo,
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"token": inv.ID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/accept-invite", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-123", Email: inv.Email, EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostAcceptInvite(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
