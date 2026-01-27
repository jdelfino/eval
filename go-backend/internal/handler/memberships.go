package handler

import (
	"errors"
	"net/http"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// MembershipHandler handles section membership routes.
type MembershipHandler struct {
	memberships store.MembershipRepository
}

// NewMembershipHandler creates a new MembershipHandler with the given repository.
func NewMembershipHandler(memberships store.MembershipRepository) *MembershipHandler {
	return &MembershipHandler{memberships: memberships}
}

// joinRequest is the request body for POST /sections/join.
type joinRequest struct {
	JoinCode string `json:"join_code" validate:"required,min=1"`
}

// Join handles POST /api/v1/sections/join — join a section by join code.
func (h *MembershipHandler) Join(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httputil.BindJSON[joinRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	section, err := h.memberships.GetSectionByJoinCode(r.Context(), req.JoinCode)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !section.Active {
		httputil.WriteError(w, http.StatusBadRequest, "section is not active")
		return
	}

	membership, err := h.memberships.CreateMembership(r.Context(), store.CreateMembershipParams{
		UserID:    authUser.ID,
		SectionID: section.ID,
		Role:      "student",
	})
	if err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			httputil.WriteError(w, http.StatusConflict, "already a member of this section")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, membership)
}

// Leave handles DELETE /api/v1/sections/{id}/membership — leave a section.
func (h *MembershipHandler) Leave(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	err := h.memberships.DeleteMembership(r.Context(), sectionID, authUser.ID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "membership not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListMembers handles GET /api/v1/sections/{id}/members — list section members.
func (h *MembershipHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	if auth.UserFromContext(r.Context()) == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	members, err := h.memberships.ListMembers(r.Context(), sectionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if members == nil {
		members = []store.SectionMembership{}
	}

	httputil.WriteJSON(w, http.StatusOK, members)
}
