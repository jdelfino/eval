package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// RevisionHandler handles revision management routes.
type RevisionHandler struct{}

// NewRevisionHandler creates a new RevisionHandler.
func NewRevisionHandler() *RevisionHandler {
	return &RevisionHandler{}
}

// List handles GET /api/v1/sessions/{sessionID}/revisions — returns revisions for a session.
func (h *RevisionHandler) List(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "sessionID")
	if !ok {
		return
	}

	var userID *uuid.UUID
	if userIDStr := r.URL.Query().Get("user_id"); userIDStr != "" {
		parsed, err := uuid.Parse(userIDStr)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid user_id")
			return
		}
		userID = &parsed
	}

	repos := store.ReposFromContext(r.Context())
	revisions, err := repos.ListRevisions(r.Context(), sessionID, userID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if revisions == nil {
		revisions = []store.Revision{}
	}

	httputil.WriteJSON(w, http.StatusOK, revisions)
}

// createRevisionRequest is the request body for POST /sessions/{sessionID}/revisions.
type createRevisionRequest struct {
	FullCode        *string         `json:"full_code"`
	IsDiff          bool            `json:"is_diff"`
	Diff            *string         `json:"diff"`
	BaseRevisionID  *uuid.UUID      `json:"base_revision_id"`
	ExecutionResult json.RawMessage `json:"execution_result"`
}

// Create handles POST /api/v1/sessions/{sessionID}/revisions — creates a new revision.
func (h *RevisionHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "sessionID")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[createRevisionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	revision, err := repos.CreateRevision(r.Context(), store.CreateRevisionParams{
		NamespaceID:     authUser.NamespaceID,
		SessionID:       sessionID,
		UserID:          authUser.ID,
		IsDiff:          req.IsDiff,
		Diff:            req.Diff,
		FullCode:        req.FullCode,
		BaseRevisionID:  req.BaseRevisionID,
		ExecutionResult: req.ExecutionResult,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, revision)
}
