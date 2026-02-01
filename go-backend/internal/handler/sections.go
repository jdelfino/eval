package handler

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SectionHandler handles section management routes.
type SectionHandler struct {
	sections    store.SectionRepository
	sessions    store.SessionRepository
	memberships store.MembershipRepository
	users       store.UserRepository
}

// NewSectionHandler creates a new SectionHandler with the given repositories.
func NewSectionHandler(sections store.SectionRepository, sessions store.SessionRepository, memberships store.MembershipRepository, users store.UserRepository) *SectionHandler {
	return &SectionHandler{sections: sections, sessions: sessions, memberships: memberships, users: users}
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
	classID, ok := httputil.ParseUUIDParam(w, r, "classID")
	if !ok {
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
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

	classID, ok := httputil.ParseUUIDParam(w, r, "classID")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[createSectionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	const maxJoinCodeRetries = 3
	var section *store.Section
	for attempt := 0; attempt < maxJoinCodeRetries; attempt++ {
		joinCode, err := generateJoinCode()
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}

		section, err = h.sections.CreateSection(r.Context(), store.CreateSectionParams{
			NamespaceID: authUser.NamespaceID,
			ClassID:     classID,
			Name:        req.Name,
			Semester:    req.Semester,
			JoinCode:    joinCode,
		})
		if err == nil {
			break
		}
		if store.IsUniqueViolation(err, "sections_join_code_key") {
			continue
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if section == nil {
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	err := h.sections.DeleteSection(r.Context(), id)
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

// MySections handles GET /api/v1/sections/my — returns sections the user is enrolled in.
func (h *SectionHandler) MySections(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sections, err := h.sections.ListMySections(r.Context(), authUser.ID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sections == nil {
		sections = []store.MySectionInfo{}
	}

	httputil.WriteJSON(w, http.StatusOK, sections)
}

// ListSessions handles GET /api/v1/sections/{id}/sessions — returns sessions for a section.
func (h *SectionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	sessions, err := h.sessions.ListSessions(r.Context(), store.SessionFilters{SectionID: &id})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sessions == nil {
		sessions = []store.Session{}
	}

	httputil.WriteJSON(w, http.StatusOK, sessions)
}

// RegenerateCode handles POST /api/v1/sections/{id}/regenerate-code — regenerate join code (instructor+).
func (h *SectionHandler) RegenerateCode(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	const maxRetries = 3
	var section *store.Section
	for attempt := 0; attempt < maxRetries; attempt++ {
		joinCode, err := generateJoinCode()
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}

		section, err = h.sections.UpdateSectionJoinCode(r.Context(), id, joinCode)
		if err == nil {
			break
		}
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		if store.IsUniqueViolation(err, "sections_join_code_key") {
			continue
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if section == nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, section)
}

// ListInstructors handles GET /api/v1/sections/{id}/instructors — list section instructors.
func (h *SectionHandler) ListInstructors(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	members, err := h.memberships.ListMembers(r.Context(), sectionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var instructors []store.SectionMembership
	for _, m := range members {
		if m.Role == string(auth.RoleInstructor) {
			instructors = append(instructors, m)
		}
	}

	if instructors == nil {
		instructors = []store.SectionMembership{}
	}

	httputil.WriteJSON(w, http.StatusOK, instructors)
}

// addInstructorRequest is the request body for POST /sections/{id}/instructors.
type addInstructorRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// AddInstructor handles POST /api/v1/sections/{id}/instructors — add instructor by email.
func (h *SectionHandler) AddInstructor(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[addInstructorRequest](w, r)
	if err != nil {
		return
	}

	user, err := h.users.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if user.Role != string(auth.RoleInstructor) && user.Role != string(auth.RoleNamespaceAdmin) && user.Role != string(auth.RoleSystemAdmin) {
		httputil.WriteError(w, http.StatusBadRequest, "user is not an instructor")
		return
	}

	membership, err := h.memberships.CreateMembership(r.Context(), store.CreateMembershipParams{
		UserID:    user.ID,
		SectionID: sectionID,
		Role:      "instructor",
	})
	if err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			httputil.WriteError(w, http.StatusConflict, "user is already an instructor for this section")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, membership)
}

// RemoveInstructor handles DELETE /api/v1/sections/{id}/instructors/{userID} — remove instructor.
func (h *SectionHandler) RemoveInstructor(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	userID, ok := httputil.ParseUUIDParam(w, r, "userID")
	if !ok {
		return
	}

	// Prevent removing the last instructor
	members, err := h.memberships.ListMembers(r.Context(), sectionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	instructorCount := 0
	for _, m := range members {
		if m.Role == string(auth.RoleInstructor) {
			instructorCount++
		}
	}

	if instructorCount <= 1 {
		httputil.WriteError(w, http.StatusBadRequest, "cannot remove the last instructor")
		return
	}

	err = h.memberships.DeleteMembership(r.Context(), sectionID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "instructor not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// generateJoinCode generates a join code in the format ABC-123-XYZ.
func generateJoinCode() (string, error) {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	const digits = "0123456789"

	b := make([]byte, 9)
	for i := 0; i < 3; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			return "", fmt.Errorf("crypto/rand failed: %w", err)
		}
		b[i] = letters[n.Int64()]
	}
	for i := 3; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			return "", fmt.Errorf("crypto/rand failed: %w", err)
		}
		b[i] = digits[n.Int64()]
	}
	for i := 6; i < 9; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			return "", fmt.Errorf("crypto/rand failed: %w", err)
		}
		b[i] = letters[n.Int64()]
	}
	return string(b[:3]) + "-" + string(b[3:6]) + "-" + string(b[6:9]), nil
}
