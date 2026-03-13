package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"syscall"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ExecutorClient is the interface for sending code to the executor service.
type ExecutorClient interface {
	Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

// ExecuteHandler handles code execution requests.
type ExecuteHandler struct {
	executor ExecutorClient
}

// NewExecuteHandler creates a new ExecuteHandler.
func NewExecuteHandler(exec ExecutorClient) *ExecuteHandler {
	return &ExecuteHandler{
		executor: exec,
	}
}

// executeRequest is the request body for POST /sessions/{id}/execute.
type executeRequest struct {
	StudentID         uuid.UUID              `json:"student_id" validate:"required"`
	Code              string                 `json:"code" validate:"required"`
	ExecutionSettings *executionSettingsJSON  `json:"execution_settings"`
}

// executionSettingsJSON represents execution settings in JSON form.
type executionSettingsJSON struct {
	Stdin      *string         `json:"stdin,omitempty"`
	RandomSeed *int            `json:"random_seed,omitempty"`
	Files      []executorapi.File `json:"files,omitempty"`
}

// Execute handles POST /api/v1/sessions/{id}/execute.
func (h *ExecuteHandler) Execute(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[executeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	// 1. Look up session
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

	// 2. Check session status
	if session.Status == "completed" {
		httputil.WriteError(w, http.StatusBadRequest, "Session is closed. Code execution is no longer available.")
		return
	}

	// 3. Check user is creator or participant
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "you are not a participant in this session")
		return
	}

	// 4. Student can only execute their own code
	if authUser.Role == auth.RoleStudent && req.StudentID != authUser.ID {
		httputil.WriteError(w, http.StatusForbidden, "You can only execute your own code.")
		return
	}

	// 4b. Validate student_id is an actual session participant
	if !isCreatorOrParticipant(req.StudentID, session) {
		httputil.WriteError(w, http.StatusBadRequest, "student_id is not a participant in this session")
		return
	}

	// 5. Merge execution settings: get student record for middle layer
	var studentRecord *store.SessionStudent
	sr, err := repos.GetSessionStudent(r.Context(), sessionID, req.StudentID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}
	if err == nil {
		studentRecord = sr
	}

	merged := mergeExecutionSettings(session.Problem, studentRecord, req.ExecutionSettings)

	// 6. Extract language from problem JSON (error if absent)
	lang, err := extractLanguageFromProblem(session.Problem)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "problem language is not set or invalid")
		return
	}

	// 7. Build executor request
	execReq := buildExecutorRequest(req.Code, merged)
	execReq.Language = lang

	// 8. Call executor
	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, execResp)
}

// standaloneExecuteRequest is the request body for POST /api/v1/execute.
type standaloneExecuteRequest struct {
	Code     string             `json:"code" validate:"required"`
	Language string             `json:"language,omitempty"`
	Stdin    string             `json:"stdin,omitempty"`
	Files    []executorapi.File `json:"files,omitempty"`
}

// StandaloneExecute handles POST /api/v1/execute for instructor code preview.
// No session context is required — this is for the "Run" button in the problem editor.
func (h *ExecuteHandler) StandaloneExecute(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[standaloneExecuteRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	lang, err := normalizeLanguage(req.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	execReq := executor.ExecuteRequest{
		Code:     req.Code,
		Stdin:    req.Stdin,
		Files:    req.Files,
		Language: lang,
	}

	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, execResp)
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
		httputil.WriteError(w, http.StatusServiceUnavailable, "executor is starting up, please retry")
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

// extractLanguageFromProblem extracts the language field from a problem JSON blob.
// Returns an error if the field is absent, empty, the JSON is malformed, or the
// stored value is not a recognized language. Every problem must specify a language.
func extractLanguageFromProblem(problemJSON json.RawMessage) (string, error) {
	if len(problemJSON) == 0 {
		return "", fmt.Errorf("problem has no language field")
	}
	var problem struct {
		Language string `json:"language"`
	}
	if err := json.Unmarshal(problemJSON, &problem); err != nil {
		return "", fmt.Errorf("problem JSON is malformed: %w", err)
	}
	if problem.Language == "" {
		return "", fmt.Errorf("problem has no language field")
	}
	if _, ok := languageAliases[problem.Language]; !ok {
		return "", fmt.Errorf("problem has unsupported language %q: must be one of python, java", problem.Language)
	}
	return problem.Language, nil
}

// mergeExecutionSettings merges execution settings with priority:
// 1. Request payload (highest)
// 2. Session student record
// 3. Session problem (lowest)
//
// The problemJSON is a full problem JSON blob whose "execution_settings" key
// contains the problem-level defaults.
func mergeExecutionSettings(
	problemJSON json.RawMessage,
	studentRecord *store.SessionStudent,
	requestSettings *executionSettingsJSON,
) executionSettingsJSON {
	var result executionSettingsJSON

	// Layer 1: Problem-level settings (lowest priority).
	// The problem JSON is the full problem object; execution_settings is nested inside.
	if len(problemJSON) > 0 {
		var problem struct {
			ExecutionSettings *executionSettingsJSON `json:"execution_settings"`
		}
		if err := json.Unmarshal(problemJSON, &problem); err == nil && problem.ExecutionSettings != nil {
			result = *problem.ExecutionSettings
		}
	}

	// Layer 2: Student record settings.
	if studentRecord != nil && len(studentRecord.ExecutionSettings) > 0 {
		var studentSettings executionSettingsJSON
		if err := json.Unmarshal(studentRecord.ExecutionSettings, &studentSettings); err == nil {
			applySettingsLayer(&result, studentSettings)
		}
	}

	// Layer 3: Request settings (highest priority).
	if requestSettings != nil {
		applySettingsLayer(&result, *requestSettings)
	}

	return result
}
