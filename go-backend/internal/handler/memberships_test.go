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

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// mockMembershipRepo implements store.MembershipRepository for testing.
type mockMembershipRepo struct {
	getSectionByJoinCodeFn       func(ctx context.Context, code string) (*store.Section, error)
	createMembershipFn           func(ctx context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error)
	deleteMembershipFn           func(ctx context.Context, sectionID, userID uuid.UUID) error
	listMembersFn                func(ctx context.Context, sectionID uuid.UUID) ([]store.SectionMembership, error)
	deleteMembershipIfNotLastFn  func(ctx context.Context, sectionID, userID uuid.UUID, role string) error
	listMembersByRoleFn          func(ctx context.Context, sectionID uuid.UUID, role string) ([]store.SectionMembership, error)
}

func (m *mockMembershipRepo) GetSectionByJoinCode(ctx context.Context, code string) (*store.Section, error) {
	return m.getSectionByJoinCodeFn(ctx, code)
}

func (m *mockMembershipRepo) CreateMembership(ctx context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
	return m.createMembershipFn(ctx, params)
}

func (m *mockMembershipRepo) DeleteMembership(ctx context.Context, sectionID, userID uuid.UUID) error {
	return m.deleteMembershipFn(ctx, sectionID, userID)
}

func (m *mockMembershipRepo) ListMembers(ctx context.Context, sectionID uuid.UUID) ([]store.SectionMembership, error) {
	return m.listMembersFn(ctx, sectionID)
}

func (m *mockMembershipRepo) ListMembersByRole(ctx context.Context, sectionID uuid.UUID, role string) ([]store.SectionMembership, error) {
	if m.listMembersByRoleFn != nil {
		return m.listMembersByRoleFn(ctx, sectionID, role)
	}
	return nil, nil
}

func (m *mockMembershipRepo) DeleteMembershipIfNotLast(ctx context.Context, sectionID, userID uuid.UUID, role string) error {
	if m.deleteMembershipIfNotLastFn != nil {
		return m.deleteMembershipIfNotLastFn(ctx, sectionID, userID, role)
	}
	return nil
}

func testMembershipSection() *store.Section {
	sem := "Fall 2025"
	return &store.Section{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID: "test-ns",
		ClassID:     uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		Name:        "Section A",
		Semester:    &sem,
		JoinCode:    "ABC-123-XYZ",
		Active:      true,
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func testMembership() *store.SectionMembership {
	return &store.SectionMembership{
		ID:        uuid.MustParse("22222222-3333-4444-5555-666666666666"),
		UserID:    uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		SectionID: uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		Role:      "student",
		JoinedAt:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

// --- Join tests ---

func TestJoin_Success(t *testing.T) {
	sec := testMembershipSection()
	mem := testMembership()
	userID := mem.UserID

	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, code string) (*store.Section, error) {
			if code != "ABC-123-XYZ" {
				t.Fatalf("unexpected code: %v", code)
			}
			return sec, nil
		},
		createMembershipFn: func(_ context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
			if params.UserID != userID {
				t.Fatalf("unexpected user_id: %v", params.UserID)
			}
			if params.SectionID != sec.ID {
				t.Fatalf("unexpected section_id: %v", params.SectionID)
			}
			if params.Role != "student" {
				t.Fatalf("unexpected role: %v", params.Role)
			}
			return mem, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          userID,
		Role:        auth.RoleStudent,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.SectionMembership
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != mem.ID {
		t.Errorf("expected id %q, got %q", mem.ID, got.ID)
	}
}

func TestJoin_Unauthorized(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestJoin_SectionNotFound(t *testing.T) {
	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "BAD-CODE-123"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestJoin_SectionNotActive(t *testing.T) {
	sec := testMembershipSection()
	sec.Active = false

	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return sec, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestJoin_InvalidBody(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestJoin_InternalError(t *testing.T) {
	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestJoin_Duplicate(t *testing.T) {
	sec := testMembershipSection()
	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return sec, nil
		},
		createMembershipFn: func(_ context.Context, _ store.CreateMembershipParams) (*store.SectionMembership, error) {
			return nil, store.ErrDuplicate
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestJoin_CreateError(t *testing.T) {
	sec := testMembershipSection()
	repo := &mockMembershipRepo{
		getSectionByJoinCodeFn: func(_ context.Context, _ string) (*store.Section, error) {
			return sec, nil
		},
		createMembershipFn: func(_ context.Context, _ store.CreateMembershipParams) (*store.SectionMembership, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"join_code": "ABC-123-XYZ"})
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestJoin_MissingJoinCode(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/sections/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListMembers_Unauthorized(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	req := httptest.NewRequest(http.MethodGet, "/sections/"+uuid.New().String()+"/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListMembers(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

// --- Leave tests ---

func TestLeave_Success(t *testing.T) {
	sectionID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

	repo := &mockMembershipRepo{
		deleteMembershipFn: func(_ context.Context, secID, uID uuid.UUID) error {
			if secID != sectionID {
				t.Fatalf("unexpected section_id: %v", secID)
			}
			if uID != userID {
				t.Fatalf("unexpected user_id: %v", uID)
			}
			return nil
		},
	}

	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/membership", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Leave(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestLeave_Unauthorized(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+uuid.New().String()+"/membership", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Leave(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestLeave_InvalidID(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	req := httptest.NewRequest(http.MethodDelete, "/sections/not-a-uuid/membership", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Leave(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestLeave_NotFound(t *testing.T) {
	repo := &mockMembershipRepo{
		deleteMembershipFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	sectionID := uuid.New()
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/membership", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Leave(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestLeave_InternalError(t *testing.T) {
	repo := &mockMembershipRepo{
		deleteMembershipFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	sectionID := uuid.New()
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/membership", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Leave(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// --- ListMembers tests ---

func TestListMembers_Success(t *testing.T) {
	mem := testMembership()
	sectionID := mem.SectionID

	repo := &mockMembershipRepo{
		listMembersFn: func(_ context.Context, secID uuid.UUID) ([]store.SectionMembership, error) {
			if secID != sectionID {
				t.Fatalf("unexpected section_id: %v", secID)
			}
			return []store.SectionMembership{*mem}, nil
		},
	}

	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sections/"+sectionID.String()+"/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListMembers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.SectionMembership
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 member, got %d", len(got))
	}
	if got[0].ID != mem.ID {
		t.Errorf("expected id %q, got %q", mem.ID, got[0].ID)
	}
}

func TestListMembers_Empty(t *testing.T) {
	repo := &mockMembershipRepo{
		listMembersFn: func(_ context.Context, _ uuid.UUID) ([]store.SectionMembership, error) {
			return nil, nil
		},
	}

	sectionID := uuid.New()
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sections/"+sectionID.String()+"/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListMembers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListMembers_InvalidID(t *testing.T) {
	h := NewMembershipHandler(&mockMembershipRepo{})
	req := httptest.NewRequest(http.MethodGet, "/sections/not-a-uuid/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListMembers(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListMembers_InternalError(t *testing.T) {
	repo := &mockMembershipRepo{
		listMembersFn: func(_ context.Context, _ uuid.UUID) ([]store.SectionMembership, error) {
			return nil, errors.New("db error")
		},
	}

	sectionID := uuid.New()
	h := NewMembershipHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sections/"+sectionID.String()+"/members", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListMembers(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}
