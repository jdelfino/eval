package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// StudentWorkHandler handles student work CRUD and execution.
type StudentWorkHandler struct {
	executor ExecutorClient
}

// NewStudentWorkHandler creates a new StudentWorkHandler.
func NewStudentWorkHandler() *StudentWorkHandler {
	return &StudentWorkHandler{}
}

// WithExecutor sets the executor client (used for testing).
func (h *StudentWorkHandler) WithExecutor(exec ExecutorClient) *StudentWorkHandler {
	h.executor = exec
	return h
}

// updateStudentWorkRequest is the request body for PATCH /student-work/{id}.
type updateStudentWorkRequest struct {
	Code              *string         `json:"code"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
}

// executeStudentWorkRequest is the request body for POST /student-work/{id}/execute.
type executeStudentWorkRequest struct {
	Code              string                 `json:"code" validate:"required"`
	ExecutionSettings *executionSettingsJSON `json:"execution_settings"`
}

// GetOrCreate handles POST /api/v1/sections/{id}/problems/{problemID}/work — get or create student_work.
func (h *StudentWorkHandler) GetOrCreate(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	problemID, ok := httpbind.ParseUUIDParam(w, r, "problemID")
	if !ok {
		return
	}

	// Validate problem is published to section via section_problems.
	// RLS handles section membership — if user is not a member, section_problems query returns empty.
	repos := store.ReposFromContext(r.Context())
	published, err := repos.ListSectionProblems(r.Context(), sectionID, authUser.ID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Check if this specific problem is in the published list
	found := false
	for _, p := range published {
		if p.ProblemID == problemID {
			found = true
			break
		}
	}
	if !found {
		httputil.WriteError(w, http.StatusNotFound, "problem not published to this section")
		return
	}

	// Get or create student work
	if authUser.NamespaceID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "user has no namespace")
		return
	}

	work, err := repos.GetOrCreateStudentWork(r.Context(), authUser.NamespaceID, authUser.ID, problemID, sectionID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, work)
}

// Get handles GET /api/v1/student-work/{id} — get student_work with problem data.
func (h *StudentWorkHandler) Get(w http.ResponseWriter, r *http.Request) {
	workID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
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

	httputil.WriteJSON(w, http.StatusOK, work)
}

// Update handles PATCH /api/v1/student-work/{id} — update code/execution_settings (owner only).
func (h *StudentWorkHandler) Update(w http.ResponseWriter, r *http.Request) {
	workID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateStudentWorkRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	work, err := repos.UpdateStudentWork(r.Context(), workID, store.UpdateStudentWorkParams{
		Code:              req.Code,
		ExecutionSettings: req.ExecutionSettings,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "student work not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, work)
}

// Execute handles POST /api/v1/student-work/{id}/execute — execute code (owner only).
func (h *StudentWorkHandler) Execute(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	workID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[executeStudentWorkRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	// Load student work with problem
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

	// Merge execution settings: problem-level + student overrides + request overrides
	merged := mergeStudentWorkExecutionSettings(work.Problem.ExecutionSettings, work.ExecutionSettings, req.ExecutionSettings)

	// Build executor request
	execReq := buildExecutorRequest(req.Code, merged)

	// Call executor
	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, execResp)
}

// mergeStudentWorkExecutionSettings merges execution settings with priority:
// 1. Request payload (highest)
// 2. Student work record
// 3. Problem (lowest)
//
// Unlike mergeExecutionSettings (session execute), the problemJSON here is already
// the execution_settings value from store.Problem — not a full problem JSON blob.
func mergeStudentWorkExecutionSettings(
	problemJSON json.RawMessage,
	studentWorkJSON json.RawMessage,
	requestSettings *executionSettingsJSON,
) executionSettingsJSON {
	var result executionSettingsJSON

	// Layer 1: Problem-level settings (lowest priority).
	// problemJSON is the execution_settings field value, not the full problem blob.
	if len(problemJSON) > 0 {
		var problemSettings executionSettingsJSON
		if err := json.Unmarshal(problemJSON, &problemSettings); err == nil {
			result = problemSettings
		}
	}

	// Layer 2: Student work settings.
	if len(studentWorkJSON) > 0 {
		var studentSettings executionSettingsJSON
		if err := json.Unmarshal(studentWorkJSON, &studentSettings); err == nil {
			applySettingsLayer(&result, studentSettings)
		}
	}

	// Layer 3: Request settings (highest priority).
	if requestSettings != nil {
		applySettingsLayer(&result, *requestSettings)
	}

	return result
}
