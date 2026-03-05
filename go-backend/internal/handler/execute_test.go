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

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/store"
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
	joinSessionFn         func(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error)
	listSessionStudentsFn func(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error)
	getSessionStudentFn   func(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error)
}

func (m *execMockSessionStudentRepo) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return m.joinSessionFn(ctx, params)
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
		Problem:      json.RawMessage(`{"title":"Test","language":"python"}`),
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

// executeTestRepos embeds stubRepos and overrides session/student methods.
type executeTestRepos struct {
	stubRepos
	sessions *mockSessionRepo
	students *execMockSessionStudentRepo
}

var _ store.Repos = (*executeTestRepos)(nil)

func (r *executeTestRepos) ListSessions(ctx context.Context, filters store.SessionFilters) ([]store.Session, error) {
	return r.sessions.ListSessions(ctx, filters)
}
func (r *executeTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sessions.GetSession(ctx, id)
}
func (r *executeTestRepos) CreateSession(ctx context.Context, params store.CreateSessionParams) (*store.Session, error) {
	return r.sessions.CreateSession(ctx, params)
}
func (r *executeTestRepos) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return r.sessions.UpdateSession(ctx, id, params)
}
func (r *executeTestRepos) ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters store.SessionHistoryFilters) ([]store.Session, error) {
	return r.sessions.ListSessionHistory(ctx, userID, isCreator, filters)
}
func (r *executeTestRepos) UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*store.Session, error) {
	return r.sessions.UpdateSessionProblem(ctx, id, problem)
}
func (r *executeTestRepos) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return r.students.JoinSession(ctx, params)
}
func (r *executeTestRepos) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return r.students.ListSessionStudents(ctx, sessionID)
}
func (r *executeTestRepos) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error) {
	return r.students.GetSessionStudent(ctx, sessionID, userID)
}

func setupExecuteHandler(
	sessionRepo *mockSessionRepo,
	studentRepo *execMockSessionStudentRepo,
	execClient ExecutorClient,
) http.Handler {
	h := NewExecuteHandler(execClient)
	repos := &executeTestRepos{sessions: sessionRepo, students: studentRepo}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
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

func TestExecute_400StudentIDNotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	// Instructor passes an outsider UUID as student_id
	body := newExecuteReq(testOutsiderID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["error"] != "student_id is not a participant in this session" {
		t.Fatalf("unexpected error message: %s", resp["error"])
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

func TestMergeExecutionSettings_FilesOverrideBetweenLayers(t *testing.T) {
	// Layer 1 (problem) has file A, layer 2 (student record) has file B.
	// Files from layer 2 should completely replace layer 1 files.
	problemJSON := json.RawMessage(`{"execution_settings":{"files":[{"name":"a.txt","content":"from-problem"}]}}`)
	studentRecord := &store.SessionStudent{
		ExecutionSettings: json.RawMessage(`{"files":[{"name":"b.txt","content":"from-student"}]}`),
	}

	result := mergeExecutionSettings(problemJSON, studentRecord, nil)

	if len(result.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(result.Files))
	}
	if result.Files[0].Name != "b.txt" {
		t.Errorf("expected file 'b.txt' from student layer, got %q", result.Files[0].Name)
	}
	if result.Files[0].Content != "from-student" {
		t.Errorf("expected content 'from-student', got %q", result.Files[0].Content)
	}
}

func TestMergeExecutionSettings_MalformedProblemJSON(t *testing.T) {
	// Malformed problem JSON should be gracefully ignored.
	problemJSON := json.RawMessage(`{not valid json`)
	stdin := "request-stdin"
	reqSettings := &executionSettingsJSON{Stdin: &stdin}

	result := mergeExecutionSettings(problemJSON, nil, reqSettings)

	if result.Stdin == nil || *result.Stdin != "request-stdin" {
		t.Errorf("expected stdin 'request-stdin', got %v", result.Stdin)
	}
}

func TestMergeExecutionSettings_NilProblemWithStudentRecord(t *testing.T) {
	// Nil/empty problem JSON with student record settings.
	stdin := "student-stdin"
	studentRecord := &store.SessionStudent{
		ExecutionSettings: json.RawMessage(`{"stdin":"student-stdin","random_seed":7}`),
	}

	result := mergeExecutionSettings(nil, studentRecord, nil)

	if result.Stdin == nil || *result.Stdin != stdin {
		t.Errorf("expected stdin %q, got %v", stdin, result.Stdin)
	}
	if result.RandomSeed == nil || *result.RandomSeed != 7 {
		t.Errorf("expected random_seed 7, got %v", result.RandomSeed)
	}
}

func TestMergeExecutionSettings_AllLayersEmpty(t *testing.T) {
	// All three layers are nil/empty — result should be zero-value.
	result := mergeExecutionSettings(nil, nil, nil)

	if result.Stdin != nil {
		t.Errorf("expected nil stdin, got %v", result.Stdin)
	}
	if result.RandomSeed != nil {
		t.Errorf("expected nil random_seed, got %v", result.RandomSeed)
	}
	if len(result.Files) != 0 {
		t.Errorf("expected no files, got %d", len(result.Files))
	}
}

// --- StandaloneExecute tests ---

func setupStandaloneExecuteHandler(execClient ExecutorClient) http.Handler {
	h := NewExecuteHandler(execClient)
	r := chi.NewRouter()
	r.Post("/execute", h.StandaloneExecute)
	return r
}

func TestStandaloneExecute_HappyPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Success:         true,
				Output:          "hello\n",
				ExecutionTimeMs: 30,
			}, nil
		},
	}

	handler := setupStandaloneExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     `print("hello")`,
		"language": "python",
		"stdin":    "some input",
		"files":    []map[string]string{{"name": "test.txt", "content": "data"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
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
		t.Fatalf("unmarshal: %v", err)
	}
	if !resp.Success {
		t.Fatal("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Fatalf("expected output 'hello\\n', got %q", resp.Output)
	}
	// Verify executor received correct fields
	if capturedReq.Code != `print("hello")` {
		t.Fatalf("expected code forwarded, got %q", capturedReq.Code)
	}
	if capturedReq.Stdin != "some input" {
		t.Fatalf("expected stdin 'some input', got %q", capturedReq.Stdin)
	}
	if len(capturedReq.Files) != 1 || capturedReq.Files[0].Name != "test.txt" {
		t.Fatalf("expected 1 file 'test.txt', got %v", capturedReq.Files)
	}
}

func TestStandaloneExecute_MinimalRequest(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupStandaloneExecuteHandler(execClient)
	// Language is now required — provide "python" explicitly.
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_401NoAuth(t *testing.T) {
	handler := setupStandaloneExecuteHandler(&mockExecutorClient{})
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_422MissingCode(t *testing.T) {
	handler := setupStandaloneExecuteHandler(&mockExecutorClient{})
	body, _ := json.Marshal(map[string]any{"language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_400InvalidJSON(t *testing.T) {
	handler := setupStandaloneExecuteHandler(&mockExecutorClient{})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader([]byte("{bad")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_500ExecutorError(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return nil, fmt.Errorf("connection refused")
		},
	}

	handler := setupStandaloneExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_429PropagatedFromExecutor(t *testing.T) {
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
			return nil, &executor.StatusError{Code: http.StatusTooManyRequests, Body: "rate limit exceeded"}
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

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_LanguagePassedToExecutor(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupStandaloneExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "class Main {}", "language": "java"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Language != "java" {
		t.Fatalf("expected language 'java' forwarded to executor, got %q", capturedReq.Language)
	}
}

func TestStandaloneExecute_EmptyLanguageReturns400(t *testing.T) {
	execClient := &mockExecutorClient{}

	handler := setupStandaloneExecuteHandler(execClient)
	// No language field — must now return 400 (no python default).
	body, _ := json.Marshal(map[string]any{"code": "print('hi')"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneExecute_400InvalidLanguage(t *testing.T) {
	execClient := &mockExecutorClient{}

	handler := setupStandaloneExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "ruby"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionExecute_LanguageFromProblemJSON(t *testing.T) {
	// Problem JSON contains language: "java"
	problemJSON := json.RawMessage(`{"title":"Java Problem","language":"java"}`)

	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			s := activeSession()
			s.Problem = problemJSON
			return s, nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
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
	body := newExecuteReq(testStudentID, "class Main {}")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Language != "java" {
		t.Fatalf("expected language 'java' from problem JSON, got %q", capturedReq.Language)
	}
}

func TestSessionExecute_EmptyLanguageInProblemReturns400(t *testing.T) {
	// Problem JSON has no language field — must now return 400 (no python default).
	problemJSON := json.RawMessage(`{"title":"No Language Problem"}`)

	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			s := activeSession()
			s.Problem = problemJSON
			return s, nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, "print('hi')")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when problem has no language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExtractLanguageFromProblem_ReturnsLanguageField(t *testing.T) {
	got, err := extractLanguageFromProblem(json.RawMessage(`{"language":"java","title":"test"}`))
	if err != nil || got != "java" {
		t.Errorf("expected 'java', got %q, err %v", got, err)
	}
}

// --- New behavior tests: no defaults to python ---

func TestNormalizeLanguage_EmptyReturnsError(t *testing.T) {
	_, err := normalizeLanguage("")
	if err == nil {
		t.Error("expected error for empty language, got nil")
	}
}

// TestExtractLanguageFromProblem_NewBehavior tests the new error-returning behavior.
// These tests exercise the new (string, error) signature after implementation.
// Before implementation, extractLanguageFromProblem returns (string) — these tests
// are placeholders that will be populated to the correct form during implementation.
func TestExtractLanguageFromProblem_MissingFieldReturnsError(t *testing.T) {
	lang, err := extractLanguageFromProblem(json.RawMessage(`{"title":"test"}`))
	if err == nil {
		t.Errorf("expected error when language field is missing, got lang=%q and nil error", lang)
	}
}

func TestExtractLanguageFromProblem_EmptyLanguageValueReturnsError(t *testing.T) {
	lang, err := extractLanguageFromProblem(json.RawMessage(`{"language":""}`))
	if err == nil {
		t.Errorf("expected error for empty language value, got lang=%q and nil error", lang)
	}
}

func TestExtractLanguageFromProblem_MalformedJSONReturnsError(t *testing.T) {
	lang, err := extractLanguageFromProblem(json.RawMessage(`{not valid`))
	if err == nil {
		t.Errorf("expected error for malformed JSON, got lang=%q and nil error", lang)
	}
}

func TestExtractLanguageFromProblem_NilJSONReturnsError(t *testing.T) {
	lang, err := extractLanguageFromProblem(nil)
	if err == nil {
		t.Errorf("expected error for nil JSON, got lang=%q and nil error", lang)
	}
}

func TestExtractLanguageFromProblem_InvalidLanguageReturnsError(t *testing.T) {
	lang, err := extractLanguageFromProblem(json.RawMessage(`{"language":"ruby"}`))
	if err == nil {
		t.Errorf("expected error for invalid language 'ruby', got lang=%q and nil error", lang)
	}
}

func TestSessionExecute_MissingLanguageInProblemReturns400(t *testing.T) {
	// Problem JSON has no language field — should now return 400
	problemJSON := json.RawMessage(`{"title":"No Language Problem"}`)

	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			s := activeSession()
			s.Problem = problemJSON
			return s, nil
		},
	}
	studentRepo := &execMockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(sessRepo, studentRepo, execClient)
	body := newExecuteReq(testStudentID, "print('hi')")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/execute", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when problem has no language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkExecute_LanguageSetFromProblem(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()
	namespaceID := "test-ns"
	code := "class Main { public static void main(String[] args) {} }"

	reqBody := executeStudentWorkRequest{
		Code: code,
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        workID,
			UserID:    userID,
			ProblemID: problemID,
			Code:      code,
		},
		Problem: store.Problem{
			ID:       problemID,
			Title:    "Java Problem",
			Language: "java",
		},
	}

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	h := NewStudentWorkHandler(execClient)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Language != "java" {
		t.Fatalf("expected language 'java' set from problem, got %q", capturedReq.Language)
	}
}

func TestStudentWorkExecute_MissingLanguageReturns400(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()
	namespaceID := "test-ns"
	code := "print('hi')"

	reqBody := executeStudentWorkRequest{
		Code: code,
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        workID,
			UserID:    userID,
			ProblemID: problemID,
			Code:      code,
		},
		Problem: store.Problem{
			ID:       problemID,
			Title:    "No Language Problem",
			Language: "", // no language set
		},
	}

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	h := NewStudentWorkHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when problem has no language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNormalizeLanguage_PythonReturnsAsIs(t *testing.T) {
	got, err := normalizeLanguage("python")
	if err != nil || got != "python" {
		t.Errorf("expected 'python', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_JavaReturnsAsIs(t *testing.T) {
	got, err := normalizeLanguage("java")
	if err != nil || got != "java" {
		t.Errorf("expected 'java', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_EmptyReturnsErrorDuplicate(t *testing.T) {
	// Verify empty string returns error (covered also by TestNormalizeLanguage_EmptyReturnsError above).
	_, err := normalizeLanguage("")
	if err == nil {
		t.Error("expected error for empty language, got nil")
	}
}

func TestNormalizeLanguage_Python3AliasMapsTo_Python(t *testing.T) {
	got, err := normalizeLanguage("python3")
	if err != nil || got != "python" {
		t.Errorf("expected 'python', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_InvalidReturnsError(t *testing.T) {
	_, err := normalizeLanguage("ruby")
	if err == nil {
		t.Error("expected error for invalid language 'ruby', got nil")
	}
}

func TestExecute_MergesExecutionSettings(t *testing.T) {
	seed42 := 42
	problemJSON := json.RawMessage(`{"title":"Test","language":"python","execution_settings":{"stdin":"problem-stdin","random_seed":10}}`)

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
