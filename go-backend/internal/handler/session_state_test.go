package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/store"
)

// mockSectionRepo and testSection are defined in sections_test.go

func TestState_Success(t *testing.T) {
	sess := testSession()
	students := []store.SessionStudent{*testSessionStudent()}
	section := testSection()

	h := NewSessionStateHandler(
		&mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		}},
		&mockSessionStudentRepo{listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return students, nil
		}},
		&mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return section, nil
		}},
		noopPublisher(),
		testLogger(),
	)

	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/state", nil)
	req = req.WithContext(withChiParam(req.Context(), "id", sess.ID.String()))
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123-XYZ" {
		t.Errorf("expected join_code ABC123, got %s", resp.JoinCode)
	}
	if len(resp.Students) != 1 {
		t.Errorf("expected 1 student, got %d", len(resp.Students))
	}
}

func TestState_SessionNotFound(t *testing.T) {
	h := NewSessionStateHandler(
		&mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		}},
		&mockSessionStudentRepo{},
		&mockSectionRepo{},
		noopPublisher(),
		testLogger(),
	)

	id := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+id.String()+"/state", nil)
	req = req.WithContext(withChiParam(req.Context(), "id", id.String()))
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestPublicState_Success(t *testing.T) {
	sess := testSession()
	section := testSection()

	h := NewSessionStateHandler(
		&mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		}},
		&mockSessionStudentRepo{},
		&mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return section, nil
		}},
		noopPublisher(),
		testLogger(),
	)

	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/public-state", nil)
	req = req.WithContext(withChiParam(req.Context(), "id", sess.ID.String()))
	w := httptest.NewRecorder()

	h.PublicState(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionPublicStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123-XYZ" {
		t.Errorf("expected join_code ABC123, got %s", resp.JoinCode)
	}
	if resp.Status != "active" {
		t.Errorf("expected status active, got %s", resp.Status)
	}
}

// TestDetails_RoutesToState verifies that /details uses the same State handler.
func TestDetails_RoutesToState(t *testing.T) {
	sess := testSession()
	students := []store.SessionStudent{*testSessionStudent()}
	section := testSection()

	h := NewSessionStateHandler(
		&mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		}},
		&mockSessionStudentRepo{listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return students, nil
		}},
		&mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return section, nil
		}},
		noopPublisher(),
		testLogger(),
	)

	// Details route now points to State handler
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/details", nil)
	req = req.WithContext(withChiParam(req.Context(), "id", sess.ID.String()))
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123-XYZ" {
		t.Errorf("expected join_code ABC123, got %s", resp.JoinCode)
	}
}

func TestFeature_Success(t *testing.T) {
	sess := testSession()
	studentID := uuid.New()
	code := "print('hello')"

	updatedSess := *sess
	updatedSess.FeaturedStudentID = &studentID
	updatedSess.FeaturedCode = &code

	h := NewSessionStateHandler(
		&mockSessionRepo{
			updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
				return &updatedSess, nil
			},
		},
		&mockSessionStudentRepo{},
		&mockSectionRepo{},
		noopPublisher(),
		testLogger(),
	)

	body := `{"student_id":"` + studentID.String() + `","code":"` + code + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sess.ID.String()+"/feature", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(withChiParam(req.Context(), "id", sess.ID.String()))
	w := httptest.NewRecorder()

	h.Feature(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFeature_PublishesFeaturedStudentChanged(t *testing.T) {
	sess := testSession()
	studentID := uuid.New()
	code := "x = 1"

	updatedSess := *sess
	updatedSess.FeaturedStudentID = &studentID
	updatedSess.FeaturedCode = &code

	pub := newMockPublisher()

	h := NewSessionStateHandler(
		&mockSessionRepo{
			updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
				return &updatedSess, nil
			},
		},
		&mockSessionStudentRepo{},
		&mockSectionRepo{},
		pub,
		testLogger(),
	)

	body := `{"student_id":"` + studentID.String() + `","code":"` + code + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sess.ID.String()+"/feature", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(withChiParam(req.Context(), "id", sess.ID.String()))
	w := httptest.NewRecorder()

	h.Feature(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	pub.waitForCalls(t, 1)

	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.featuredStudentChangedCalls) != 1 {
		t.Fatalf("expected 1 featured_student_changed call, got %d", len(pub.featuredStudentChangedCalls))
	}
	call := pub.featuredStudentChangedCalls[0]
	if call.sessionID != sess.ID.String() {
		t.Errorf("expected session ID %s, got %s", sess.ID.String(), call.sessionID)
	}
	if call.userID != studentID.String() {
		t.Errorf("expected user ID %s, got %s", studentID.String(), call.userID)
	}
	if call.code != code {
		t.Errorf("expected code %q, got %q", code, call.code)
	}
}
