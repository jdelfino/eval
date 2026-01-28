package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// sessionRepoReturning creates a mockSessionRepo that returns the given session/error from GetSession.
func sessionRepoReturning(session *store.Session, err error) *mockSessionRepo {
	return &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return session, err
		},
		listSessionsFn: func(_ context.Context, _ store.SessionFilters) ([]store.Session, error) {
			return nil, nil
		},
		createSessionFn: func(_ context.Context, _ store.CreateSessionParams) (*store.Session, error) {
			return nil, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return nil, nil
		},
	}
}

// studentRepoReturning creates a mockSessionStudentRepo that returns the given student/error from GetSessionStudent.
func studentRepoReturning(student *store.SessionStudent, err error) *mockSessionStudentRepo {
	return &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, _, _ uuid.UUID) (*store.SessionStudent, error) {
			return student, err
		},
		joinSessionFn: func(_ context.Context, _ store.JoinSessionParams) (*store.SessionStudent, error) {
			return nil, nil
		},
		updateCodeFn: func(_ context.Context, _, _ uuid.UUID, _ string) (*store.SessionStudent, error) {
			return nil, nil
		},
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return nil, nil
		},
	}
}

// --- tests ---

func TestCentrifugoHandler_ConnectionToken(t *testing.T) {
	h := NewCentrifugoHandler(
		&mockTokenGenerator{connToken: "conn-jwt"},
		sessionRepoReturning(nil, nil),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token", nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp tokenResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Token != "conn-jwt" {
		t.Errorf("token = %q, want %q", resp.Token, "conn-jwt")
	}
}

func TestCentrifugoHandler_ConnectionToken_Unauthenticated(t *testing.T) {
	h := NewCentrifugoHandler(
		&mockTokenGenerator{connToken: "conn-jwt"},
		sessionRepoReturning(nil, nil),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token", nil)
	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestCentrifugoHandler_ConnectionToken_GenerationError(t *testing.T) {
	h := NewCentrifugoHandler(
		&mockTokenGenerator{err: errors.New("signing failure")},
		sessionRepoReturning(nil, nil),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token", nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}
}

func TestCentrifugoHandler_SubscriptionToken_StudentParticipant(t *testing.T) {
	sessionID := uuid.New()
	userID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(&store.Session{ID: sessionID}, nil),
		studentRepoReturning(&store.SessionStudent{SessionID: sessionID, UserID: userID}, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: userID, Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp tokenResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Token != "sub-jwt" {
		t.Errorf("token = %q, want %q", resp.Token, "sub-jwt")
	}
}

func TestCentrifugoHandler_SubscriptionToken_StudentNotInSession(t *testing.T) {
	sessionID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(&store.Session{ID: sessionID}, nil),
		studentRepoReturning(nil, store.ErrNotFound),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestCentrifugoHandler_SubscriptionToken_StudentDBError(t *testing.T) {
	sessionID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(nil, nil),
		studentRepoReturning(nil, errors.New("db connection lost")),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}
}

func TestCentrifugoHandler_SubscriptionToken_Instructor(t *testing.T) {
	sessionID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(&store.Session{ID: sessionID}, nil),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleInstructor}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
}

func TestCentrifugoHandler_SubscriptionToken_InstructorDBError(t *testing.T) {
	sessionID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(nil, errors.New("db connection lost")),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleInstructor}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}
}

func TestCentrifugoHandler_SubscriptionToken_InvalidChannel(t *testing.T) {
	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(nil, nil),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=invalid:xyz", nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleStudent}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestCentrifugoHandler_SubscriptionToken_InstructorSessionNotFound(t *testing.T) {
	sessionID := uuid.New()

	h := NewCentrifugoHandler(
		&mockTokenGenerator{subToken: "sub-jwt"},
		sessionRepoReturning(nil, store.ErrNotFound),
		studentRepoReturning(nil, nil),
		15*time.Minute,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/realtime/token?channel=session:"+sessionID.String(), nil)
	user := &auth.User{ID: uuid.New(), Role: auth.RoleInstructor}
	req = req.WithContext(auth.WithUser(req.Context(), user))

	rr := httptest.NewRecorder()
	h.GetToken(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}
