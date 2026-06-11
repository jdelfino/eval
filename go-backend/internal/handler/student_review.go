package handler

import (
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// studentWorkResponse is the wrapper returned by ListStudentWork.
// The response shape was intentionally changed from a bare []StudentWorkSummary to
// this wrapper in order to add per-session revision stats without a new endpoint.
type studentWorkResponse struct {
	Work     []store.StudentWorkSummary  `json:"work"`
	Sessions []store.StudentSessionStat  `json:"sessions"`
}

// StudentReviewHandler handles instructor endpoints for reviewing student work.
type StudentReviewHandler struct{}

// NewStudentReviewHandler creates a new StudentReviewHandler.
func NewStudentReviewHandler() *StudentReviewHandler {
	return &StudentReviewHandler{}
}

// ListStudentProgress handles GET /api/v1/sections/{id}/student-progress —
// returns progress summary for all students in a section (instructor only).
func (h *StudentReviewHandler) ListStudentProgress(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	progress, err := repos.ListStudentProgress(r.Context(), sectionID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if progress == nil {
		progress = []store.StudentProgress{}
	}

	httputil.WriteJSON(w, http.StatusOK, progress)
}

// ListStudentWork handles GET /api/v1/sections/{id}/students/{userID}/work —
// returns all published problems in a section with the given student's work, plus
// per-session revision stats. Response shape: {"work": [...], "sessions": [...]}.
// This is an instructor-only endpoint (gated by PermContentManage in sections.go).
func (h *StudentReviewHandler) ListStudentWork(w http.ResponseWriter, r *http.Request) {
	sectionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	userID, ok := httpbind.ParseUUIDParam(w, r, "userID")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	summaries, err := repos.ListStudentWorkForReview(r.Context(), sectionID, userID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	sessions, err := repos.ListStudentSessionStats(r.Context(), sectionID, userID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	if summaries == nil {
		summaries = []store.StudentWorkSummary{}
	}
	if sessions == nil {
		sessions = []store.StudentSessionStat{}
	}

	httputil.WriteJSON(w, http.StatusOK, studentWorkResponse{
		Work:     summaries,
		Sessions: sessions,
	})
}
