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

// StudentWorkHandler handles student work CRUD.
type StudentWorkHandler struct {
}

// NewStudentWorkHandler creates a new StudentWorkHandler.
func NewStudentWorkHandler() *StudentWorkHandler {
	return &StudentWorkHandler{}
}

// updateStudentWorkRequest is the request body for PATCH /student-work/{id}.
type updateStudentWorkRequest struct {
	Code      *string         `json:"code"`
	TestCases json.RawMessage `json:"test_cases"`
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
	_, err := repos.GetSectionProblem(r.Context(), sectionID, problemID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not published to this section")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
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

// Update handles PATCH /api/v1/student-work/{id} — update code/test_cases (owner only).
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
		Code:      req.Code,
		TestCases: req.TestCases,
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

