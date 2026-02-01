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
	"github.com/jdelfino/eval/internal/email"
	"github.com/jdelfino/eval/internal/store"
)

// mockInvitationRepo implements store.InvitationRepository for testing.
type mockInvitationRepo struct {
	listInvitationsFn   func(ctx context.Context, filters store.InvitationFilters) ([]store.Invitation, error)
	getInvitationFn     func(ctx context.Context, id uuid.UUID) (*store.Invitation, error)
	createInvitationFn  func(ctx context.Context, params store.CreateInvitationParams) (*store.Invitation, error)
	revokeInvitationFn  func(ctx context.Context, id uuid.UUID) (*store.Invitation, error)
	consumeInvitationFn func(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*store.Invitation, error)
}

func (m *mockInvitationRepo) ListInvitations(ctx context.Context, filters store.InvitationFilters) ([]store.Invitation, error) {
	return m.listInvitationsFn(ctx, filters)
}
func (m *mockInvitationRepo) GetInvitation(ctx context.Context, id uuid.UUID) (*store.Invitation, error) {
	return m.getInvitationFn(ctx, id)
}
func (m *mockInvitationRepo) CreateInvitation(ctx context.Context, params store.CreateInvitationParams) (*store.Invitation, error) {
	return m.createInvitationFn(ctx, params)
}
func (m *mockInvitationRepo) RevokeInvitation(ctx context.Context, id uuid.UUID) (*store.Invitation, error) {
	return m.revokeInvitationFn(ctx, id)
}
func (m *mockInvitationRepo) ConsumeInvitation(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*store.Invitation, error) {
	return m.consumeInvitationFn(ctx, id, userID)
}

// mockEmailClient tracks calls for testing.
type mockEmailClient struct {
	sendCalled bool
	sendErr    error
}

func (m *mockEmailClient) SendInvitation(_ context.Context, _, _, _, _ string) error {
	m.sendCalled = true
	return m.sendErr
}

func testInvitation(nsID string) *store.Invitation {
	return &store.Invitation{
		ID:          uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		Email:       "alice@example.com",
		TargetRole:  "instructor",
		NamespaceID: nsID,
		CreatedBy:   uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		ExpiresAt:   time.Now().Add(7 * 24 * time.Hour),
		Status:      "pending",
	}
}

func invitationHandler(repo *mockInvitationRepo, emailClient email.Client) *InvitationHandler {
	if emailClient == nil {
		emailClient = email.NoOpClient{}
	}
	return NewInvitationHandler(repo, nil, emailClient, "http://localhost:3000/invite/accept")
}

func withNsCtx(req *http.Request, nsID string, user *auth.User) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nsID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, user)
	return req.WithContext(ctx)
}

func withInvCtx(req *http.Request, nsID, invID string, user *auth.User) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nsID)
	rctx.URLParams.Add("invID", invID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, user)
	return req.WithContext(ctx)
}

func withSystemInvCtx(req *http.Request, invID string, user *auth.User) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("invID", invID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, user)
	return req.WithContext(ctx)
}

func nsAdmin(nsID string) *auth.User {
	return &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: nsID, Email: "admin@example.com"}
}

func sysAdmin() *auth.User {
	return &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin, Email: "sysadmin@example.com"}
}

// --- Namespace-scoped tests ---

func TestListInvitations_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	repo := &mockInvitationRepo{
		listInvitationsFn: func(_ context.Context, filters store.InvitationFilters) ([]store.Invitation, error) {
			if filters.NamespaceID == nil || *filters.NamespaceID != "test-ns" {
				t.Fatalf("expected namespace filter test-ns, got %v", filters.NamespaceID)
			}
			return []store.Invitation{*inv}, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.Invitation
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 || got[0].Email != "alice@example.com" {
		t.Errorf("unexpected result: %+v", got)
	}
}

func TestListInvitations_Empty(t *testing.T) {
	repo := &mockInvitationRepo{
		listInvitationsFn: func(_ context.Context, _ store.InvitationFilters) ([]store.Invitation, error) {
			return nil, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if body := rec.Body.String(); body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListInvitations_CrossNamespace_Forbidden(t *testing.T) {
	repo := &mockInvitationRepo{
		listInvitationsFn: func(_ context.Context, _ store.InvitationFilters) ([]store.Invitation, error) {
			t.Fatal("should not reach repo")
			return nil, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withNsCtx(req, "other-ns", nsAdmin("my-ns"))
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListInvitations_InternalError(t *testing.T) {
	repo := &mockInvitationRepo{
		listInvitationsFn: func(_ context.Context, _ store.InvitationFilters) ([]store.Invitation, error) {
			return nil, errors.New("db error")
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestCreateInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	emailCli := &mockEmailClient{}
	repo := &mockInvitationRepo{
		createInvitationFn: func(_ context.Context, params store.CreateInvitationParams) (*store.Invitation, error) {
			if params.Email != "alice@example.com" {
				t.Fatalf("unexpected email: %s", params.Email)
			}
			if params.TargetRole != "instructor" {
				t.Fatalf("unexpected role: %s", params.TargetRole)
			}
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace: %s", params.NamespaceID)
			}
			return inv, nil
		},
	}

	h := invitationHandler(repo, emailCli)
	body, _ := json.Marshal(map[string]any{
		"email":       "alice@example.com",
		"target_role": "instructor",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !emailCli.sendCalled {
		t.Error("expected email to be sent")
	}
}

func TestCreateInvitation_InvalidBody(t *testing.T) {
	h := invitationHandler(&mockInvitationRepo{}, nil)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateInvitation_MissingFields(t *testing.T) {
	h := invitationHandler(&mockInvitationRepo{}, nil)
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateInvitation_InvalidRole(t *testing.T) {
	h := invitationHandler(&mockInvitationRepo{}, nil)
	body, _ := json.Marshal(map[string]any{
		"email":       "alice@example.com",
		"target_role": "student",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateInvitation_InternalError(t *testing.T) {
	repo := &mockInvitationRepo{
		createInvitationFn: func(_ context.Context, _ store.CreateInvitationParams) (*store.Invitation, error) {
			return nil, errors.New("db error")
		},
	}

	h := invitationHandler(repo, nil)
	body, _ := json.Marshal(map[string]any{
		"email":       "alice@example.com",
		"target_role": "instructor",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withNsCtx(req, "test-ns", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, id uuid.UUID) (*store.Invitation, error) {
			if id != inv.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/"+inv.ID.String(), nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetInvitation_NotFound(t *testing.T) {
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}

	h := invitationHandler(repo, nil)
	id := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	req = withInvCtx(req, "test-ns", id.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetInvitation_WrongNamespace(t *testing.T) {
	inv := testInvitation("other-ns")
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/"+inv.ID.String(), nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetInvitation_InvalidID(t *testing.T) {
	h := invitationHandler(&mockInvitationRepo{}, nil)
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	req = withInvCtx(req, "test-ns", "not-a-uuid", nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestRevokeInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	now := time.Now()
	inv.RevokedAt = &now
	inv.Status = "revoked"

	repo := &mockInvitationRepo{
		revokeInvitationFn: func(_ context.Context, id uuid.UUID) (*store.Invitation, error) {
			if id != inv.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+inv.ID.String(), nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Revoke(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRevokeInvitation_NotFound(t *testing.T) {
	repo := &mockInvitationRepo{
		revokeInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}

	h := invitationHandler(repo, nil)
	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	req = withInvCtx(req, "test-ns", id.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Revoke(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestResendInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	emailCli := &mockEmailClient{}
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, emailCli)
	req := httptest.NewRequest(http.MethodPost, "/"+inv.ID.String()+"/resend", nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Resend(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !emailCli.sendCalled {
		t.Error("expected email to be sent")
	}
}

func TestResendInvitation_NotPending(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "revoked"
	now := time.Now()
	inv.RevokedAt = &now

	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodPost, "/"+inv.ID.String()+"/resend", nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Resend(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestResendInvitation_EmailError(t *testing.T) {
	inv := testInvitation("test-ns")
	emailCli := &mockEmailClient{sendErr: errors.New("email error")}
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, emailCli)
	req := httptest.NewRequest(http.MethodPost, "/"+inv.ID.String()+"/resend", nil)
	req = withInvCtx(req, "test-ns", inv.ID.String(), nsAdmin("test-ns"))
	rec := httptest.NewRecorder()

	h.Resend(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- RBAC tests via Routes() ---

func TestInvitationRoutes_StudentForbidden(t *testing.T) {
	repo := &mockInvitationRepo{}
	h := invitationHandler(repo, nil)
	router := chi.NewRouter()
	router.Route("/namespaces/{id}/invitations", func(r chi.Router) {
		r.Mount("/", h.Routes())
	})

	req := httptest.NewRequest(http.MethodGet, "/namespaces/test-ns/invitations/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemRoutes_NonSystemAdminForbidden(t *testing.T) {
	repo := &mockInvitationRepo{}
	h := invitationHandler(repo, nil)
	router := chi.NewRouter()
	router.Mount("/system/invitations", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodGet, "/system/invitations/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for namespace-admin on system routes, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- System-level tests ---

func TestSystemListInvitations_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	repo := &mockInvitationRepo{
		listInvitationsFn: func(_ context.Context, filters store.InvitationFilters) ([]store.Invitation, error) {
			return []store.Invitation{*inv}, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), sysAdmin())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.SystemList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemCreateInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	repo := &mockInvitationRepo{
		createInvitationFn: func(_ context.Context, params store.CreateInvitationParams) (*store.Invitation, error) {
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace: %s", params.NamespaceID)
			}
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	body, _ := json.Marshal(map[string]any{
		"email":        "alice@example.com",
		"target_role":  "instructor",
		"namespace_id": "test-ns",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), sysAdmin())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.SystemCreate(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemCreateInvitation_MissingNamespace(t *testing.T) {
	h := invitationHandler(&mockInvitationRepo{}, nil)
	body, _ := json.Marshal(map[string]any{
		"email":       "alice@example.com",
		"target_role": "instructor",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), sysAdmin())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.SystemCreate(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemGetInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, id uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodGet, "/"+inv.ID.String(), nil)
	req = withSystemInvCtx(req, inv.ID.String(), sysAdmin())
	rec := httptest.NewRecorder()

	h.SystemGet(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemGetInvitation_NotFound(t *testing.T) {
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return nil, store.ErrNotFound
		},
	}

	h := invitationHandler(repo, nil)
	id := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	req = withSystemInvCtx(req, id.String(), sysAdmin())
	rec := httptest.NewRecorder()

	h.SystemGet(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestSystemRevokeInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	now := time.Now()
	inv.RevokedAt = &now
	inv.Status = "revoked"

	repo := &mockInvitationRepo{
		revokeInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+inv.ID.String(), nil)
	req = withSystemInvCtx(req, inv.ID.String(), sysAdmin())
	rec := httptest.NewRecorder()

	h.SystemRevoke(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSystemResendInvitation_Success(t *testing.T) {
	inv := testInvitation("test-ns")
	emailCli := &mockEmailClient{}
	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, emailCli)
	req := httptest.NewRequest(http.MethodPost, "/"+inv.ID.String()+"/resend", nil)
	req = withSystemInvCtx(req, inv.ID.String(), sysAdmin())
	rec := httptest.NewRecorder()

	h.SystemResend(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !emailCli.sendCalled {
		t.Error("expected email to be sent")
	}
}

func TestSystemResendInvitation_NotPending(t *testing.T) {
	inv := testInvitation("test-ns")
	inv.Status = "consumed"
	now := time.Now()
	inv.ConsumedAt = &now

	repo := &mockInvitationRepo{
		getInvitationFn: func(_ context.Context, _ uuid.UUID) (*store.Invitation, error) {
			return inv, nil
		},
	}

	h := invitationHandler(repo, nil)
	req := httptest.NewRequest(http.MethodPost, "/"+inv.ID.String()+"/resend", nil)
	req = withSystemInvCtx(req, inv.ID.String(), sysAdmin())
	rec := httptest.NewRecorder()

	h.SystemResend(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}
