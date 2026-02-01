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

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// sessionStudentTestRepos embeds stubRepos for session student tests.
type sessionStudentTestRepos struct {
	stubRepos
	students *mockSessionStudentRepo
}

func (r *sessionStudentTestRepos) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return r.students.JoinSession(ctx, params)
}
func (r *sessionStudentTestRepos) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error) {
	return r.students.UpdateCode(ctx, sessionID, userID, code)
}
func (r *sessionStudentTestRepos) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return r.students.ListSessionStudents(ctx, sessionID)
}
func studRepos(repo *mockSessionStudentRepo) *sessionStudentTestRepos {
	return &sessionStudentTestRepos{students: repo}
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", uuid.New().String())
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestJoinSession_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/not-a-uuid/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestJoinSession_InvalidBody(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestJoinSession_MissingName(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+uuid.New().String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+uuid.New().String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", uuid.New().String())
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestUpdateCode_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/not-a-uuid/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateCode_MissingCode(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	body, _ := json.Marshal(map[string]any{})
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCode_InvalidBody(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+uuid.New().String()+"/code", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	sessionID := uuid.New()
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
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

	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, studRepos(repo))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestListStudents_InvalidID(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodGet, "/sessions/not-a-uuid/students", nil)
	ctx := withChiParam(req.Context(), "id", "not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, studRepos(&mockSessionStudentRepo{}))
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
	h := NewSessionStudentHandler(noopPublisher(), testLogger())
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sessionID.String()+"/students", nil)
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudents(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// --- Publisher integration tests ---

func TestJoinSession_PublishesStudentJoined(t *testing.T) {
	ss := testSessionStudent()
	userID := ss.UserID

	repo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return ss, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub, testLogger())

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.studentJoinedCalls) != 1 {
		t.Fatalf("expected 1 StudentJoined call, got %d", len(pub.studentJoinedCalls))
	}
	call := pub.studentJoinedCalls[0]
	if call.sessionID != ss.SessionID.String() {
		t.Errorf("expected session_id %q, got %q", ss.SessionID, call.sessionID)
	}
	if call.userID != userID.String() {
		t.Errorf("expected user_id %q, got %q", userID, call.userID)
	}
	if call.displayName != "Alice" {
		t.Errorf("expected displayName %q, got %q", "Alice", call.displayName)
	}
}

func TestJoinSession_SucceedsWhenPublisherFails(t *testing.T) {
	ss := testSessionStudent()

	repo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return ss, nil
		},
	}
	pub := newMockPublisherWithErr(errors.New("publish failed"))
	h := NewSessionStudentHandler(pub, testLogger())

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: ss.UserID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 even when publisher fails, got %d", rec.Code)
	}
}

func TestJoinSession_DBError_NoPublish(t *testing.T) {
	repo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}
	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub, testLogger())

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	time.Sleep(50 * time.Millisecond)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.studentJoinedCalls) != 0 {
		t.Errorf("expected no StudentJoined calls when DB fails, got %d", len(pub.studentJoinedCalls))
	}
}

func TestUpdateCode_PublishesCodeUpdated(t *testing.T) {
	ss := testSessionStudent()
	ss.Code = "print('hello')"
	userID := ss.UserID

	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return ss, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub, testLogger())

	body, _ := json.Marshal(map[string]any{"code": "print('hello')"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.codeUpdatedCalls) != 1 {
		t.Fatalf("expected 1 CodeUpdated call, got %d", len(pub.codeUpdatedCalls))
	}
	call := pub.codeUpdatedCalls[0]
	if call.sessionID != ss.SessionID.String() {
		t.Errorf("expected session_id %q, got %q", ss.SessionID, call.sessionID)
	}
	if call.userID != userID.String() {
		t.Errorf("expected user_id %q, got %q", userID, call.userID)
	}
	if call.code != "print('hello')" {
		t.Errorf("expected code %q, got %q", "print('hello')", call.code)
	}
}

func TestUpdateCode_SucceedsWhenPublisherFails(t *testing.T) {
	ss := testSessionStudent()
	ss.Code = "x"

	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return ss, nil
		},
	}
	pub := newMockPublisherWithErr(errors.New("publish failed"))
	h := NewSessionStudentHandler(pub, testLogger())

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: ss.UserID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 even when publisher fails, got %d", rec.Code)
	}
}

func TestUpdateCode_DBError_NoPublish(t *testing.T) {
	repo := &mockSessionStudentRepo{
		updateCodeFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}
	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub, testLogger())

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	time.Sleep(50 * time.Millisecond)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.codeUpdatedCalls) != 0 {
		t.Errorf("expected no CodeUpdated calls when DB fails, got %d", len(pub.codeUpdatedCalls))
	}
}
