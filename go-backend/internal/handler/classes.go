package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ClassHandler handles class management routes.
type ClassHandler struct {
	classes store.ClassRepository
}

// NewClassHandler creates a new ClassHandler with the given repository.
func NewClassHandler(classes store.ClassRepository) *ClassHandler {
	return &ClassHandler{classes: classes}
}

// Routes returns a chi.Router with class routes mounted.
func (h *ClassHandler) Routes() chi.Router {
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

// List handles GET /api/v1/classes — returns all classes visible to the user.
func (h *ClassHandler) List(w http.ResponseWriter, r *http.Request) {
	classes, err := h.classes.ListClasses(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if classes == nil {
		classes = []store.Class{}
	}

	httputil.WriteJSON(w, http.StatusOK, classes)
}

// Get handles GET /api/v1/classes/{id} — returns a single class.
func (h *ClassHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	class, err := h.classes.GetClass(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, class)
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

	req, err := httputil.BindJSON[createClassRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	class, err := h.classes.CreateClass(r.Context(), store.CreateClassParams{
		NamespaceID: authUser.NamespaceID,
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   authUser.ID,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[updateClassRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	class, err := h.classes.UpdateClass(r.Context(), id, store.UpdateClassParams{
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, class)
}

// Delete handles DELETE /api/v1/classes/{id} — deletes a class (author or system-admin, enforced by RLS).
func (h *ClassHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	err := h.classes.DeleteClass(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "class not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
