package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

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
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
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
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err == nil {
		studentRecord = sr
	}

	merged := mergeExecutionSettings(session.Problem, studentRecord, req.ExecutionSettings)

	// 6. Build executor request
	execReq := executor.ExecuteRequest{
		Code: req.Code,
	}
	if merged.Stdin != nil {
		execReq.Stdin = *merged.Stdin
	}
	if merged.RandomSeed != nil {
		execReq.RandomSeed = merged.RandomSeed
	}
	if len(merged.Files) > 0 {
		execReq.Files = merged.Files
	}

	// 7. Call executor
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

	execReq := executor.ExecuteRequest{
		Code:  req.Code,
		Stdin: req.Stdin,
		Files: req.Files,
	}

	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, execResp)
}

// writeExecutorError writes the appropriate HTTP error for an executor client error.
// If the executor returned 429 (rate limit / concurrency), it propagates 429 to the caller.
// Otherwise it writes a 500.
func writeExecutorError(w http.ResponseWriter, r *http.Request, err error, message string) {
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

// mergeExecutionSettings merges execution settings with priority:
// 1. Request payload (highest)
// 2. Session student record
// 3. Session problem (lowest)
func mergeExecutionSettings(
	problemJSON json.RawMessage,
	studentRecord *store.SessionStudent,
	requestSettings *executionSettingsJSON,
) executionSettingsJSON {
	var result executionSettingsJSON

	// Layer 1: Problem-level settings (lowest priority)
	if len(problemJSON) > 0 {
		var problem struct {
			ExecutionSettings *executionSettingsJSON `json:"execution_settings"`
		}
		if err := json.Unmarshal(problemJSON, &problem); err == nil && problem.ExecutionSettings != nil {
			result = *problem.ExecutionSettings
		}
	}

	// Layer 2: Student record settings
	if studentRecord != nil && len(studentRecord.ExecutionSettings) > 0 {
		var studentSettings executionSettingsJSON
		if err := json.Unmarshal(studentRecord.ExecutionSettings, &studentSettings); err == nil {
			if studentSettings.Stdin != nil {
				result.Stdin = studentSettings.Stdin
			}
			if studentSettings.RandomSeed != nil {
				result.RandomSeed = studentSettings.RandomSeed
			}
			if len(studentSettings.Files) > 0 {
				result.Files = studentSettings.Files
			}
		}
	}

	// Layer 3: Request settings (highest priority)
	if requestSettings != nil {
		if requestSettings.Stdin != nil {
			result.Stdin = requestSettings.Stdin
		}
		if requestSettings.RandomSeed != nil {
			result.RandomSeed = requestSettings.RandomSeed
		}
		if len(requestSettings.Files) > 0 {
			result.Files = requestSettings.Files
		}
	}

	return result
}
