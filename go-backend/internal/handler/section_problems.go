package handler

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SectionProblemHandler handles section problem management routes.
type SectionProblemHandler struct{}

// NewSectionProblemHandler creates a new SectionProblemHandler.
func NewSectionProblemHandler() *SectionProblemHandler {
	return &SectionProblemHandler{}
}

// publishProblemRequest is the request body for POST /sections/{id}/problems.
type publishProblemRequest struct {
	ProblemID    string `json:"problem_id" validate:"required,uuid"`
	ShowSolution bool   `json:"show_solution"`
}

// updateSectionProblemRequest is the request body for PATCH /sections/{id}/problems/{problemID}.
type updateSectionProblemRequest struct {
	ShowSolution *bool `json:"show_solution"`
}

// List handles GET /api/v1/sections/{id}/problems — list published problems for section.
func (h *SectionProblemHandler) List(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	problems, err := repos.ListSectionProblems(r.Context(), sectionID, authUser.ID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if problems == nil {
		problems = []store.PublishedProblemWithStatus{}
	}

	httputil.WriteJSON(w, http.StatusOK, problems)
}

// Publish handles POST /api/v1/sections/{id}/problems — publish problem to section (instructor+).
func (h *SectionProblemHandler) Publish(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[publishProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	problemID, err := uuid.Parse(req.ProblemID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid problem_id")
		return
	}

	repos := store.ReposFromContext(r.Context())
	sp, err := repos.CreateSectionProblem(r.Context(), store.CreateSectionProblemParams{
		SectionID:    sectionID,
		ProblemID:    problemID,
		PublishedBy:  authUser.ID,
		ShowSolution: req.ShowSolution,
	})
	if err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			httputil.WriteError(w, http.StatusConflict, "problem already published to this section")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, sp)
}

// Update handles PATCH /api/v1/sections/{id}/problems/{problemID} — update settings (instructor+).
func (h *SectionProblemHandler) Update(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	problemID, ok := httpbind.ParseUUIDParam(w, r, "problemID")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateSectionProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	sp, err := repos.UpdateSectionProblem(r.Context(), sectionID, problemID, store.UpdateSectionProblemParams{
		ShowSolution: req.ShowSolution,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, sp)
}

// Unpublish handles DELETE /api/v1/sections/{id}/problems/{problemID} — unpublish (instructor+).
func (h *SectionProblemHandler) Unpublish(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	problemID, ok := httpbind.ParseUUIDParam(w, r, "problemID")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	err := repos.DeleteSectionProblem(r.Context(), sectionID, problemID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListSectionsForProblem handles GET /api/v1/problems/{id}/sections — list sections where published (instructor+).
func (h *SectionProblemHandler) ListSectionsForProblem(w http.ResponseWriter, r *http.Request) {
	problemID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	sections, err := repos.ListSectionsForProblem(r.Context(), problemID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if sections == nil {
		sections = []store.SectionProblem{}
	}

	httputil.WriteJSON(w, http.StatusOK, sections)
}
