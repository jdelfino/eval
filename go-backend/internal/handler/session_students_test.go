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

// mockSessionStudentRepo implements store.SessionStudentRepository for testing.
type mockSessionStudentRepo struct {
	joinSessionFn        func(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error)
	updateCodeFn         func(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error)
	listSessionStudentFn func(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error)
	getSessionStudentFn  func(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error)
}

func (m *mockSessionStudentRepo) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return m.joinSessionFn(ctx, params)
}

func (m *mockSessionStudentRepo) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error) {
	return m.updateCodeFn(ctx, sessionID, userID, code)
}

func (m *mockSessionStudentRepo) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return m.listSessionStudentFn(ctx, sessionID)
}

func (m *mockSessionStudentRepo) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error) {
	return m.getSessionStudentFn(ctx, sessionID, userID)
}

func testSessionStudent() *store.SessionStudent {
	return &store.SessionStudent{
		ID:                uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		SessionID:         uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		UserID:            uuid.MustParse("33333333-3333-3333-3333-333333333333"),
		Name:              "Alice",
		Code:              "",
		ExecutionSettings: json.RawMessage(`null`),
		LastUpdate:        time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func withChiParam(ctx context.Context, key, value string) context.Context {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return context.WithValue(ctx, chi.RouteCtxKey, rctx)
}

// --- Join tests ---

func TestJoinSession_Success(t *testing.T) {
	ss := testSessionStudent()
	userID := ss.UserID

	repo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
			if params.SessionID != ss.SessionID {
				t.Fatalf("unexpected session_id: %v", params.SessionID)
			}
			if params.UserID != userID {
				t.Fatalf("unexpected user_id: %v", params.UserID)
			}
			if params.Name != "Alice" {
				t.Fatalf("unexpected name: %v", params.Name)
			}
			return ss, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.SessionStudent
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != ss.ID {
		t.Errorf("expected id %q, got %q", ss.ID, got.ID)
	}
}

func TestJoinSession_Unauthorized(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", uuid.New().String())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestJoinSession_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/not-a-uuid/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestJoinSession_InvalidBody(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestJoinSession_MissingName(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestJoinSession_InternalError(t *testing.T) {
	repo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	h := NewSessionStudentHandler(repo)
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// --- UpdateCode tests ---

func TestUpdateCode_Success(t *testing.T) {
	ss := testSessionStudent()
	ss.Code = "print('hello')"
	userID := ss.UserID

	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, sessID, uID uuid.UUID, code string) (*store.SessionStudent, error) {
			if sessID != ss.SessionID {
				t.Fatalf("unexpected session_id: %v", sessID)
			}
			if uID != userID {
				t.Fatalf("unexpected user_id: %v", uID)
			}
			if code != "print('hello')" {
				t.Fatalf("unexpected code: %v", code)
			}
			return ss, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"code": "print('hello')"})
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.SessionStudent
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Code != "print('hello')" {
		t.Errorf("expected code %q, got %q", "print('hello')", got.Code)
	}
}

func TestUpdateCode_Unauthorized(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+uuid.New().String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", uuid.New().String())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestUpdateCode_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/not-a-uuid/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateCode_NotFound(t *testing.T) {
	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateCode_InternalError(t *testing.T) {
	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateCode_InvalidBody(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+uuid.New().String()+"/code", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// --- ListStudents tests ---

func TestListStudents_Success(t *testing.T) {
	ss := testSessionStudent()
	sessionID := ss.SessionID

	repo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, sessID uuid.UUID) ([]store.SessionStudent, error) {
			if sessID != sessionID {
				t.Fatalf("unexpected session_id: %v", sessID)
			}
			return []store.SessionStudent{*ss}, nil
		},
	}

	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.SessionStudent
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 student, got %d", len(got))
	}
	if got[0].ID != ss.ID {
		t.Errorf("expected id %q, got %q", ss.ID, got[0].ID)
	}
}

func TestListStudents_Empty(t *testing.T) {
	repo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return nil, nil
		},
	}

	sessionID := uuid.New()
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListStudents_Unauthorized(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestListStudents_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(&mockSessionStudentRepo{})
	req := httptest.NewRequest(http.MethodGet, "/sessions/not-a-uuid/students", nil)
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListStudents_InternalError(t *testing.T) {
	repo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}

	sessionID := uuid.New()
	h := NewSessionStudentHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}
