package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/executor"
	"github.com/jdelfino/eval/internal/store"
)

// mockExecutorClient implements ExecutorClient for testing.
type mockExecutorClient struct {
	executeFn func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

func (m *mockExecutorClient) Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
	return m.executeFn(ctx, req)
}

// execMockSessionStudentRepo implements store.SessionStudentRepository for execute tests.
type execMockSessionStudentRepo struct {
	joinSessionFn          func(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error)
	updateCodeFn           func(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error)
	listSessionStudentsFn  func(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error)
	getSessionStudentFn    func(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error)
}

func (m *execMockSessionStudentRepo) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return m.joinSessionFn(ctx, params)
}

func (m *execMockSessionStudentRepo) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error) {
	return m.updateCodeFn(ctx, sessionID, userID, code)
}

func (m *execMockSessionStudentRepo) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return m.listSessionStudentsFn(ctx, sessionID)
}

func (m *execMockSessionStudentRepo) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error) {
	return m.getSessionStudentFn(ctx, sessionID, userID)
}

var (
	testSessionID   = uuid.MustParse("11111111-2222-3333-4444-555555555555")
	testCreatorID   = uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	testStudentID   = uuid.MustParse("dddddddd-dddd-dddd-dddd-dddddddddddd")
	testOutsiderID  = uuid.MustParse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
)

func activeSession() *store.Session {
	return &store.Session{
		ID:           testSessionID,
		NamespaceID:  "test-ns",
		CreatorID:    testCreatorID,
		Participants: []uuid.UUID{testStudentID},
		Status:       "active",
		Problem:      json.RawMessage(`{"title":"Test"}`),
	}
}

func completedSession() *store.Session {
	s := activeSession()
	s.Status = "completed"
	return s
}

func newExecuteReq(studentID uuid.UUID, code string) []byte {
	b, _ := json.Marshal(map[string]any{
		"student_id": studentID,
		"code":       code,
	})
	return b
}

func setupExecuteHandler(
	sessionRepo store.SessionRepository,
	studentRepo store.SessionStudentRepository,
	execClient ExecutorClient,
) http.Handler {
	h := NewExecuteHandler(sessionRepo, studentRepo, execClient)
	r := chi.NewRouter()
	r.Post("/sessions/{id}/execute", h.Execute)
	return r
}

func TestExecute_HappyPathInstructor(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Success:         true,
				Output:          "hello\n",
				ExecutionTimeMs: 45,
			}, nil
		},
	}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, `print("hello")`)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp executor.ExecuteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !resp.Success {
		t.Fatal("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Fatalf("expected output 'hello\\n', got %q", resp.Output)
	}
}

func TestExecute_HappyPathStudent(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, `print("ok")`)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_400SessionCompleted(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return completedSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_403NotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testOutsiderID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_403StudentExecutingForAnother(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	// Student tries to execute code for the creator (another user)
	body := newExecuteReq(testCreatorID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_404SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	studentRepo := &execMockSessionStudentRepo{}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_500ExecutorError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return nil, fmt.Errorf("executor: connection refused")
		},
	}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_401MissingAuthContext(t *testing.T) {
	handler := setupExecuteHandler(&mockSessionRepo{}, &execMockSessionStudentRepo{}, &mockExecutorClient{})
	body := newExecuteReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// No auth context set
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_400InvalidUUID(t *testing.T) {
	handler := setupExecuteHandler(&mockSessionRepo{}, &execMockSessionStudentRepo{}, &mockExecutorClient{})
	body := newExecuteReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, "/sessions/not-a-uuid/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_400InvalidJSONBody(t *testing.T) {
	handler := setupExecuteHandler(&mockSessionRepo{}, &execMockSessionStudentRepo{}, &mockExecutorClient{})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader([]byte("{invalid json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_MergesExecutionSettings(t *testing.T) {
	seed42 := 42
	problemJSON := json.RawMessage(`{"title":"Test","execution_settings":{"stdin":"problem-stdin","random_seed":10}}`)

	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			s := activeSession()
			s.Problem = problemJSON
			return s, nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return &store.SessionStudent{
				ExecutionSettings: json.RawMessage(`{"stdin":"student-stdin"}`),
			}, nil
		},
	}

	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true}, nil
		},
	}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	// Request overrides random_seed but not stdin
	bodyMap := map[string]any{
		"student_id": testCreatorID,
		"code":       "x",
		"execution_settings": map[string]any{
			"random_seed": seed42,
		},
	}
	bodyBytes, _ := json.Marshal(bodyMap)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// stdin should come from student record (layer 2 overrides problem layer 1)
	if capturedReq.Stdin != "student-stdin" {
		t.Fatalf("expected stdin 'student-stdin', got %q", capturedReq.Stdin)
	}
	// random_seed should come from request (layer 3 overrides all)
	if capturedReq.RandomSeed == nil || *capturedReq.RandomSeed != 42 {
		t.Fatalf("expected random_seed 42, got %v", capturedReq.RandomSeed)
	}
}
