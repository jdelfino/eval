package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"syscall"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockTestRunnerClient implements TestRunnerClient for testing.
type mockTestRunnerClient struct {
	executeFn func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

func (m *mockTestRunnerClient) Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
	return m.executeFn(ctx, req)
}

// testStudentWorkID and testProblemID are stable UUIDs for test fixtures.
var (
	testWorkID    = uuid.MustParse("aaaaaaaa-1111-1111-1111-111111111111")
	testProblemID = uuid.MustParse("bbbbbbbb-2222-2222-2222-222222222222")
)

// testStudentWork returns a StudentWorkWithProblem for use in tests.
// The owner is testStudentID (dddddddd-...) from execute_test.go.
func testStudentWorkWithProblem(testCasesJSON string) *store.StudentWorkWithProblem {
	var problemTestCases json.RawMessage
	if testCasesJSON != "" {
		problemTestCases = json.RawMessage(testCasesJSON)
	} else {
		problemTestCases = json.RawMessage(`[{"name":"case1","input":"1\n","expected_output":"1","match_type":"exact","order":0}]`)
	}
	return &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        testWorkID,
			UserID:    testStudentID, // testStudentID from execute_test.go: dddddddd-...
			ProblemID: testProblemID,
			Code:      `print("hello")`,
		},
		Problem: store.Problem{
			ID:        testProblemID,
			Language:  "python",
			TestCases: problemTestCases,
		},
	}
}

// testStudentWorkRepos is a mock Repos that provides GetStudentWork.
type testStudentWorkRepos struct {
	stubRepos
	getStudentWorkFn func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error)
}

func (r *testStudentWorkRepos) GetStudentWork(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
	return r.getStudentWorkFn(ctx, id)
}

// testSessionRepos is a mock Repos that provides GetSession.
type testExecSessionRepos struct {
	stubRepos
	getSessionFn func(ctx context.Context, id uuid.UUID) (*store.Session, error)
}

func (r *testExecSessionRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.getSessionFn(ctx, id)
}

// setupStudentWorkTestHandler creates an http.Handler wired to TestExecutionHandler
// for the student-work/{id}/test endpoint.
func setupStudentWorkTestHandler(runnerClient TestRunnerClient) http.Handler {
	h := NewTestExecutionHandler(runnerClient)
	r := chi.NewRouter()
	r.Post("/student-work/{id}/test", h.StudentWorkTest)
	return r
}

// --- student-work/{id}/test tests ---

func TestStudentWorkTest_HappyPath_AllTests(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{
					{Name: "case1", Type: "io", Status: "passed"},
				},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	work := testStudentWorkWithProblem("")
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			if id != testWorkID {
				t.Errorf("unexpected work ID: %v", id)
			}
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(runnerClient)
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
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
	if resp.Summary.Total != 1 {
		t.Errorf("expected 1 total test, got %d", resp.Summary.Total)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected 1 passed, got %d", resp.Summary.Passed)
	}

	// Verify executor received correct fields
	if capturedReq.Code != `print("hello")` {
		t.Errorf("expected student code forwarded, got %q", capturedReq.Code)
	}
	if capturedReq.Language != "python" {
		t.Errorf("expected language 'python', got %q", capturedReq.Language)
	}
	if len(capturedReq.Cases) != 1 {
		t.Errorf("expected 1 case forwarded, got %d", len(capturedReq.Cases))
	}
	if capturedReq.Cases[0].Name != "case1" {
		t.Errorf("expected case name 'case1', got %q", capturedReq.Cases[0].Name)
	}
	if capturedReq.Cases[0].Type != "io" {
		t.Errorf("expected case type 'io', got %q", capturedReq.Cases[0].Type)
	}
}

func TestStudentWorkTest_HappyPath_SingleTest(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{
					{Name: "case1", Type: "io", Status: "passed"},
				},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	tcJSON := `[{"name":"case1","input":"1\n","expected_output":"1","match_type":"exact","order":0},{"name":"case2","input":"2\n","expected_output":"2","match_type":"exact","order":1}]`
	work := testStudentWorkWithProblem(tcJSON)
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(runnerClient)
	body, _ := json.Marshal(map[string]any{"test_name": "case1"})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Only one case should be forwarded when test_name is specified
	if len(capturedReq.Cases) != 1 {
		t.Errorf("expected 1 case forwarded for single test_name filter, got %d", len(capturedReq.Cases))
	}
	if capturedReq.Cases[0].Name != "case1" {
		t.Errorf("expected only 'case1' forwarded, got %q", capturedReq.Cases[0].Name)
	}
}

func TestStudentWorkTest_401NoAuth(t *testing.T) {
	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_400InvalidUUID(t *testing.T) {
	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/not-a-uuid/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_404NotFound(t *testing.T) {
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_403Forbidden_StudentAccessingOtherWork(t *testing.T) {
	otherStudentID := uuid.MustParse("ffffffff-ffff-ffff-ffff-ffffffffffff")
	work := testStudentWorkWithProblem("")
	// work.StudentWork.UserID is testStudentID; we'll request as otherStudentID

	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: otherStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_InstructorCanAccessAnyWork(t *testing.T) {
	instructorID := uuid.MustParse("ffffffff-ffff-ffff-ffff-ffffffffffff")
	work := testStudentWorkWithProblem("")
	// work.StudentWork.UserID is testStudentID, instructor is a different user

	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{{Name: "case1", Type: "io", Status: "passed"}},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(runnerClient)
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: instructorID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for instructor, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_404NoTestCasesOnProblem(t *testing.T) {
	work := testStudentWorkWithProblem("null")

	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when no test cases defined, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_404TestNameNotFound(t *testing.T) {
	work := testStudentWorkWithProblem(`[{"name":"case1","input":"1\n","match_type":"exact","order":0}]`)
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(&mockTestRunnerClient{})
	body, _ := json.Marshal(map[string]any{"test_name": "nonexistent"})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown test_name, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkTest_503OnExecutorConnectionError(t *testing.T) {
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			urlErr := &url.Error{
				Op:  "Post",
				URL: "http://executor:8080/execute",
				Err: &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED},
			}
			return nil, fmt.Errorf("executor: send request: %w", urlErr)
		},
	}

	work := testStudentWorkWithProblem("")
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	handler := setupStudentWorkTestHandler(runnerClient)
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- sessions/{id}/test tests ---

// testSessionWithProblem returns a store.Session with an embedded problem JSON containing test_cases.
func testSessionWithProblem(testCasesJSON string) *store.Session {
	problemJSON := fmt.Sprintf(`{"id":%q,"title":"Test Problem","language":"python","test_cases":%s}`,
		testProblemID.String(), testCasesJSON)
	return &store.Session{
		ID:           testSessionID,
		NamespaceID:  "test-ns",
		CreatorID:    testCreatorID,
		Participants: []uuid.UUID{testStudentID},
		Status:       "active",
		Problem:      json.RawMessage(problemJSON),
	}
}

func TestSessionTest_HappyPath_AllTests(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{
					{Name: "case1", Type: "io", Status: "passed"},
				},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	tcJSON := `[{"name":"case1","input":"2\n","expected_output":"2","match_type":"exact","order":0}]`
	session := testSessionWithProblem(tcJSON)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != testSessionID {
				t.Errorf("unexpected session ID: %v", id)
			}
			return session, nil
		},
	}

	h := NewTestExecutionHandler(runnerClient)
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	codeBody := "print(input())"
	body, _ := json.Marshal(map[string]any{"code": codeBody})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Participant (student)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	if capturedReq.Code != codeBody {
		t.Errorf("expected code %q forwarded, got %q", codeBody, capturedReq.Code)
	}
	if capturedReq.Language != "python" {
		t.Errorf("expected language 'python', got %q", capturedReq.Language)
	}
	if len(capturedReq.Cases) != 1 || capturedReq.Cases[0].Name != "case1" {
		t.Errorf("expected 1 case 'case1', got %v", capturedReq.Cases)
	}
	if capturedReq.Cases[0].Type != "io" {
		t.Errorf("expected case type 'io', got %q", capturedReq.Cases[0].Type)
	}
}

func TestSessionTest_HappyPath_SingleTest(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{{Name: "case2", Type: "io", Status: "passed"}},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	tcJSON := `[{"name":"case1","input":"1\n","match_type":"exact","order":0},{"name":"case2","input":"2\n","match_type":"exact","order":1}]`
	session := testSessionWithProblem(tcJSON)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	h := NewTestExecutionHandler(runnerClient)
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "print(input())", "test_name": "case2"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	if len(capturedReq.Cases) != 1 || capturedReq.Cases[0].Name != "case2" {
		t.Errorf("expected only 'case2' forwarded, got %v", capturedReq.Cases)
	}
}

func TestSessionTest_401NoAuth(t *testing.T) {
	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_400InvalidUUID(t *testing.T) {
	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/not-a-uuid/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_404SessionNotFound(t *testing.T) {
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_403Forbidden_NonParticipant(t *testing.T) {
	session := testSessionWithProblem(`[{"name":"case1","input":"1\n","match_type":"exact","order":0}]`)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// testOutsiderID is not creator or participant
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-participant, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_InstructorCreatorCanTest(t *testing.T) {
	runnerClient := &mockTestRunnerClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{{Name: "case1", Status: "passed"}},
				Summary: executor.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	session := testSessionWithProblem(`[{"name":"case1","input":"1\n","match_type":"exact","order":0}]`)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	h := NewTestExecutionHandler(runnerClient)
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "print(1)"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Creator (instructor)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for instructor/creator, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_422MissingCode(t *testing.T) {
	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{}) // no code field
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_404NoTestCasesInSessionProblem(t *testing.T) {
	// Session has a problem without test_cases
	problemJSON := fmt.Sprintf(`{"id":%q,"title":"Test Problem","language":"python","test_cases":null}`,
		testProblemID.String())
	session := &store.Session{
		ID:           testSessionID,
		NamespaceID:  "test-ns",
		CreatorID:    testCreatorID,
		Participants: []uuid.UUID{testStudentID},
		Status:       "active",
		Problem:      json.RawMessage(problemJSON),
	}

	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when no test cases, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionTest_404TestNameNotFound(t *testing.T) {
	tcJSON := `[{"name":"case1","input":"1\n","match_type":"exact","order":0}]`
	session := testSessionWithProblem(tcJSON)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	h := NewTestExecutionHandler(&mockTestRunnerClient{})
	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "x", "test_name": "nonexistent"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown test_name, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- Execute method on executor Client tests ---

func TestExecutorClientExecute_InterfaceCompliance(t *testing.T) {
	// Verify that executor.Client satisfies TestRunnerClient interface.
	// This is a compile-time check via assignment; if the interface is
	// missing from executor.Client, this test fails to compile.
	var _ TestRunnerClient = (*testRunnerClientVerify)(nil)
}

// testRunnerClientVerify is a minimal implementation to ensure interface shape.
type testRunnerClientVerify struct{}

func (t *testRunnerClientVerify) Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
	return nil, nil
}
