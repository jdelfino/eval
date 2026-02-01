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

	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, membershipRepo, classRepo)
	req := httptest.NewRequest(http.MethodGet, "/register-student?code="+section.JoinCode, nil)
	rec := httptest.NewRecorder()

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
	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, &mockMembershipRepo{}, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/register-student", nil)
	rec := httptest.NewRecorder()

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
	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/register-student?code=INVALID", nil)
	rec := httptest.NewRecorder()

	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
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
	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	req := httptest.NewRequest(http.MethodGet, "/register-student?code="+section.JoinCode, nil)
	rec := httptest.NewRecorder()

	h.GetRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", rec.Code)
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
	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, params store.CreateUserParams) (*store.User, error) {
			if params.Email != "student@example.com" {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.Role != "student" {
				t.Fatalf("unexpected role: %s", params.Role)
			}
			return createdUser, nil
		},
	}

	h := newAuthHandlerWithDeps(userRepo, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"join_code":    section.JoinCode,
		"external_id":  "firebase-uid-456",
		"email":        "student@example.com",
		"display_name": "Student User",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
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

	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"join_code":   "INVALID",
		"external_id": "firebase-uid-456",
		"email":       "student@example.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
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

	h := newAuthHandlerWithDeps(&mockUserRepo{}, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"join_code":   section.JoinCode,
		"external_id": "firebase-uid-456",
		"email":       "student@example.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterStudentPost_CreateUserError(t *testing.T) {
	section := testSection()
	membershipRepo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return section, nil
		},
	}
	userRepo := &mockUserRepo{
		createUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return nil, errors.New("db error")
		},
	}

	h := newAuthHandlerWithDeps(userRepo, &mockInvitationRepo{}, membershipRepo, &mockClassRepo{})
	body, _ := json.Marshal(map[string]string{
		"join_code":   section.JoinCode,
		"external_id": "firebase-uid-456",
		"email":       "student@example.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/register-student", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.PostRegisterStudent(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
