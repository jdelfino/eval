package handler

import (
	"errors"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// practiceRequest is the JSON body for POST /sessions/{id}/practice.
type practiceRequest struct {
	Code              string                `json:"code" validate:"required"`
	ExecutionSettings *executionSettingsJSON `json:"execution_settings"`
}

// PracticeExecute handles POST /api/v1/sessions/{id}/practice.
// It allows students to run code in completed sessions (ephemeral, no persistent state).
func (h *ExecuteHandler) PracticeExecute(w http.ResponseWriter, r *http.Request) {
	// 1. Auth check
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// 2. Parse session ID
	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	// 3. Bind JSON request
	req, err := httpbind.BindJSON[practiceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	// 4. Look up session
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

	// 5. Session MUST be completed
	if session.Status != "completed" {
		httputil.WriteError(w, http.StatusBadRequest, "session is not completed; use /execute for active sessions")
		return
	}

	// 6. User must be creator or participant
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "you are not a participant in this session")
		return
	}

	// 7. Build executor request — merge problem-level settings (e.g. stdin, files)
	// with request overrides. No student record in practice mode (ephemeral).
	merged := mergeExecutionSettings(session.Problem, nil, req.ExecutionSettings)
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

	// 8. Call executor
	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "execution failed")
		return
	}

	// 9. Return result
	httputil.WriteJSON(w, http.StatusOK, execResp)
}
