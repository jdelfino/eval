package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ProblemHandler handles problem management routes.
type ProblemHandler struct {
	sectionProblemHandler *SectionProblemHandler
}

// NewProblemHandler creates a new ProblemHandler.
func NewProblemHandler(sectionProblemHandler *SectionProblemHandler) *ProblemHandler {
	return &ProblemHandler{
		sectionProblemHandler: sectionProblemHandler,
	}
}

// Routes returns a chi.Router with problem routes mounted.
func (h *ProblemHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/{id}", h.Get)

	// Instructor+ routes (content management)
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequirePermission(auth.PermContentManage))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Get("/{id}/sections", h.sectionProblemHandler.ListSectionsForProblem)
	})

	return r
}

// List handles GET /api/v1/problems — returns all problems visible to the user.
// Supports query params: class_id, author_id, tags (comma-separated), include_public, sort_by, sort_order.
func (h *ProblemHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	sortBy := q.Get("sort_by")
	if sortBy != "" && sortBy != "created_at" && sortBy != "title" && sortBy != "updated_at" {
		httputil.WriteError(w, http.StatusBadRequest, "invalid sort_by: must be one of created_at, title, updated_at")
		return
	}

	sortOrder := q.Get("sort_order")
	if sortOrder != "" && sortOrder != "asc" && sortOrder != "desc" {
		httputil.WriteError(w, http.StatusBadRequest, "invalid sort_order: must be asc or desc")
		return
	}

	filters := store.ProblemFilters{
		SortBy:    sortBy,
		SortOrder: sortOrder,
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

	repos := store.ReposFromContext(r.Context())
	var problems []store.Problem
	problems, err := repos.ListProblemsFiltered(r.Context(), filters)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if problems == nil {
		problems = []store.Problem{}
	}

	httputil.WriteJSON(w, http.StatusOK, problems)
}

// Get handles GET /api/v1/problems/{id} — returns a single problem.
func (h *ProblemHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	problem, err := repos.GetProblem(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
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
	Language          string          `json:"language,omitempty"`
}

// Create handles POST /api/v1/problems — creates a new problem (instructor+).
func (h *ProblemHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[createProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	lang, err := normalizeLanguage(req.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	repos := store.ReposFromContext(r.Context())
	problem, err := repos.CreateProblem(r.Context(), store.CreateProblemParams{
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
		Language:          lang,
	})
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
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
	Language          *string         `json:"language,omitempty"`
}

// Update handles PATCH /api/v1/problems/{id} — updates a problem (author or system-admin, enforced by RLS).
func (h *ProblemHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	if req.Language != nil {
		normalized, langErr := normalizeLanguage(*req.Language)
		if langErr != nil {
			httputil.WriteError(w, http.StatusUnprocessableEntity, langErr.Error())
			return
		}
		req.Language = &normalized
	}

	repos := store.ReposFromContext(r.Context())
	problem, err := repos.UpdateProblem(r.Context(), id, store.UpdateProblemParams{
		Title:             req.Title,
		Description:       req.Description,
		StarterCode:       req.StarterCode,
		TestCases:         req.TestCases,
		ExecutionSettings: req.ExecutionSettings,
		ClassID:           req.ClassID,
		Tags:              req.Tags,
		Solution:          req.Solution,
		Language:          req.Language,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, problem)
}

// Delete handles DELETE /api/v1/problems/{id} — deletes a problem (author or system-admin, enforced by RLS).
func (h *ProblemHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	err := repos.DeleteProblem(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

