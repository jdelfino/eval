package handler

// Tests that verify activation.SignalDemand is called (fire-and-forget)
// in each handler that signals demand. These are additive tests; they
// do NOT modify existing test cases.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"context"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// countingActivationService counts calls and optionally returns an error.
type countingActivationService struct {
	calls int64
	err   error
}

func (s *countingActivationService) SignalDemand(_ context.Context) error {
	atomic.AddInt64(&s.calls, 1)
	return s.err
}

func (s *countingActivationService) count() int64 {
	return atomic.LoadInt64(&s.calls)
}

// waitForCalls waits until at least n calls have been made, with a timeout.
func (s *countingActivationService) waitForCalls(t *testing.T, n int64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if s.count() >= n {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d activation calls (got %d)", n, s.count())
}

// --- Execute handler activation ---

func TestExecuteHandler_SignalsDemandOnExecute(t *testing.T) {
	svc := &countingActivationService{}
	h := NewExecuteHandler(&mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{{Name: "run", Type: "io", Status: "run"}},
				Summary: executor.CaseSummary{Total: 1, Run: 1},
			}, nil
		},
	})
	h.SetActivation(svc)

	body, _ := json.Marshal(map[string]any{"code": "print('hi')", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.Execute(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Execute() status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

// --- Session handler activation ---

func TestSessionHandler_SignalsDemandOnCreate(t *testing.T) {
	svc := &countingActivationService{}

	sectionID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	newSession := &store.Session{
		ID:          uuid.New(),
		NamespaceID: "test-ns",
		SectionID:   sectionID,
		SectionName: "Test Section",
		Problem:     json.RawMessage(`{}`),
		CreatorID:   testCreatorID,
		Status:      "active",
	}

	repos := &sessionTestRepos{
		stubRepos: stubRepos{},
		sess: &mockSessionRepo{
			createSessionReplacingActiveFn: func(_ context.Context, _ store.CreateSessionParams) (*store.Session, []uuid.UUID, error) {
				return newSession, nil, nil
			},
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return &store.Section{ID: sectionID, Name: "Test Section"}, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	h.SetActivation(svc)

	body, _ := json.Marshal(map[string]any{"section_id": sectionID.String()})
	req := httptest.NewRequest(http.MethodPost, "/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.Create(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Create() status = %d, want 201: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

func TestSessionHandler_SignalsDemandOnReopen(t *testing.T) {
	svc := &countingActivationService{}

	sessID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	sectionID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	existing := &store.Session{
		ID:          sessID,
		NamespaceID: "test-ns",
		SectionID:   sectionID,
		SectionName: "Test Section",
		Problem:     json.RawMessage(`{}`),
		CreatorID:   testCreatorID,
		Status:      "completed",
	}
	reopened := &store.Session{
		ID:          sessID,
		NamespaceID: "test-ns",
		SectionID:   sectionID,
		SectionName: "Test Section",
		Problem:     json.RawMessage(`{}`),
		CreatorID:   testCreatorID,
		Status:      "active",
	}

	repos := &sessionTestRepos{
		stubRepos: stubRepos{},
		sess: &mockSessionRepo{
			getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
				return existing, nil
			},
			reopenSessionReplacingActiveFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) (*store.Session, []uuid.UUID, error) {
				return reopened, nil, nil
			},
		},
	}

	h := NewSessionHandler(noopPublisher())
	h.SetActivation(svc)

	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sessID.String()+"/reopen", bytes.NewReader(nil))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	})
	ctx = store.WithRepos(ctx, repos)
	ctx = withChiParam(ctx, "id", sessID.String())
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.Reopen(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Reopen() status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

// --- Trace handler activation ---

func TestTraceHandler_SignalsDemandOnStandaloneTrace(t *testing.T) {
	svc := &countingActivationService{}
	h := NewTraceHandler(&mockTracerClient{
		traceFn: func(_ context.Context, _ executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{Steps: nil, TotalSteps: 0, ExitCode: 0}, nil
		},
	})
	h.SetActivation(svc)

	r := chi.NewRouter()
	r.Post("/trace", h.StandaloneTrace)

	body, _ := json.Marshal(map[string]any{"code": "x=1", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("StandaloneTrace() status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

// --- TestExecution handler activation ---

func TestTestExecutionHandler_SignalsDemandOnStudentWorkTest(t *testing.T) {
	svc := &countingActivationService{}

	runnerClient := &mockTestRunnerClient{
		runTestsFn: func(_ context.Context, _ executor.TestRequest) (*executor.TestResponse, error) {
			return &executor.TestResponse{
				Results: []executor.TestResult{{Name: "case1", Type: "io", Status: "passed"}},
				Summary: executor.TestSummary{Total: 1, Passed: 1},
			}, nil
		},
	}
	h := NewTestExecutionHandler(runnerClient)
	h.SetActivation(svc)

	work := testStudentWorkWithProblem("")
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	r := chi.NewRouter()
	r.Post("/student-work/{id}/test", h.StudentWorkTest)

	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("StudentWorkTest() status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

func TestTestExecutionHandler_SignalsDemandOnSessionTest(t *testing.T) {
	svc := &countingActivationService{}

	runnerClient := &mockTestRunnerClient{
		runTestsFn: func(_ context.Context, _ executor.TestRequest) (*executor.TestResponse, error) {
			return &executor.TestResponse{
				Results: []executor.TestResult{{Name: "case1", Type: "io", Status: "passed"}},
				Summary: executor.TestSummary{Total: 1, Passed: 1},
			}, nil
		},
	}
	h := NewTestExecutionHandler(runnerClient)
	h.SetActivation(svc)

	tcJSON := `[{"name":"case1","input":"1\n","expected_output":"1","match_type":"exact","order":0}]`
	session := testSessionWithProblem(tcJSON)
	repos := &testExecSessionRepos{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, nil
		},
	}

	r := chi.NewRouter()
	r.Post("/sessions/{id}/test", h.SessionTest)

	body, _ := json.Marshal(map[string]any{"code": "print(input())"})
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+testSessionID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("SessionTest() status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	svc.waitForCalls(t, 1)
}

func TestTestExecutionHandler_NoActivationWithoutSetter_StudentWork(t *testing.T) {
	// Verifies that TestExecutionHandler without SetActivation called does not panic.
	runnerClient := &mockTestRunnerClient{
		runTestsFn: func(_ context.Context, _ executor.TestRequest) (*executor.TestResponse, error) {
			return &executor.TestResponse{
				Results: []executor.TestResult{{Name: "case1", Type: "io", Status: "passed"}},
				Summary: executor.TestSummary{Total: 1, Passed: 1},
			}, nil
		},
	}
	h := NewTestExecutionHandler(runnerClient)
	// No SetActivation call.

	work := testStudentWorkWithProblem("")
	repos := &testStudentWorkRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	r := chi.NewRouter()
	r.Post("/student-work/{id}/test", h.StudentWorkTest)

	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/student-work/"+testWorkID.String()+"/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req) // must not panic

	if rr.Code != http.StatusOK {
		t.Fatalf("StudentWorkTest() without activation status = %d, want 200", rr.Code)
	}
}

// --- No activation without SetActivation (nil safety) ---

func TestExecuteHandler_NoActivationWithoutSetter(t *testing.T) {
	// Verifies that a handler without SetActivation called does not panic.
	h := NewExecuteHandler(&mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executor.CaseResult{{Name: "run", Type: "io", Status: "run"}},
				Summary: executor.CaseSummary{Total: 1, Run: 1},
			}, nil
		},
	})
	// No SetActivation call.

	body, _ := json.Marshal(map[string]any{"code": "print('hi')", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.Execute(rr, req) // must not panic

	if rr.Code != http.StatusOK {
		t.Fatalf("Execute() without activation status = %d, want 200", rr.Code)
	}
}
