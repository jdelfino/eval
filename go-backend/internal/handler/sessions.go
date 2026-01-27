package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SessionHandler handles session management routes.
type SessionHandler struct {
	sessions store.SessionRepository
}

// NewSessionHandler creates a new SessionHandler with the given repository.
func NewSessionHandler(sessions store.SessionRepository) *SessionHandler {
	return &SessionHandler{sessions: sessions}
}

// Routes returns a chi.Router with session routes mounted.
func (h *SessionHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/{id}", h.Get)

	// Instructor+ routes
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
	})

	return r
}

// List handles GET /api/v1/sessions — returns sessions with optional filters.
func (h *SessionHandler) List(w http.ResponseWriter, r *http.Request) {
	var filters store.SessionFilters

	if sectionIDStr := r.URL.Query().Get("section_id"); sectionIDStr != "" {
		sectionID, err := uuid.Parse(sectionIDStr)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid section_id")
			return
		}
		filters.SectionID = &sectionID
	}

	if status := r.URL.Query().Get("status"); status != "" {
		filters.Status = &status
	}

	sessions, err := h.sessions.ListSessions(r.Context(), filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sessions == nil {
		sessions = []store.Session{}
	}

	httputil.WriteJSON(w, http.StatusOK, sessions)
}

// Get handles GET /api/v1/sessions/{id} — returns a single session.
func (h *SessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid session id")
		return
	}

	session, err := h.sessions.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, session)
}

// createSessionRequest is the request body for POST /sessions.
type createSessionRequest struct {
	SectionID   uuid.UUID       `json:"section_id" validate:"required"`
	SectionName string          `json:"section_name" validate:"required,min=1,max=255"`
	Problem     json.RawMessage `json:"problem" validate:"required"`
}

// Create handles POST /api/v1/sessions — creates a new session (instructor+).
func (h *SessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httputil.BindJSON[createSessionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	session, err := h.sessions.CreateSession(r.Context(), store.CreateSessionParams{
		NamespaceID: authUser.NamespaceID,
		SectionID:   req.SectionID,
		SectionName: req.SectionName,
		Problem:     req.Problem,
		CreatorID:   authUser.ID,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, session)
}

// updateSessionRequest is the request body for PATCH /sessions/{id}.
type updateSessionRequest struct {
	FeaturedStudentID *uuid.UUID `json:"featured_student_id"`
	FeaturedCode      *string    `json:"featured_code" validate:"omitempty,max=50000"`
	Status            *string    `json:"status" validate:"omitempty,oneof=active completed"`
}

// Update handles PATCH /api/v1/sessions/{id} — updates a session (instructor+).
func (h *SessionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid session id")
		return
	}

	req, err := httputil.BindJSON[updateSessionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	params := store.UpdateSessionParams{
		FeaturedStudentID: req.FeaturedStudentID,
		FeaturedCode:      req.FeaturedCode,
		Status:            req.Status,
	}

	// When ending a session, set ended_at to now
	if req.Status != nil && *req.Status == "completed" {
		now := time.Now()
		params.EndedAt = &now
	}

	session, err := h.sessions.UpdateSession(r.Context(), id, params)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, session)
}
