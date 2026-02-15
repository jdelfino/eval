package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ClassHandler handles class management routes.
type ClassHandler struct{}

// NewClassHandler creates a new ClassHandler.
func NewClassHandler() *ClassHandler {
	return &ClassHandler{}
}

// Routes returns a chi.Router with class routes mounted.
func (h *ClassHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/{id}", h.Get)

	// Instructor+ routes (content management)
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequirePermission(auth.PermContentManage))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})

	return r
}

// List handles GET /api/v1/classes — returns all classes visible to the user.
func (h *ClassHandler) List(w http.ResponseWriter, r *http.Request) {
	repos := store.ReposFromContext(r.Context())
	classes, err := repos.ListClasses(r.Context())
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if classes == nil {
		classes = []store.Class{}
	}

	httputil.WriteJSON(w, http.StatusOK, classes)
}

// classDetailResponse is the enriched response for GET /classes/{id}.
// Fields match frontend expectations in classes/[id]/page.tsx.
type classDetailResponse struct {
	Class                *store.Class          `json:"class"`
	Sections             []store.Section       `json:"sections"`
	InstructorNames      map[string]string     `json:"instructorNames"`
	SectionInstructors   map[string][]string   `json:"sectionInstructors"`
}

// Get handles GET /api/v1/classes/{id} — returns a single class with sections and instructor names.
func (h *ClassHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	class, err := repos.GetClass(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Enrich with sections.
	sections := []store.Section{}

	secs, err := repos.ListSectionsByClass(r.Context(), id)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}
	if secs != nil {
		sections = secs
	}

	instructorNames, err := repos.ListClassInstructorNames(r.Context(), id)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}
	if instructorNames == nil {
		instructorNames = make(map[string]string)
	}

	sectionInstructors, err := repos.ListClassSectionInstructors(r.Context(), id)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}
	if sectionInstructors == nil {
		sectionInstructors = make(map[string][]string)
	}

	httputil.WriteJSON(w, http.StatusOK, classDetailResponse{
		Class:              class,
		Sections:           sections,
		InstructorNames:    instructorNames,
		SectionInstructors: sectionInstructors,
	})
}

// createClassRequest is the request body for POST /classes.
type createClassRequest struct {
	Name        string  `json:"name" validate:"required,min=1,max=255"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
}

// Create handles POST /api/v1/classes — creates a new class (instructor+).
func (h *ClassHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[createClassRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	class, err := repos.CreateClass(r.Context(), store.CreateClassParams{
		NamespaceID: authUser.NamespaceID,
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   authUser.ID,
	})
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, class)
}

// updateClassRequest is the request body for PATCH /classes/{id}.
type updateClassRequest struct {
	Name        *string `json:"name" validate:"omitempty,min=1,max=255"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
}

// Update handles PATCH /api/v1/classes/{id} — updates a class (author or system-admin, enforced by RLS).
func (h *ClassHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateClassRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	class, err := repos.UpdateClass(r.Context(), id, store.UpdateClassParams{
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, class)
}

// Delete handles DELETE /api/v1/classes/{id} — deletes a class (author or system-admin, enforced by RLS).
func (h *ClassHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	err := repos.DeleteClass(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
