package handler

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SectionHandler handles section management routes.
type SectionHandler struct {
	sections store.SectionRepository
}

// NewSectionHandler creates a new SectionHandler with the given repository.
func NewSectionHandler(sections store.SectionRepository) *SectionHandler {
	return &SectionHandler{sections: sections}
}

// Routes returns a chi.Router with standalone section routes mounted.
func (h *SectionHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Route("/{id}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Group(func(r chi.Router) {
			r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
			r.Patch("/", h.Update)
			r.Delete("/", h.Delete)
		})
	})

	return r
}

// ClassRoutes returns a chi.Router with class-scoped section routes.
func (h *SectionHandler) ClassRoutes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.ListByClass)
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
		r.Post("/", h.Create)
	})

	return r
}

// ListByClass handles GET /api/v1/classes/{classID}/sections — returns all sections for a class.
func (h *SectionHandler) ListByClass(w http.ResponseWriter, r *http.Request) {
	classID, err := uuid.Parse(chi.URLParam(r, "classID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid class id")
		return
	}

	sections, err := h.sections.ListSectionsByClass(r.Context(), classID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sections == nil {
		sections = []store.Section{}
	}

	httputil.WriteJSON(w, http.StatusOK, sections)
}

// Get handles GET /api/v1/sections/{id} — returns a single section.
func (h *SectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid section id")
		return
	}

	section, err := h.sections.GetSection(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, section)
}

// createSectionRequest is the request body for POST /classes/{classID}/sections.
type createSectionRequest struct {
	Name     string  `json:"name" validate:"required,min=1,max=255"`
	Semester *string `json:"semester" validate:"omitempty,max=255"`
}

// Create handles POST /api/v1/classes/{classID}/sections — creates a new section (instructor+).
func (h *SectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	classID, err := uuid.Parse(chi.URLParam(r, "classID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid class id")
		return
	}

	req, err := httputil.BindJSON[createSectionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	section, err := h.sections.CreateSection(r.Context(), store.CreateSectionParams{
		NamespaceID: authUser.NamespaceID,
		ClassID:     classID,
		Name:        req.Name,
		Semester:    req.Semester,
		JoinCode:    generateJoinCode(),
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, section)
}

// updateSectionRequest is the request body for PATCH /sections/{id}.
type updateSectionRequest struct {
	Name     *string `json:"name" validate:"omitempty,min=1,max=255"`
	Semester *string `json:"semester" validate:"omitempty,max=255"`
	Active   *bool   `json:"active"`
}

// Update handles PATCH /api/v1/sections/{id} — updates a section (instructor+).
func (h *SectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid section id")
		return
	}

	req, err := httputil.BindJSON[updateSectionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	section, err := h.sections.UpdateSection(r.Context(), id, store.UpdateSectionParams{
		Name:     req.Name,
		Semester: req.Semester,
		Active:   req.Active,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, section)
}

// Delete handles DELETE /api/v1/sections/{id} — deletes a section (instructor+).
func (h *SectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid section id")
		return
	}

	err = h.sections.DeleteSection(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// generateJoinCode generates a join code in the format ABC-123-XYZ.
func generateJoinCode() string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	const digits = "0123456789"

	b := make([]byte, 9)
	for i := 0; i < 3; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			panic(fmt.Sprintf("crypto/rand failed: %v", err))
		}
		b[i] = letters[n.Int64()]
	}
	for i := 3; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			panic(fmt.Sprintf("crypto/rand failed: %v", err))
		}
		b[i] = digits[n.Int64()]
	}
	for i := 6; i < 9; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			panic(fmt.Sprintf("crypto/rand failed: %v", err))
		}
		b[i] = letters[n.Int64()]
	}
	return string(b[:3]) + "-" + string(b[3:6]) + "-" + string(b[6:9])
}
