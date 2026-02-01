package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ProblemHandler handles problem management routes.
type ProblemHandler struct {
	problems store.ProblemRepository
}

// NewProblemHandler creates a new ProblemHandler with the given repository.
func NewProblemHandler(problems store.ProblemRepository) *ProblemHandler {
	return &ProblemHandler{problems: problems}
}

// Routes returns a chi.Router with problem routes mounted.
func (h *ProblemHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/{id}", h.Get)

	// Instructor+ routes
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})

	return r
}

// List handles GET /api/v1/problems — returns all problems visible to the user.
// Supports query params: class_id, author_id, tags (comma-separated), include_public, sort_by, sort_order.
func (h *ProblemHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filters := store.ProblemFilters{
		SortBy:    q.Get("sort_by"),
		SortOrder: q.Get("sort_order"),
	}

	if classIDStr := q.Get("class_id"); classIDStr != "" {
		parsed, err := uuid.Parse(classIDStr)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid class_id")
			return
		}
		filters.ClassID = &parsed
	}

	if authorIDStr := q.Get("author_id"); authorIDStr != "" {
		parsed, err := uuid.Parse(authorIDStr)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid author_id")
			return
		}
		filters.AuthorID = &parsed
	}

	if tagsStr := q.Get("tags"); tagsStr != "" {
		filters.Tags = strings.Split(tagsStr, ",")
	}

	if q.Get("public_only") == "true" {
		filters.PublicOnly = true
	}

	// Use filtered query if any extended filters are set
	hasExtended := filters.AuthorID != nil || len(filters.Tags) > 0 ||
		filters.PublicOnly || filters.SortBy != "" || filters.SortOrder != ""

	var problems []store.Problem
	var err error
	if hasExtended {
		problems, err = h.problems.ListProblemsFiltered(r.Context(), filters)
	} else {
		problems, err = h.problems.ListProblems(r.Context(), filters.ClassID)
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if problems == nil {
		problems = []store.Problem{}
	}

	httputil.WriteJSON(w, http.StatusOK, problems)
}

// Get handles GET /api/v1/problems/{id} — returns a single problem.
func (h *ProblemHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	problem, err := h.problems.GetProblem(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, problem)
}

// createProblemRequest is the request body for POST /problems.
type createProblemRequest struct {
	Title             string          `json:"title" validate:"required,min=1,max=255"`
	Description       *string         `json:"description" validate:"omitempty,max=5000"`
	StarterCode       *string         `json:"starter_code" validate:"omitempty"`
	TestCases         json.RawMessage `json:"test_cases"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
	ClassID           *uuid.UUID      `json:"class_id"`
	Tags              []string        `json:"tags"`
	Solution          *string         `json:"solution"`
}

// Create handles POST /api/v1/problems — creates a new problem (instructor+).
func (h *ProblemHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httputil.BindJSON[createProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	problem, err := h.problems.CreateProblem(r.Context(), store.CreateProblemParams{
		NamespaceID:       authUser.NamespaceID,
		Title:             req.Title,
		Description:       req.Description,
		StarterCode:       req.StarterCode,
		TestCases:         req.TestCases,
		ExecutionSettings: req.ExecutionSettings,
		AuthorID:          authUser.ID,
		ClassID:           req.ClassID,
		Tags:              req.Tags,
		Solution:          req.Solution,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, problem)
}

// updateProblemRequest is the request body for PATCH /problems/{id}.
type updateProblemRequest struct {
	Title             *string         `json:"title" validate:"omitempty,min=1,max=255"`
	Description       *string         `json:"description" validate:"omitempty,max=5000"`
	StarterCode       *string         `json:"starter_code" validate:"omitempty"`
	TestCases         json.RawMessage `json:"test_cases"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
	ClassID           *uuid.UUID      `json:"class_id"`
	Tags              []string        `json:"tags"`
	Solution          *string         `json:"solution"`
}

// Update handles PATCH /api/v1/problems/{id} — updates a problem (author or system-admin, enforced by RLS).
func (h *ProblemHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[updateProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	problem, err := h.problems.UpdateProblem(r.Context(), id, store.UpdateProblemParams{
		Title:             req.Title,
		Description:       req.Description,
		StarterCode:       req.StarterCode,
		TestCases:         req.TestCases,
		ExecutionSettings: req.ExecutionSettings,
		ClassID:           req.ClassID,
		Tags:              req.Tags,
		Solution:          req.Solution,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, problem)
}

// Delete handles DELETE /api/v1/problems/{id} — deletes a problem (author or system-admin, enforced by RLS).
func (h *ProblemHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	err := h.problems.DeleteProblem(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
