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
	"github.com/jdelfino/eval/internal/realtime"
	"github.com/jdelfino/eval/internal/revision"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SessionHandler handles session management routes.
type SessionHandler struct {
	publisher realtime.SessionPublisher
	revBuffer *revision.RevisionBuffer
}

// NewSessionHandler creates a new SessionHandler.
func NewSessionHandler(publisher realtime.SessionPublisher) *SessionHandler {
	return &SessionHandler{publisher: publisher}
}

// NewSessionHandlerWithBuffer creates a new SessionHandler with a revision buffer.
func NewSessionHandlerWithBuffer(publisher realtime.SessionPublisher, revBuffer *revision.RevisionBuffer) *SessionHandler {
	return &SessionHandler{publisher: publisher, revBuffer: revBuffer}
}

// Routes returns a chi.Router with session routes mounted.
func (h *SessionHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/history", h.History)
	r.Get("/{id}", h.Get)

	// Instructor+ routes
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Post("/{id}/reopen", h.Reopen)
		r.Post("/{id}/update-problem", h.UpdateProblem)
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
		if status != "active" && status != "completed" {
			httputil.WriteError(w, http.StatusBadRequest, "invalid status: must be 'active' or 'completed'")
			return
		}
		filters.Status = &status
	}

	repos := store.ReposFromContext(r.Context())
	sessions, err := repos.ListSessions(r.Context(), filters)
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	session, err := repos.GetSession(r.Context(), id)
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

	repos := store.ReposFromContext(r.Context())
	session, err := repos.CreateSession(r.Context(), store.CreateSessionParams{
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
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[updateSessionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	// Fetch current state to detect actual changes for event publishing.
	previous, err := repos.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
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

	session, err := repos.UpdateSession(r.Context(), id, params)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Flush pending revisions when session ends.
	if req.Status != nil && *req.Status == "completed" && previous.Status != "completed" {
		if h.revBuffer != nil {
			h.revBuffer.FlushSession(r.Context(), id)
		}
	}

	// Publish real-time events only when the value actually changed.
	if req.Status != nil && *req.Status == "completed" && previous.Status != "completed" {
		_ = h.publisher.SessionEnded(r.Context(), id.String(), "completed")
	}
	if req.FeaturedStudentID != nil && req.FeaturedCode != nil {
		featuredChanged := previous.FeaturedStudentID == nil || *previous.FeaturedStudentID != *req.FeaturedStudentID
		if featuredChanged {
			_ = h.publisher.FeaturedStudentChanged(r.Context(), id.String(), req.FeaturedStudentID.String(), *req.FeaturedCode)
		}
	}

	httputil.WriteJSON(w, http.StatusOK, session)
}

// Delete handles DELETE /api/v1/sessions/{id} — ends a session (instructor+).
func (h *SessionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	existing, err := repos.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if existing.Status != "active" {
		httputil.WriteError(w, http.StatusConflict, "session is not active")
		return
	}

	status := "completed"
	now := time.Now()
	session, err := repos.UpdateSession(r.Context(), id, store.UpdateSessionParams{
		Status:  &status,
		EndedAt: &now,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Flush pending revisions when session ends.
	if h.revBuffer != nil {
		h.revBuffer.FlushSession(r.Context(), id)
	}

	_ = h.publisher.SessionEnded(r.Context(), id.String(), "completed")

	httputil.WriteJSON(w, http.StatusOK, session)
}

// Reopen handles POST /api/v1/sessions/{id}/reopen — reopens a completed session (instructor+).
func (h *SessionHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	existing, err := repos.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if existing.Status != "completed" {
		httputil.WriteError(w, http.StatusConflict, "session is not completed")
		return
	}

	status := "active"
	session, err := repos.UpdateSession(r.Context(), id, store.UpdateSessionParams{
		Status:       &status,
		ClearEndedAt: true,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, session)
}

// updateSessionProblemRequest is the request body for POST /sessions/{id}/update-problem.
type updateSessionProblemRequest struct {
	Problem json.RawMessage `json:"problem" validate:"required"`
}

// UpdateProblem handles POST /api/v1/sessions/{id}/update-problem — updates session problem JSON (instructor+).
func (h *SessionHandler) UpdateProblem(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[updateSessionProblemRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	// Check session is active before updating problem.
	existing, err := repos.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if existing.Status != "active" {
		httputil.WriteError(w, http.StatusConflict, "session is not active")
		return
	}

	session, err := repos.UpdateSessionProblem(r.Context(), id, req.Problem)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Extract problem ID from the JSON payload if present.
	var problemMeta struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(req.Problem, &problemMeta)
	_ = h.publisher.ProblemUpdated(r.Context(), id.String(), problemMeta.ID)

	httputil.WriteJSON(w, http.StatusOK, session)
}

// History handles GET /api/v1/sessions/history — returns session history for the current user.
func (h *SessionHandler) History(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var filters store.SessionHistoryFilters

	if classIDStr := r.URL.Query().Get("class_id"); classIDStr != "" {
		classID, err := uuid.Parse(classIDStr)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid class_id")
			return
		}
		filters.ClassID = &classID
	}

	if search := r.URL.Query().Get("search"); search != "" {
		filters.Search = &search
	}

	repos := store.ReposFromContext(r.Context())
	isCreator := authUser.Role != auth.RoleStudent
	sessions, err := repos.ListSessionHistory(r.Context(), authUser.ID, isCreator, filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sessions == nil {
		sessions = []store.Session{}
	}

	httputil.WriteJSON(w, http.StatusOK, sessions)
}
