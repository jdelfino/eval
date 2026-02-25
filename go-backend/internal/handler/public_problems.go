package handler

import (
	"errors"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// PublicProblemHandler handles the public (unauthenticated) problem endpoint.
type PublicProblemHandler struct{}

// NewPublicProblemHandler creates a new PublicProblemHandler.
func NewPublicProblemHandler() *PublicProblemHandler {
	return &PublicProblemHandler{}
}

// Get handles GET /api/v1/public/problems/{id} — returns public problem fields, no auth required.
func (h *PublicProblemHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	problem, err := repos.GetPublicProblem(r.Context(), id)
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
