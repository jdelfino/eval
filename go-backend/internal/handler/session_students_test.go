package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// sessionStudentTestRepos embeds stubRepos for session student tests.
type sessionStudentTestRepos struct {
	stubRepos
	students    *mockSessionStudentRepo
	sessions    *mockSessionRepo
	studentWork *mockStudentWorkRepo
}

var _ store.Repos = (*sessionStudentTestRepos)(nil)

func (r *sessionStudentTestRepos) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return r.students.JoinSession(ctx, params)
}
func (r *sessionStudentTestRepos) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return r.students.ListSessionStudents(ctx, sessionID)
}
func (r *sessionStudentTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	if r.sessions != nil && r.sessions.getSessionFn != nil {
		return r.sessions.getSessionFn(ctx, id)
	}
	return nil, store.ErrNotFound
}
func (r *sessionStudentTestRepos) GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	if r.studentWork != nil && r.studentWork.getOrCreateStudentWorkFn != nil {
		return r.studentWork.getOrCreateStudentWorkFn(ctx, namespaceID, userID, problemID, sectionID)
	}
	return nil, store.ErrNotFound
}
func (r *sessionStudentTestRepos) UpdateStudentWork(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	if r.studentWork != nil && r.studentWork.updateStudentWorkFn != nil {
		return r.studentWork.updateStudentWorkFn(ctx, id, params)
	}
	return nil, store.ErrNotFound
}
func (r *sessionStudentTestRepos) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error) {
	if r.students != nil && r.students.getSessionStudentFn != nil {
		return r.students.getSessionStudentFn(ctx, sessionID, userID)
	}
	return nil, store.ErrNotFound
}
func studRepos(repo *mockSessionStudentRepo) *sessionStudentTestRepos {
	return &sessionStudentTestRepos{students: repo}
}

// --- Join tests ---

func TestJoinSession_Success(t *testing.T) {
	ss := testSessionStudent()
	userID := ss.UserID
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = ss.SessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	studentRepo := &mockSessionStudentRepo{
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
			ss.StudentWorkID = params.StudentWorkID
			return ss, nil
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != ss.SessionID {
				t.Fatalf("unexpected session id: %v", id)
			}
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			if uID != userID {
				t.Errorf("expected user_id %v, got %v", userID, uID)
			}
			if pID != problemID {
				t.Errorf("expected problem_id %v, got %v", problemID, pID)
			}
			if sectID != sectionID {
				t.Errorf("expected section_id %v, got %v", sectionID, sectID)
			}
			return &store.StudentWork{
				ID:          studentWorkID,
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "",
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	sessionID := uuid.New()
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = sessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	studentRepo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:          uuid.New(),
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "",
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// --- UpdateCode tests ---

func TestUpdateCode_UpdatesCodeAndReturnsTestCases(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "print('hello')"
	testCases := json.RawMessage(`[{"name":"My Case","input":"hello","match_type":"exact","order":0}]`)
	userID := ss.UserID

	var capturedCode string
	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			capturedCode = *params.Code
			return &store.StudentWork{
				ID:        id,
				Code:      *params.Code,
				TestCases: testCases,
			}, nil
		},
	}

	body := []byte(`{"code":"print('hello')"}`)
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify code was forwarded to the store.
	if capturedCode != "print('hello')" {
		t.Errorf("expected code %q forwarded to store, got %q", "print('hello')", capturedCode)
	}

	// Verify test_cases from student_work appears in the response.
	var got store.SessionStudent
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(got.TestCases) != string(testCases) {
		t.Errorf("expected test_cases %s in response, got %s", testCases, got.TestCases)
	}
}

func TestUpdateCode_OnlyCodeInRequest(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "x = 1"
	userID := ss.UserID

	var capturedParams store.UpdateStudentWorkParams
	var updateCalled bool
	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			capturedParams = params
			updateCalled = true
			return &store.StudentWork{
				ID:   id,
				Code: *params.Code,
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"code": "x = 1"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	if !updateCalled {
		t.Fatal("expected updateStudentWorkFn to be called")
	}
	// Only code is sent — TestCases should be nil in params (not updated).
	if capturedParams.TestCases != nil {
		t.Errorf("expected nil TestCases in UpdateStudentWorkParams, got %s", capturedParams.TestCases)
	}
}

func TestUpdateCode_Success(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "print('hello')"
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			if id != studentWorkID {
				t.Fatalf("unexpected student_work_id: %v", id)
			}
			if *params.Code != "print('hello')" {
				t.Fatalf("unexpected code: %v", *params.Code)
			}
			return &store.StudentWork{
				ID:   id,
				Code: *params.Code,
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"code": "print('hello')"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateCode_NilStudentWorkID(t *testing.T) {
	ss := testSessionStudent()
	// StudentWorkID is nil — should return 500 "student work not linked"
	ss.StudentWorkID = nil
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	sessionID := ss.SessionID
	body, _ := json.Marshal(map[string]any{"code": "x"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCode_InternalError(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return nil, errors.New("db error")
		},
	}

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateCode_EmptyCode(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = ""
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			if *params.Code != "" {
				t.Fatalf("expected empty code, got %q", *params.Code)
			}
			return &store.StudentWork{
				ID:   id,
				Code: "",
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"code": ""})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCode_OmittedCodeDefaultsToEmpty(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			if *params.Code != "" {
				t.Fatalf("expected empty code when field omitted, got %q", *params.Code)
			}
			return &store.StudentWork{
				ID:   studentWorkID,
				Code: "",
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCode_InvalidBody(t *testing.T) {
	h := NewSessionStudentHandler(noopPublisher())
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

	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	h := NewSessionStudentHandler(noopPublisher())
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
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = ss.SessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	studentRepo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:          studentWorkID,
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "",
			}, nil
		},
	}

	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub)

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
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
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = ss.SessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	studentRepo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:          studentWorkID,
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "",
			}, nil
		},
	}

	pub := newMockPublisherWithErr(errors.New("publish failed"))
	h := NewSessionStudentHandler(pub)

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: ss.UserID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 even when publisher fails, got %d", rec.Code)
	}
}

func TestJoinSession_DBError_NoPublish(t *testing.T) {
	sessionID := uuid.New()
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = sessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	studentRepo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return nil, errors.New("db error")
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:          uuid.New(),
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "",
			}, nil
		},
	}

	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub)

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
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
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "print('hello')"
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:   studentWorkID,
				Code: *params.Code,
			}, nil
		},
	}

	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub)

	body, _ := json.Marshal(map[string]any{"code": "print('hello')"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
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

// TestUpdateCode_PublishesCodeUpdatedEvent verifies that a CodeUpdated event is
// published with the correct session ID, user ID, and code when UpdateCode is called.
func TestUpdateCode_PublishesCodeUpdatedEvent(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "x = 1"
	userID := ss.UserID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:   studentWorkID,
				Code: *params.Code,
			}, nil
		},
	}

	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub)

	newCode := "x = 2"
	body, _ := json.Marshal(map[string]any{"code": newCode})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
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
		t.Errorf("expected sessionID %q in publisher call, got %q", ss.SessionID.String(), call.sessionID)
	}
	if call.userID != userID.String() {
		t.Errorf("expected userID %q in publisher call, got %q", userID.String(), call.userID)
	}
	if call.code != newCode {
		t.Errorf("expected code %q in publisher call, got %q", newCode, call.code)
	}
}

func TestUpdateCode_SucceedsWhenPublisherFails(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	ss.Code = "x"

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return &store.StudentWork{
				ID:   studentWorkID,
				Code: *params.Code,
			}, nil
		},
	}

	pub := newMockPublisherWithErr(errors.New("publish failed"))
	h := NewSessionStudentHandler(pub)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: ss.UserID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 even when publisher fails, got %d", rec.Code)
	}
}

func TestUpdateCode_DBError_NoPublish(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return nil, errors.New("db error")
		},
	}

	pub := newMockPublisher()
	h := NewSessionStudentHandler(pub)

	sessionID := uuid.New()
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+sessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
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

// TestJoinSession_EmptyNamespace verifies that system-admin users (empty NamespaceID)
// get a 400 error instead of a FK violation when trying to join a session.
func TestJoinSession_EmptyNamespace(t *testing.T) {
	sessionID := uuid.New()
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	sess := testSession()
	sess.ID = sessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Admin"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sessionID.String())
	// system-admin has empty NamespaceID
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), NamespaceID: "", Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(&mockSessionStudentRepo{}, sessionRepo, &mockStudentWorkRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}
