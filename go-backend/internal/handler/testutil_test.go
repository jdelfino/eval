package handler

import (
	"context"
	"io"
	"log/slog"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/realtime"
	"github.com/jdelfino/eval/internal/store"
)

// --- Shared mock repositories ---

// mockSessionRepo implements store.SessionRepository for testing.
type mockSessionRepo struct {
	listSessionsFn       func(ctx context.Context, filters store.SessionFilters) ([]store.Session, error)
	getSessionFn         func(ctx context.Context, id uuid.UUID) (*store.Session, error)
	createSessionFn      func(ctx context.Context, params store.CreateSessionParams) (*store.Session, error)
	updateSessionFn      func(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error)
	listSessionHistoryFn func(ctx context.Context, userID uuid.UUID, role string, filters store.SessionHistoryFilters) ([]store.Session, error)
}

func (m *mockSessionRepo) ListSessions(ctx context.Context, filters store.SessionFilters) ([]store.Session, error) {
	return m.listSessionsFn(ctx, filters)
}

func (m *mockSessionRepo) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return m.getSessionFn(ctx, id)
}

func (m *mockSessionRepo) CreateSession(ctx context.Context, params store.CreateSessionParams) (*store.Session, error) {
	return m.createSessionFn(ctx, params)
}

func (m *mockSessionRepo) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return m.updateSessionFn(ctx, id, params)
}

func (m *mockSessionRepo) ListSessionHistory(ctx context.Context, userID uuid.UUID, role string, filters store.SessionHistoryFilters) ([]store.Session, error) {
	return m.listSessionHistoryFn(ctx, userID, role, filters)
}

// mockSessionStudentRepo implements store.SessionStudentRepository for testing.
type mockSessionStudentRepo struct {
	joinSessionFn        func(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error)
	updateCodeFn         func(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error)
	listSessionStudentFn func(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error)
	getSessionStudentFn  func(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error)
}

func (m *mockSessionStudentRepo) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return m.joinSessionFn(ctx, params)
}

func (m *mockSessionStudentRepo) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*store.SessionStudent, error) {
	return m.updateCodeFn(ctx, sessionID, userID, code)
}

func (m *mockSessionStudentRepo) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return m.listSessionStudentFn(ctx, sessionID)
}

func (m *mockSessionStudentRepo) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error) {
	return m.getSessionStudentFn(ctx, sessionID, userID)
}

// --- Shared mock publisher ---

// mockSessionPublisher records calls to SessionPublisher methods.
// Thread-safe for use with async publish goroutines.
type mockSessionPublisher struct {
	mu                          sync.Mutex
	studentJoinedCalls          []studentJoinedCall
	codeUpdatedCalls            []codeUpdatedCall
	sessionEndedCalls           []sessionEndedCall
	featuredStudentChangedCalls []featuredStudentChangedCall
	problemUpdatedCalls         []problemUpdatedCall
	err                         error      // error to return from all methods
	done                        chan struct{} // closed after each call, for async sync
}

type studentJoinedCall struct {
	sessionID, userID, displayName string
}
type codeUpdatedCall struct {
	sessionID, userID, code string
}
type sessionEndedCall struct {
	sessionID, reason string
}
type featuredStudentChangedCall struct {
	sessionID, userID, code string
}
type problemUpdatedCall struct {
	sessionID, problemID string
}

func newMockPublisher() *mockSessionPublisher {
	return &mockSessionPublisher{done: make(chan struct{}, 10)}
}

func newMockPublisherWithErr(err error) *mockSessionPublisher {
	return &mockSessionPublisher{done: make(chan struct{}, 10), err: err}
}

// waitForCalls waits for n publish calls with a timeout.
func (m *mockSessionPublisher) waitForCalls(t *testing.T, n int) {
	t.Helper()
	for range n {
		select {
		case <-m.done:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for async publish call")
		}
	}
}

func (m *mockSessionPublisher) StudentJoined(_ context.Context, sessionID, userID, displayName string) error {
	m.mu.Lock()
	m.studentJoinedCalls = append(m.studentJoinedCalls, studentJoinedCall{sessionID, userID, displayName})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}
func (m *mockSessionPublisher) CodeUpdated(_ context.Context, sessionID, userID, code string) error {
	m.mu.Lock()
	m.codeUpdatedCalls = append(m.codeUpdatedCalls, codeUpdatedCall{sessionID, userID, code})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}
func (m *mockSessionPublisher) SessionEnded(_ context.Context, sessionID, reason string) error {
	m.mu.Lock()
	m.sessionEndedCalls = append(m.sessionEndedCalls, sessionEndedCall{sessionID, reason})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}
func (m *mockSessionPublisher) FeaturedStudentChanged(_ context.Context, sessionID, userID, code string) error {
	m.mu.Lock()
	m.featuredStudentChangedCalls = append(m.featuredStudentChangedCalls, featuredStudentChangedCall{sessionID, userID, code})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}
func (m *mockSessionPublisher) ProblemUpdated(_ context.Context, sessionID, problemID string) error {
	m.mu.Lock()
	m.problemUpdatedCalls = append(m.problemUpdatedCalls, problemUpdatedCall{sessionID, problemID})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}

// --- Shared test helpers ---

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func noopPublisher() realtime.SessionPublisher {
	return realtime.NoOpSessionPublisher{}
}

func withChiParam(ctx context.Context, key, value string) context.Context {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return context.WithValue(ctx, chi.RouteCtxKey, rctx)
}

func testSession() *store.Session {
	return &store.Session{
		ID:           uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID:  "test-ns",
		SectionID:    uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		SectionName:  "Section A",
		Problem:      json.RawMessage(`{"title":"Two Sum","description":"Add two numbers"}`),
		CreatorID:    uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
		Participants: []uuid.UUID{},
		Status:       "active",
		CreatedAt:    time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		LastActivity: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func testSessionStudent() *store.SessionStudent {
	return &store.SessionStudent{
		ID:                uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		SessionID:         uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		UserID:            uuid.MustParse("33333333-3333-3333-3333-333333333333"),
		Name:              "Alice",
		Code:              "",
		ExecutionSettings: json.RawMessage(`null`),
		LastUpdate:        time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

// --- Mock token generator ---

type mockTokenGenerator struct {
	connToken string
	subToken  string
	err       error
}

func (m *mockTokenGenerator) ConnectionToken(userID string, _ time.Duration) (string, error) {
	return m.connToken, m.err
}

func (m *mockTokenGenerator) SubscriptionToken(userID, channel string, _ time.Duration) (string, error) {
	return m.subToken, m.err
}
