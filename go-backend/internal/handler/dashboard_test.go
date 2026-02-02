package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// mockDashboardRepo implements store.DashboardRepository for testing.
type mockDashboardRepo struct {
	instructorDashboardFn func(ctx context.Context, userID uuid.UUID) ([]store.DashboardClass, error)
}

func (m *mockDashboardRepo) InstructorDashboard(ctx context.Context, userID uuid.UUID) ([]store.DashboardClass, error) {
	return m.instructorDashboardFn(ctx, userID)
}

// dashboardRepos creates a store.Repos with the given DashboardRepository mock.
type dashboardRepos struct {
	stubRepos
	dashboard *mockDashboardRepo
}

var _ store.Repos = (*dashboardRepos)(nil)

func (r *dashboardRepos) InstructorDashboard(ctx context.Context, userID uuid.UUID) ([]store.DashboardClass, error) {
	return r.dashboard.InstructorDashboard(ctx, userID)
}

func TestDashboard_Success(t *testing.T) {
	classID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	sectionID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	sessionID := uuid.MustParse("ffffffff-1111-2222-3333-444444444444")
	userID := uuid.MustParse("99999999-8888-7777-6666-555555555555")

	repo := &mockDashboardRepo{
		instructorDashboardFn: func(_ context.Context, id uuid.UUID) ([]store.DashboardClass, error) {
			if id != userID {
				t.Errorf("expected userID %s, got %s", userID, id)
			}
			return []store.DashboardClass{
				{
					ID:   classID,
					Name: "CS 101",
					Sections: []store.DashboardSection{
						{
							ID:               sectionID,
							Name:             "Section A",
							StudentCount:     25,
							ActiveSessionIDs: []uuid.UUID{sessionID},
						},
					},
				},
			}, nil
		},
	}

	h := NewDashboardHandler()
	req := httptest.NewRequest(http.MethodGet, "/instructor/dashboard", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, &dashboardRepos{dashboard: repo})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.Dashboard(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result []store.DashboardClass
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 class, got %d", len(result))
	}
	if result[0].ID != classID {
		t.Errorf("expected class ID %s, got %s", classID, result[0].ID)
	}
	if len(result[0].Sections) != 1 {
		t.Fatalf("expected 1 section, got %d", len(result[0].Sections))
	}
	sec := result[0].Sections[0]
	if sec.StudentCount != 25 {
		t.Errorf("expected 25 students, got %d", sec.StudentCount)
	}
	if len(sec.ActiveSessionIDs) != 1 || sec.ActiveSessionIDs[0] != sessionID {
		t.Errorf("unexpected active session IDs: %v", sec.ActiveSessionIDs)
	}
}

func TestDashboard_EmptyResult(t *testing.T) {
	userID := uuid.New()
	repo := &mockDashboardRepo{
		instructorDashboardFn: func(_ context.Context, _ uuid.UUID) ([]store.DashboardClass, error) {
			return nil, nil
		},
	}

	h := NewDashboardHandler()
	req := httptest.NewRequest(http.MethodGet, "/instructor/dashboard", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, &dashboardRepos{dashboard: repo})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.Dashboard(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var result []store.DashboardClass
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty array, got %d items", len(result))
	}
}

func TestDashboard_StoreError(t *testing.T) {
	userID := uuid.New()
	repo := &mockDashboardRepo{
		instructorDashboardFn: func(_ context.Context, _ uuid.UUID) ([]store.DashboardClass, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewDashboardHandler()
	req := httptest.NewRequest(http.MethodGet, "/instructor/dashboard", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, &dashboardRepos{dashboard: repo})
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.Dashboard(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestDashboard_NoAuth(t *testing.T) {
	h := NewDashboardHandler()
	req := httptest.NewRequest(http.MethodGet, "/instructor/dashboard", nil)
	// No auth, no repos needed since auth check comes first

	w := httptest.NewRecorder()
	h.Dashboard(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
