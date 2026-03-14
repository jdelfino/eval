package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"
)

// TestRunnerClient is the interface for sending test requests to the executor service.
type TestRunnerClient interface {
	RunTests(ctx context.Context, req executor.TestRequest) (*executor.TestResponse, error)
}

// TestExecutionHandler handles I/O test execution requests.
type TestExecutionHandler struct {
	runner TestRunnerClient
}

// NewTestExecutionHandler creates a new TestExecutionHandler.
func NewTestExecutionHandler(runner TestRunnerClient) *TestExecutionHandler {
	return &TestExecutionHandler{runner: runner}
}

// testRunRequest is the request body for test execution endpoints.
// TestName is optional — if empty, all tests are run.
// Code is required for session-based tests, optional for student-work tests
// (where the student's saved code is used when not provided).
type testRunRequest struct {
	TestName string `json:"test_name,omitempty"`
	Code     string `json:"code,omitempty"`
}

// sessionTestRunRequest requires code for session-based test execution.
type sessionTestRunRequest struct {
	TestName string `json:"test_name,omitempty"`
	Code     string `json:"code" validate:"required"`
}

// StudentWorkTest handles POST /api/v1/student-work/{id}/test.
// Practice mode: loads student work and its problem, extracts I/O test cases,
// sends them to the executor with the student's current saved code.
// Auth: student can run tests on their own work; instructors can run on any work.
func (h *TestExecutionHandler) StudentWorkTest(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	workID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[testRunRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	work, err := repos.GetStudentWork(r.Context(), workID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "student work not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Auth check: student can only run tests on their own work; instructors can access any.
	if !auth.HasPermission(authUser.Role, auth.PermContentManage) && work.UserID != authUser.ID {
		httputil.WriteError(w, http.StatusForbidden, "access denied")
		return
	}

	// Extract I/O test cases from the problem.
	testCases, err := parseIOTestCases(work.Problem.TestCases)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "failed to parse test cases")
		return
	}
	if len(testCases) == 0 {
		httputil.WriteError(w, http.StatusNotFound, "no test cases defined for this problem")
		return
	}

	// Filter to a single test if test_name is specified.
	ioTests, notFound := filterTestCases(testCases, req.TestName)
	if notFound {
		httputil.WriteError(w, http.StatusNotFound, "test not found")
		return
	}

	lang, err := normalizeLanguage(work.Problem.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	testResp, err := h.runner.RunTests(r.Context(), executor.TestRequest{
		Code:     work.Code,
		Language: lang,
		IOTests:  ioTests,
	})
	if err != nil {
		writeExecutorError(w, r, err, "test execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, testResp)
}

// SessionTest handles POST /api/v1/sessions/{id}/test.
// Live session mode: loads the session's problem snapshot, extracts I/O test cases,
// and runs them against the provided code.
// Auth: session creator or participant can run tests.
func (h *TestExecutionHandler) SessionTest(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[sessionTestRunRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	session, err := repos.GetSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Auth check: creator or participant.
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "access denied")
		return
	}

	// Parse the problem snapshot embedded in the session.
	var problemSnapshot struct {
		Language  string          `json:"language"`
		TestCases json.RawMessage `json:"test_cases"`
	}
	if err := json.Unmarshal(session.Problem, &problemSnapshot); err != nil {
		httputil.WriteInternalError(w, r, err, "failed to parse session problem")
		return
	}

	// Extract I/O test cases from the problem snapshot.
	testCases, err := parseIOTestCases(problemSnapshot.TestCases)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "failed to parse test cases")
		return
	}
	if len(testCases) == 0 {
		httputil.WriteError(w, http.StatusNotFound, "no test cases defined for this problem")
		return
	}

	// Filter to a single test if test_name is specified.
	ioTests, notFound := filterTestCases(testCases, req.TestName)
	if notFound {
		httputil.WriteError(w, http.StatusNotFound, "test not found")
		return
	}

	lang, err := normalizeLanguage(problemSnapshot.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	testResp, err := h.runner.RunTests(r.Context(), executor.TestRequest{
		Code:     req.Code,
		Language: lang,
		IOTests:  ioTests,
	})
	if err != nil {
		writeExecutorError(w, r, err, "test execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, testResp)
}

// parseIOTestCases unmarshals a JSONB test_cases column into a slice of IOTestCase.
// Returns nil (not an error) when rawJSON is null or empty, indicating no test cases.
func parseIOTestCases(rawJSON json.RawMessage) ([]store.IOTestCase, error) {
	if len(rawJSON) == 0 || string(rawJSON) == "null" {
		return nil, nil
	}
	var cases []store.IOTestCase
	if err := json.Unmarshal(rawJSON, &cases); err != nil {
		return nil, err
	}
	return cases, nil
}

// filterTestCases converts store.IOTestCase to executorapi.IOTestDef for the executor.
// If testName is non-empty, only the matching case is returned.
// Returns (nil, true) if testName is specified but no matching case is found.
func filterTestCases(cases []store.IOTestCase, testName string) ([]executorapi.IOTestDef, bool) {
	defs := make([]executorapi.IOTestDef, 0, len(cases))
	for _, tc := range cases {
		if testName != "" && tc.Name != testName {
			continue
		}
		defs = append(defs, executorapi.IOTestDef{
			Name:           tc.Name,
			Input:          tc.Input,
			ExpectedOutput: tc.ExpectedOutput,
			MatchType:      tc.MatchType,
		})
	}
	if testName != "" && len(defs) == 0 {
		return nil, true // not found
	}
	return defs, false
}
