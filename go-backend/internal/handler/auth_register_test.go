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

// --- GET /auth/register-student ---

func TestRegisterStudentGet_Success(t *testing.T) {
	section := testSection()
	class := testClass()

	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, code string) (*store.Section, error) {
			if code != section.JoinCode {
				t.Fatalf("unexpected code: %s", code)
			}
			return section, nil
		},
	}
	classRepo := &mockClassRepo{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != section.ClassID {
				t.Fatalf("unexpected class id: %v", id)
			}
			return class, nil
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      classRepo,
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student?code="+section.JoinCode, nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := got["section"]; !ok {
		t.Error("expected 'section' key in response")
	}
	if _, ok := got["class"]; !ok {
		t.Error("expected 'class' key in response")
	}
}

func TestRegisterStudentGet_MissingCode(t *testing.T) {
	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: &mockMembershipRepo{},
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student", nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestRegisterStudentGet_InvalidCode(t *testing.T) {
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}
	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student?code=INVALID", nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestRegisterStudentGet_InvalidCode_ReturnsCode(t *testing.T) {
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}
	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student?code=INVALID", nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["code"] != "INVALID_CODE" {
		t.Errorf("expected code INVALID_CODE, got %q", body["code"])
	}
}

func TestRegisterStudentGet_InactiveSection(t *testing.T) {
	section := testSection()
	section.Active = false
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}
	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student?code="+section.JoinCode, nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
}

func TestRegisterStudentGet_InactiveSection_ReturnsCode(t *testing.T) {
	section := testSection()
	section.Active = false
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}
	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	req := httptest.NewRequest(http.MethodGet, "/register-student?code="+section.JoinCode, nil)
	rec := httptest.NewRecorder()

	req = req.WithContext(store.WithRepos(req.Context(), authRepos))
	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["code"] != "SECTION_INACTIVE" {
		t.Errorf("expected code SECTION_INACTIVE, got %q", body["code"])
	}
}

// --- POST /auth/register-student ---

func TestRegisterStudentPost_Success(t *testing.T) {
	section := testSection()
	nsID := section.NamespaceID
	createdUser := &store.User{
		ID:          uuid.MustParse("44444444-4444-4444-4444-444444444444"),
		Email:       "student@example.com",
		Role:        "student",
		NamespaceID: &nsID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	membership := &store.SectionMembership{
		ID:        uuid.New(),
		UserID:    createdUser.ID,
		SectionID: section.ID,
		Role:      "student",
		JoinedAt:  time.Now(),
	}

	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, code string) (*store.Section, error) {
			if code != section.JoinCode {
				t.Fatalf("unexpected code: %s", code)
			}
			return section, nil
		},
		createMembershipFn: func(_ context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
			if params.UserID != createdUser.ID {
				t.Fatalf("unexpected user id: %v", params.UserID)
			}
			if params.SectionID != section.ID {
				t.Fatalf("unexpected section id: %v", params.SectionID)
			}
			if params.Role != "student" {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			return membership, nil
		},
	}
	userRepo := &StubUserRepo{
		CreateUserFn: func(_ context.Context, params store.CreateUserParams) (*store.User, error) {
			if params.Email != "student@example.com" {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.Role != "student" {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			if params.ExternalID != "firebase-uid-456" {
				t.Fatalf("unexpected external_id: %s", params.ExternalID)
			}
			return createdUser, nil
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code":    section.JoinCode,
		"display_name": "Student User",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Add claims to context (simulating JWT validation middleware)
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.User
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Email != "student@example.com" {
		t.Errorf("expected email student@example.com, got %q", got.Email)
	}
}

func TestRegisterStudentPost_InvalidJoinCode(t *testing.T) {
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": "INVALID",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterStudentPost_InvalidJoinCode_ReturnsCode(t *testing.T) {
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": "INVALID",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
	var respBody map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&respBody); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if respBody["code"] != "INVALID_CODE" {
		t.Errorf("expected code INVALID_CODE, got %q", respBody["code"])
	}
}

func TestRegisterStudentPost_InactiveSection(t *testing.T) {
	section := testSection()
	section.Active = false
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": section.JoinCode,
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterStudentPost_InactiveSection_ReturnsCode(t *testing.T) {
	section := testSection()
	section.Active = false
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": section.JoinCode,
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
	var respBody map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&respBody); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if respBody["code"] != "SECTION_INACTIVE" {
		t.Errorf("expected code SECTION_INACTIVE, got %q", respBody["code"])
	}
}

func TestRegisterStudentPost_EmailNotVerified(t *testing.T) {
	section := testSection()
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       &StubUserRepo{},
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": section.JoinCode,
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: false}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterStudentPost_CreateUserError(t *testing.T) {
	section := testSection()
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}
	userRepo := &StubUserRepo{
		CreateUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewAuthHandler("")
	authRepos := &mockAuthRepos{
		userRepo:       userRepo,
		invRepo:        &mockInvitationRepo{},
		membershipRepo: membershipRepo,
		classRepo:      &mockClassRepo{},
	}
	body, _ := json.Marshal(map[string]string{
		"join_code": section.JoinCode,
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	claims := &auth.Claims{Subject: "firebase-uid-456", Email: "student@example.com", EmailVerified: true}
	ctx := auth.WithClaims(req.Context(), claims)
	ctx = store.WithRepos(ctx, authRepos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
