package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/realtime"
	"github.com/jdelfino/eval/go-backend/internal/revision"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SessionStudentHandler handles session student participation routes.
type SessionStudentHandler struct {
	publisher realtime.SessionPublisher
	revBuffer *revision.RevisionBuffer
}

// NewSessionStudentHandler creates a new SessionStudentHandler.
func NewSessionStudentHandler(publisher realtime.SessionPublisher) *SessionStudentHandler {
	return &SessionStudentHandler{publisher: publisher}
}

// NewSessionStudentHandlerWithBuffer creates a new SessionStudentHandler with a revision buffer.
func NewSessionStudentHandlerWithBuffer(publisher realtime.SessionPublisher, revBuffer *revision.RevisionBuffer) *SessionStudentHandler {
	return &SessionStudentHandler{publisher: publisher, revBuffer: revBuffer}
}

// joinSessionRequest is the request body for POST /sessions/{id}/join.
type joinSessionRequest struct {
	Name string `json:"name" validate:"required,min=1"`
}

// Join handles POST /api/v1/sessions/{id}/join — student joins a session.
func (h *SessionStudentHandler) Join(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[joinSessionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())

	// Get session to extract problem_id from problem JSON
	session, err := repos.GetSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Parse problem JSON to extract problem ID
	var problemData struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(session.Problem, &problemData); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "invalid problem data")
		return
	}

	// Get or create student_work
	studentWork, err := repos.GetOrCreateStudentWork(r.Context(), authUser.NamespaceID, authUser.ID, problemData.ID, session.SectionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Join session with student_work_id link
	student, err := repos.JoinSession(r.Context(), store.JoinSessionParams{
		SessionID:     sessionID,
		UserID:        authUser.ID,
		Name:          req.Name,
		StudentWorkID: &studentWork.ID,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Return student's code from student_work
	student.Code = studentWork.Code
	student.ExecutionSettings = studentWork.ExecutionSettings

	_ = h.publisher.StudentJoined(r.Context(), sessionID.String(), authUser.ID.String(), req.Name)

	httputil.WriteJSON(w, http.StatusCreated, student)
}

// updateCodeRequest is the request body for PUT /sessions/{id}/code.
// Code is not validated as required because empty code is valid
// (e.g., student just joined and hasn't typed anything yet).
type updateCodeRequest struct {
	Code              string          `json:"code"`
	ExecutionSettings json.RawMessage `json:"execution_settings,omitempty"`
}

// UpdateCode handles PUT /api/v1/sessions/{id}/code — student updates their code.
func (h *SessionStudentHandler) UpdateCode(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateCodeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())

	// Get session_student to find student_work_id
	sessionStudent, err := repos.GetSessionStudent(r.Context(), sessionID, authUser.ID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session student not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sessionStudent.StudentWorkID == nil {
		httputil.WriteError(w, http.StatusInternalServerError, "student work not linked")
		return
	}

	// Update student_work instead of session_students
	studentWork, err := repos.UpdateStudentWork(r.Context(), *sessionStudent.StudentWorkID, store.UpdateStudentWorkParams{
		Code:              &req.Code,
		ExecutionSettings: req.ExecutionSettings,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Record code change in revision buffer (if configured).
	if h.revBuffer != nil {
		nsID := authUser.NamespaceID
		h.revBuffer.Record(r.Context(), nsID, *sessionStudent.StudentWorkID, &sessionID, authUser.ID, req.Code)
	}

	_ = h.publisher.CodeUpdated(r.Context(), sessionID.String(), authUser.ID.String(), req.Code)

	// Build response using student_work data
	sessionStudent.Code = studentWork.Code
	sessionStudent.ExecutionSettings = studentWork.ExecutionSettings

	httputil.WriteJSON(w, http.StatusOK, sessionStudent)
}

// ListStudents handles GET /api/v1/sessions/{id}/students — list all students in a session.
func (h *SessionStudentHandler) ListStudents(w http.ResponseWriter, r *http.Request) {
	if auth.UserFromContext(r.Context()) == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	students, err := repos.ListSessionStudents(r.Context(), sessionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if students == nil {
		students = []store.SessionStudent{}
	}

	httputil.WriteJSON(w, http.StatusOK, students)
}
