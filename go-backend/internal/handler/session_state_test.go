package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/store"
)

// sessionStateTestRepos embeds stubRepos for session state tests.
type sessionStateTestRepos struct {
	stubRepos
	sess     *mockSessionRepo
	students *mockSessionStudentRepo
	sec      *mockSectionRepo
}

var _ store.Repos = (*sessionStateTestRepos)(nil)

func (r *sessionStateTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}
func (r *sessionStateTestRepos) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return r.students.ListSessionStudents(ctx, sessionID)
}
func (r *sessionStateTestRepos) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	return r.sec.GetSection(ctx, id)
}
func (r *sessionStateTestRepos) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return r.sess.UpdateSession(ctx, id, params)
}
func stateRepos(sess *mockSessionRepo, students *mockSessionStudentRepo, sec *mockSectionRepo) *sessionStateTestRepos {
	return &sessionStateTestRepos{sess: sess, students: students, sec: sec}
}

// mockSectionRepo and testSection are defined in sections_test.go

func TestState_Success(t *testing.T) {
	sess := testSession()
	students := []store.SessionStudent{*testSessionStudent()}
	section := testSection()

	sessRepo := &mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
		return sess, nil
	}}
	studRepo := &mockSessionStudentRepo{listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
		return students, nil
	}}
	secRepo := &mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
		return section, nil
	}}
	h := NewSessionStateHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/state", nil)
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, studRepo, secRepo))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123" {
		t.Errorf("expected join_code ABC123, got %s", resp.JoinCode)
	}
	if len(resp.Students) != 1 {
		t.Errorf("expected 1 student, got %d", len(resp.Students))
	}
}

func TestState_SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
		return nil, store.ErrNotFound
	}}
	h := NewSessionStateHandler(noopPublisher())

	id := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+id.String()+"/state", nil)
	ctx := withChiParam(req.Context(), "id", id.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, &mockSectionRepo{}))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestPublicState_Success(t *testing.T) {
	sess := testSession()
	section := testSection()

	sessRepo := &mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
		return sess, nil
	}}
	secRepo := &mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
		return section, nil
	}}
	h := NewSessionStateHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/public-state", nil)
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, secRepo))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.PublicState(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionPublicStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123" {
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

	sessRepo := &mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
		return sess, nil
	}}
	studRepo := &mockSessionStudentRepo{listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
		return students, nil
	}}
	secRepo := &mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
		return section, nil
	}}
	h := NewSessionStateHandler(noopPublisher())

	// Details route now points to State handler
	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/details", nil)
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, studRepo, secRepo))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.State(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.JoinCode != "ABC-123" {
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

	sessRepo := &mockSessionRepo{
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return &updatedSess, nil
		},
	}
	h := NewSessionStateHandler(noopPublisher())

	body := `{"student_id":"` + studentID.String() + `","code":"` + code + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sess.ID.String()+"/feature", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, &mockSectionRepo{}))
	req = req.WithContext(ctx)
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

	sessRepo := &mockSessionRepo{
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return &updatedSess, nil
		},
	}
	h := NewSessionStateHandler(pub)

	body := `{"student_id":"` + studentID.String() + `","code":"` + code + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sess.ID.String()+"/feature", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, &mockSectionRepo{}))
	req = req.WithContext(ctx)
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

func TestFeature_PassesExecutionSettingsToPublisher(t *testing.T) {
	sess := testSession()
	studentID := uuid.New()
	code := "x = 1"

	updatedSess := *sess
	updatedSess.FeaturedStudentID = &studentID
	updatedSess.FeaturedCode = &code

	pub := newMockPublisher()

	var capturedParams store.UpdateSessionParams
	sessRepo := &mockSessionRepo{
		updateSessionFn: func(_ context.Context, _ uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			capturedParams = params
			return &updatedSess, nil
		},
	}
	h := NewSessionStateHandler(pub)

	body := `{"student_id":"` + studentID.String() + `","code":"` + code + `","execution_settings":{"stdin":"hello world"}}`
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+sess.ID.String()+"/feature", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, &mockSectionRepo{}))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.Feature(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify execution_settings was passed to store update params
	if capturedParams.FeaturedExecutionSettings == nil {
		t.Fatal("expected FeaturedExecutionSettings to be set in UpdateSessionParams")
	}
	if string(capturedParams.FeaturedExecutionSettings) != `{"stdin":"hello world"}` {
		t.Errorf("expected FeaturedExecutionSettings %q, got %q", `{"stdin":"hello world"}`, string(capturedParams.FeaturedExecutionSettings))
	}

	pub.waitForCalls(t, 1)

	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.featuredStudentChangedCalls) != 1 {
		t.Fatalf("expected 1 featured_student_changed call, got %d", len(pub.featuredStudentChangedCalls))
	}
	call := pub.featuredStudentChangedCalls[0]
	if string(call.executionSettings) != `{"stdin":"hello world"}` {
		t.Errorf("expected execution_settings %q, got %q", `{"stdin":"hello world"}`, string(call.executionSettings))
	}
}

func TestPublicState_ReturnsFeaturedExecutionSettings(t *testing.T) {
	sess := testSession()
	studentID := uuid.New()
	code := "print('hi')"
	sess.FeaturedStudentID = &studentID
	sess.FeaturedCode = &code
	sess.FeaturedExecutionSettings = json.RawMessage(`{"stdin":"test input"}`)
	section := testSection()

	sessRepo := &mockSessionRepo{getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
		return sess, nil
	}}
	secRepo := &mockSectionRepo{getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
		return section, nil
	}}
	h := NewSessionStateHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodGet, "/sessions/"+sess.ID.String()+"/public-state", nil)
	ctx := withChiParam(req.Context(), "id", sess.ID.String())
	ctx = store.WithRepos(ctx, stateRepos(sessRepo, &mockSessionStudentRepo{}, secRepo))
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	h.PublicState(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp sessionPublicStateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.FeaturedExecutionSettings == nil {
		t.Fatal("expected featured_execution_settings to be present in response")
	}
	if string(resp.FeaturedExecutionSettings) != `{"stdin":"test input"}` {
		t.Errorf("expected featured_execution_settings %q, got %q", `{"stdin":"test input"}`, string(resp.FeaturedExecutionSettings))
	}
}
