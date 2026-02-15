package handler

import (
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

// --- Mock repositories for admin tests ---

type mockAuditLogRepo struct {
	listFn   func(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error)
	createFn func(ctx context.Context, params store.CreateAuditLogParams) (*store.AuditLog, error)
}

func (m *mockAuditLogRepo) ListAuditLogs(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error) {
	return m.listFn(ctx, filters)
}

func (m *mockAuditLogRepo) CreateAuditLog(ctx context.Context, params store.CreateAuditLogParams) (*store.AuditLog, error) {
	return m.createFn(ctx, params)
}

type mockAdminRepo struct {
	statsFn     func(ctx context.Context) (*store.AdminStats, error)
	clearDataFn func(ctx context.Context, keepUserID uuid.UUID) error
}

func (m *mockAdminRepo) AdminStats(ctx context.Context) (*store.AdminStats, error) {
	return m.statsFn(ctx)
}

func (m *mockAdminRepo) ClearData(ctx context.Context, keepUserID uuid.UUID) error {
	return m.clearDataFn(ctx, keepUserID)
}

// adminTestRepos embeds stubRepos and includes specific mocks for admin handler tests
type adminTestRepos struct {
	stubRepos
	adminRepo   *mockAdminRepo
	auditLogRepo *mockAuditLogRepo
}

var _ store.Repos = (*adminTestRepos)(nil)

// AdminStats delegates to the embedded mock if set
func (a *adminTestRepos) AdminStats(ctx context.Context) (*store.AdminStats, error) {
	if a.adminRepo != nil {
		return a.adminRepo.AdminStats(ctx)
	}
	return a.stubRepos.AdminStats(ctx)
}

// ClearData delegates to the embedded mock if set
func (a *adminTestRepos) ClearData(ctx context.Context, keepUserID uuid.UUID) error {
	if a.adminRepo != nil {
		return a.adminRepo.ClearData(ctx, keepUserID)
	}
	return a.stubRepos.ClearData(ctx, keepUserID)
}

// ListAuditLogs delegates to the embedded mock if set
func (a *adminTestRepos) ListAuditLogs(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error) {
	if a.auditLogRepo != nil {
		return a.auditLogRepo.ListAuditLogs(ctx, filters)
	}
	return a.stubRepos.ListAuditLogs(ctx, filters)
}

// CreateAuditLog delegates to the embedded mock if set
func (a *adminTestRepos) CreateAuditLog(ctx context.Context, params store.CreateAuditLogParams) (*store.AuditLog, error) {
	if a.auditLogRepo != nil {
		return a.auditLogRepo.CreateAuditLog(ctx, params)
	}
	return a.stubRepos.CreateAuditLog(ctx, params)
}

// --- Tests ---

func TestAdminStats_Success(t *testing.T) {
	stats := &store.AdminStats{
		UsersByRole:    map[string]int{"student": 10, "instructor": 3},
		ClassCount:     5,
		SectionCount:   8,
		ActiveSessions: 2,
	}
	repo := &mockAdminRepo{
		statsFn: func(ctx context.Context) (*store.AdminStats, error) {
			return stats, nil
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{adminRepo: repo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.Stats(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var got store.AdminStats
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ClassCount != 5 {
		t.Errorf("expected ClassCount=5, got %d", got.ClassCount)
	}
	if got.ActiveSessions != 2 {
		t.Errorf("expected ActiveSessions=2, got %d", got.ActiveSessions)
	}
}

func TestAdminStats_RepoError(t *testing.T) {
	repo := &mockAdminRepo{
		statsFn: func(ctx context.Context) (*store.AdminStats, error) {
			return nil, errors.New("db error")
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{adminRepo: repo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.Stats(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestAdminAudit_Success(t *testing.T) {
	actorID := uuid.New()
	logs := []store.AuditLog{
		{
			ID:          uuid.New(),
			NamespaceID: "ns1",
			Action:      "user.create",
			ActorID:     &actorID,
			CreatedAt:   time.Now(),
		},
	}
	auditRepo := &mockAuditLogRepo{
		listFn: func(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error) {
			if filters.Limit != 50 {
				t.Errorf("expected default limit=50, got %d", filters.Limit)
			}
			return logs, nil
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{auditLogRepo: auditRepo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.AuditLog(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var got []store.AuditLog
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 log, got %d", len(got))
	}
}

func TestAdminAudit_WithFilters(t *testing.T) {
	actorID := uuid.New()
	auditRepo := &mockAuditLogRepo{
		listFn: func(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error) {
			if filters.Limit != 10 {
				t.Errorf("expected limit=10, got %d", filters.Limit)
			}
			if filters.Offset != 5 {
				t.Errorf("expected offset=5, got %d", filters.Offset)
			}
			if filters.Action == nil || *filters.Action != "user.create" {
				t.Errorf("expected action=user.create")
			}
			if filters.ActorID == nil || *filters.ActorID != actorID {
				t.Errorf("expected actorID=%s", actorID)
			}
			return []store.AuditLog{}, nil
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodGet,
		"/audit?limit=10&offset=5&action=user.create&actor_id="+actorID.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{auditLogRepo: auditRepo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.AuditLog(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestAdminAudit_RepoError(t *testing.T) {
	auditRepo := &mockAuditLogRepo{
		listFn: func(ctx context.Context, filters store.AuditLogFilters) ([]store.AuditLog, error) {
			return nil, errors.New("db error")
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{auditLogRepo: auditRepo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.AuditLog(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestAdminClearData_Success(t *testing.T) {
	userID := uuid.New()
	repo := &mockAdminRepo{
		clearDataFn: func(ctx context.Context, keepUserID uuid.UUID) error {
			if keepUserID != userID {
				t.Errorf("expected keepUserID=%s, got %s", userID, keepUserID)
			}
			return nil
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodPost, "/clear-data", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: userID, Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{adminRepo: repo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.ClearData(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestAdminClearData_NoUser(t *testing.T) {
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodPost, "/clear-data", nil)
	w := httptest.NewRecorder()

	h.ClearData(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAdminClearData_RepoError(t *testing.T) {
	repo := &mockAdminRepo{
		clearDataFn: func(ctx context.Context, keepUserID uuid.UUID) error {
			return errors.New("db error")
		},
	}
	h := NewAdminHandler()

	req := httptest.NewRequest(http.MethodPost, "/clear-data", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID: uuid.New(), Role: auth.RoleSystemAdmin,
	})
	ctx = store.WithRepos(ctx, &adminTestRepos{adminRepo: repo})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.ClearData(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestAdminRoutes_MountsCorrectly(t *testing.T) {
	h := NewAdminHandler()

	router := h.Routes()
	if router == nil {
		t.Fatal("Routes() returned nil")
	}
}
