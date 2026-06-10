package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"syscall"
	"time"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"

	"github.com/google/uuid"
)

// executeResponse is the unified response shape for POST /execute.
// results[] is a discriminated union of CaseResultIO and CaseResultPytest.
type executeResponse struct {
	Results []store.CaseResult    `json:"results"`
	Summary executorapi.CaseSummary `json:"summary"`
}

// ExecutorClient is the interface for sending code to the executor service.
type ExecutorClient interface {
	Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

// ExecuteHandler handles code execution requests.
type ExecuteHandler struct {
	executor   ExecutorClient
	activation ActivationService
}

// NewExecuteHandler creates a new ExecuteHandler.
func NewExecuteHandler(exec ExecutorClient) *ExecuteHandler {
	return &ExecuteHandler{
		executor: exec,
	}
}

// SetActivation attaches an ActivationService to the handler.
// Must be called before the handler serves requests.
func (h *ExecuteHandler) SetActivation(svc ActivationService) {
	h.activation = svc
}

// executeCaseDef is the frontend-facing representation of a test case in POST /execute.
// Uses attached_files (matching store.IOTestCase) rather than files (executor wire format);
// the handler translates between the two before calling the executor.
// Kind discriminates between io and pytest cases; omitted/empty defaults to "io".
type executeCaseDef struct {
	Name           string             `json:"name"`
	Kind           string             `json:"kind,omitempty"`           // "io" | "pytest"; defaults to "io"
	Input          string             `json:"input,omitempty"`
	MatchType      string             `json:"match_type,omitempty"`
	ExpectedOutput string             `json:"expected_output,omitempty"`
	RandomSeed     *int               `json:"random_seed,omitempty"`
	AttachedFiles  []executorapi.File `json:"attached_files,omitempty"`
	// Pytest-specific fields.
	TestCode   string `json:"test_code,omitempty"`   // Content of the pytest test file.
	TargetPath string `json:"target_path,omitempty"` // Relative path for the test file.
}

// effectiveKind returns the effective kind for dispatch. Empty or unset defaults to "io".
func (c executeCaseDef) effectiveKind() string {
	if c.Kind == "" {
		return "io"
	}
	return c.Kind
}

// toExecutorCaseDef converts a frontend case def to the executor wire format.
func (c executeCaseDef) toExecutorCaseDef() executorapi.CaseDef {
	kind := c.effectiveKind()
	switch kind {
	case "pytest":
		return executorapi.CaseDef{
			Name:       c.Name,
			Kind:       "pytest",
			TestCode:   c.TestCode,
			TargetPath: c.TargetPath,
		}
	default: // "io"
		return executorapi.CaseDef{
			Name:           c.Name,
			Kind:           "io",
			Type:           "io",
			Input:          c.Input,
			MatchType:      c.MatchType,
			ExpectedOutput: c.ExpectedOutput,
			RandomSeed:     c.RandomSeed,
			Files:          c.AttachedFiles,
		}
	}
}

// executeRequest is the request body for POST /api/v1/execute.
// Accepts code, language, and an optional cases[] array of test case definitions.
// When cases is omitted or empty, a single free-run case is synthesized.
// StudentWorkID is optional; when present the handler loads the canonical problem
// test cases, computes solved state, and persists it as a side effect.
type executeRequest struct {
	Code          string           `json:"code" validate:"required"`
	Language      string           `json:"language" validate:"required"`
	Cases         []executeCaseDef `json:"cases,omitempty"`
	StudentWorkID *uuid.UUID       `json:"student_work_id,omitempty"`
}

// Execute handles POST /api/v1/execute for any authenticated user.
// Accepts {code, language, cases[], student_work_id?} and returns {results[], summary}.
// No session context is required — takes code + language directly.
// When student_work_id is present: loads canonical cases, computes solved state, persists
// as a side effect (persist failure is logged and does NOT affect the 200 response).
func (h *ExecuteHandler) Execute(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[executeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	lang, err := normalizeLanguage(req.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// When student_work_id is provided: load the work BEFORE execution to validate
	// ownership and get canonical test cases for coverage matching.
	var work *store.StudentWorkWithProblem
	if req.StudentWorkID != nil {
		repos := store.ReposFromContext(r.Context())
		work, err = repos.GetStudentWork(r.Context(), *req.StudentWorkID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				httputil.WriteError(w, http.StatusNotFound, "student work not found")
				return
			}
			httputil.WriteInternalError(w, r, err, "load student work")
			return
		}
		// Only the owning student may grade their own work.
		if work.UserID != authUser.ID {
			httputil.WriteError(w, http.StatusForbidden, "not authorized to grade this work")
			return
		}
	}

	// Translate frontend case defs (attached_files) to executor wire format (files).
	var cases []executorapi.CaseDef
	if len(req.Cases) == 0 {
		// Synthesize a free-run case when none are given.
		cases = []executorapi.CaseDef{{Name: "run", Kind: "io", Type: "io", Input: ""}}
	} else {
		cases = make([]executorapi.CaseDef, len(req.Cases))
		for i, c := range req.Cases {
			cases[i] = c.toExecutorCaseDef()
		}
	}

	execReq := executor.ExecuteRequest{
		Code:     req.Code,
		Language: lang,
		Cases:    cases,
	}

	// Signal executor demand so KEDA can scale from zero.
	if h.activation != nil {
		ctx := context.WithoutCancel(r.Context())
		go func() {
			if err := h.activation.SignalDemand(ctx); err != nil {
				slog.Error("activation: SignalDemand failed", "handler", "execute.Execute", "error", err)
			}
		}()
	}

	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	// Map executor unified results into the store discriminated union, preserving submission order.
	unified := make([]store.CaseResult, 0, len(execResp.Results))
	for _, u := range execResp.Results {
		switch u.Kind {
		case "pytest":
			if u.Pytest != nil {
				unified = append(unified, pytestResultToCaseResult(*u.Pytest))
			}
		default: // "io"
			if u.IO != nil {
				unified = append(unified, ioResultToCaseResult(*u.IO))
			}
		}
	}

	// Persist solved state when student_work_id was provided.
	// Persist failure is a non-fatal side effect — execution results still returned.
	if work != nil {
		allPassed := computeAllPassed(work, req.Cases, execResp.Summary)
		repos := store.ReposFromContext(r.Context())
		if persistErr := repos.SetStudentWorkRunResult(r.Context(), work.ID, allPassed, time.Now()); persistErr != nil {
			slog.Error("execute: persist solved state failed", "work_id", work.ID, "error", persistErr)
		}
	}

	resp := executeResponse{
		Results: unified,
		Summary: execResp.Summary,
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

// computeAllPassed returns true iff:
//  1. Every canonical test case (from work.Problem.TestCases) is present in the
//     submitted cases, matched by content (NOT by name — the frontend renames io cases
//     to "run" on the run path).
//  2. All executed cases passed (execResp.Summary.Failed == 0 && .Errors == 0).
//
// Content matching for io: Input + ExpectedOutput + MatchType equality.
// Content matching for pytest: TargetPath + TestCode equality.
// A canonical io case with empty ExpectedOutput (run-only) is matched by Input alone.
func computeAllPassed(work *store.StudentWorkWithProblem, requestCases []executeCaseDef, summary executorapi.CaseSummary) bool {
	if summary.Failed > 0 || summary.Errors > 0 {
		return false
	}

	canonicalCases, err := store.UnmarshalIOTestCases(work.Problem.TestCases)
	if err != nil {
		// Can't parse canonical cases — treat as not covered.
		slog.Warn("computeAllPassed: failed to unmarshal canonical test cases", "error", err)
		return false
	}
	if len(canonicalCases) == 0 {
		// No canonical cases defined — a run with all cases passing trivially satisfies coverage.
		return true
	}

	// Check each canonical case is present in the submitted request cases by content.
	for _, canonical := range canonicalCases {
		if !canonicalCaseCovered(canonical, requestCases) {
			return false
		}
	}
	return true
}

// canonicalCaseCovered reports whether the canonical case is present in requestCases
// by content match (not by name).
func canonicalCaseCovered(canonical store.IOTestCase, requestCases []executeCaseDef) bool {
	switch c := canonical.(type) {
	case *store.IOTestCaseIO:
		for _, req := range requestCases {
			if req.effectiveKind() == "io" &&
				req.Input == c.Input &&
				req.ExpectedOutput == c.ExpectedOutput &&
				req.MatchType == c.MatchType {
				return true
			}
		}
		return false

	case *store.IOTestCasePytest:
		for _, req := range requestCases {
			if req.effectiveKind() == "pytest" &&
				req.TargetPath == c.TargetPath &&
				req.TestCode == c.TestCode {
				return true
			}
		}
		return false

	default:
		return false
	}
}

// ioResultToCaseResult maps an executor CaseResult (io) to a store.CaseResultIO.
func ioResultToCaseResult(r executorapi.CaseResult) *store.CaseResultIO {
	return store.NewCaseResultIO(
		r.Name,
		r.Status == "passed",
		int(r.TimeMs),
		r.Actual,
		r.Stderr,
		0, // exit code not in executorapi.CaseResult
		r.Expected,
		r.Status == "passed",
		r.Input,
		r.Status,
	)
}

// pytestResultToCaseResult maps an executor PytestCaseResult to a store.CaseResultPytest.
func pytestResultToCaseResult(pr executorapi.PytestCaseResult) *store.CaseResultPytest {
	assertions := make([]store.PytestAssertion, len(pr.Assertions))
	for i, a := range pr.Assertions {
		assertions[i] = store.PytestAssertion{
			Name:           a.Name,
			Passed:         a.Passed,
			FailureMessage: a.FailureMessage,
			Traceback:      a.Traceback,
		}
	}
	return store.NewCaseResultPytest(
		pr.Name,
		pr.Passed,
		pr.DurationMs,
		pr.Stderr,
		assertions,
	)
}

// isConnectionError reports whether err is a network-layer connection failure,
// indicating the executor service is unreachable (e.g. scaled to zero, cold-starting).
// The executor client wraps transport errors with fmt.Errorf("executor: send request: %w", err).
func isConnectionError(err error) bool {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return true
	}
	var netErr *net.OpError
	if errors.As(err, &netErr) {
		return true
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return true
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	return false
}

// writeExecutorError writes the appropriate HTTP error for an executor client error.
// If the executor is unreachable (connection-class error), it returns 503 so the
// frontend can distinguish a cold-start from a real error and retry.
// If the executor returned 429 (rate limit / concurrency), it propagates 429.
// Otherwise it writes a 500.
func writeExecutorError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if isConnectionError(err) {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Code execution is warming up, please try again in a few moments")
		return
	}
	var statusErr *executor.StatusError
	if errors.As(err, &statusErr) && statusErr.Code == http.StatusTooManyRequests {
		httputil.WriteError(w, http.StatusTooManyRequests, "execution service busy, try again later")
		return
	}
	httputil.WriteInternalError(w, r, err, message)
}

// isCreatorOrParticipant checks if the user is the session creator or a participant.
func isCreatorOrParticipant(userID uuid.UUID, session *store.Session) bool {
	if session.CreatorID == userID {
		return true
	}
	for _, p := range session.Participants {
		if p == userID {
			return true
		}
	}
	return false
}

// languageAliases maps accepted language strings to their canonical form.
// "python3" is accepted as a legacy alias for "python".
var languageAliases = map[string]string{
	"python":  "python",
	"python3": "python",
	"java":    "java",
}

// normalizeLanguage returns the normalized language string.
// Returns an error for empty or unsupported languages.
func normalizeLanguage(lang string) (string, error) {
	if lang == "" {
		return "", fmt.Errorf("language is required: must be one of python, java")
	}
	if canonical, ok := languageAliases[lang]; ok {
		return canonical, nil
	}
	return "", fmt.Errorf("unsupported language %q: must be one of python, java", lang)
}
