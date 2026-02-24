package handler

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/realtime"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// --- Shared mock repositories ---

// mockSessionRepo implements store.SessionRepository for testing.
type mockSessionRepo struct {
	listSessionsFn                    func(ctx context.Context, filters store.SessionFilters) ([]store.Session, error)
	getSessionFn                      func(ctx context.Context, id uuid.UUID) (*store.Session, error)
	createSessionFn                   func(ctx context.Context, params store.CreateSessionParams) (*store.Session, error)
	endActiveSessionsFn               func(ctx context.Context, sectionID uuid.UUID) ([]uuid.UUID, error)
	updateSessionFn                   func(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error)
	listSessionHistoryFn              func(ctx context.Context, userID uuid.UUID, isCreator bool, filters store.SessionHistoryFilters) ([]store.Session, error)
	updateSessionProblemFn            func(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*store.Session, error)
	findCompletedSessionByProblemFn   func(ctx context.Context, sectionID, problemID uuid.UUID) (*store.Session, error)
	createSessionReplacingActiveFn    func(ctx context.Context, params store.CreateSessionParams) (*store.Session, []uuid.UUID, error)
	reopenSessionReplacingActiveFn    func(ctx context.Context, id uuid.UUID, sectionID uuid.UUID) (*store.Session, []uuid.UUID, error)
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

func (m *mockSessionRepo) EndActiveSessions(ctx context.Context, sectionID uuid.UUID) ([]uuid.UUID, error) {
	if m.endActiveSessionsFn != nil {
		return m.endActiveSessionsFn(ctx, sectionID)
	}
	return nil, nil
}

func (m *mockSessionRepo) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return m.updateSessionFn(ctx, id, params)
}

func (m *mockSessionRepo) ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters store.SessionHistoryFilters) ([]store.Session, error) {
	return m.listSessionHistoryFn(ctx, userID, isCreator, filters)
}

func (m *mockSessionRepo) UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*store.Session, error) {
	return m.updateSessionProblemFn(ctx, id, problem)
}

func (m *mockSessionRepo) FindCompletedSessionByProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*store.Session, error) {
	return m.findCompletedSessionByProblemFn(ctx, sectionID, problemID)
}

func (m *mockSessionRepo) CreateSessionReplacingActive(ctx context.Context, params store.CreateSessionParams) (*store.Session, []uuid.UUID, error) {
	if m.createSessionReplacingActiveFn != nil {
		return m.createSessionReplacingActiveFn(ctx, params)
	}
	panic("mockSessionRepo: unexpected CreateSessionReplacingActive call")
}

func (m *mockSessionRepo) ReopenSessionReplacingActive(ctx context.Context, id uuid.UUID, sectionID uuid.UUID) (*store.Session, []uuid.UUID, error) {
	if m.reopenSessionReplacingActiveFn != nil {
		return m.reopenSessionReplacingActiveFn(ctx, id, sectionID)
	}
	panic("mockSessionRepo: unexpected ReopenSessionReplacingActive call")
}

// mockSessionStudentRepo implements store.SessionStudentRepository for testing.
type mockSessionStudentRepo struct {
	joinSessionFn        func(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error)
	updateCodeFn         func(ctx context.Context, sessionID, userID uuid.UUID, code string, executionSettings json.RawMessage) (*store.SessionStudent, error)
	listSessionStudentFn func(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error)
	getSessionStudentFn  func(ctx context.Context, sessionID, userID uuid.UUID) (*store.SessionStudent, error)
}

func (m *mockSessionStudentRepo) JoinSession(ctx context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
	return m.joinSessionFn(ctx, params)
}

func (m *mockSessionStudentRepo) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string, executionSettings json.RawMessage) (*store.SessionStudent, error) {
	return m.updateCodeFn(ctx, sessionID, userID, code, executionSettings)
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
	sessionReplacedCalls        []sessionReplacedCall
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
type sessionReplacedCall struct {
	oldSessionID, newSessionID string
}
type featuredStudentChangedCall struct {
	sessionID, userID, code string
	executionSettings       json.RawMessage
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
func (m *mockSessionPublisher) SessionReplaced(_ context.Context, oldSessionID, newSessionID string) error {
	m.mu.Lock()
	m.sessionReplacedCalls = append(m.sessionReplacedCalls, sessionReplacedCall{oldSessionID, newSessionID})
	m.mu.Unlock()
	m.done <- struct{}{}
	return m.err
}
func (m *mockSessionPublisher) FeaturedStudentChanged(_ context.Context, sessionID, userID, code string, executionSettings json.RawMessage) error {
	m.mu.Lock()
	m.featuredStudentChangedCalls = append(m.featuredStudentChangedCalls, featuredStudentChangedCall{sessionID, userID, code, executionSettings})
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

// --- stubRepos satisfies store.Repos; all methods panic if called unexpectedly ---

// stubRepos is a zero-value struct that implements every method in store.Repos
// by panicking. Tests embed it in a composite mock and override only the
// interfaces they exercise.
type stubRepos struct{}

func (stubRepos) ListUsers(context.Context, store.UserFilters) ([]store.User, error) {
	panic("stubRepos: unexpected ListUsers call")
}
func (stubRepos) GetUserByID(context.Context, uuid.UUID) (*store.User, error) {
	panic("stubRepos: unexpected GetUserByID call")
}
func (stubRepos) GetUserByExternalID(context.Context, string) (*store.User, error) {
	panic("stubRepos: unexpected GetUserByExternalID call")
}
func (stubRepos) GetUserByEmail(context.Context, string) (*store.User, error) {
	panic("stubRepos: unexpected GetUserByEmail call")
}
func (stubRepos) UpdateUser(context.Context, uuid.UUID, store.UpdateUserParams) (*store.User, error) {
	panic("stubRepos: unexpected UpdateUser call")
}
func (stubRepos) UpdateUserAdmin(context.Context, uuid.UUID, store.UpdateUserAdminParams) (*store.User, error) {
	panic("stubRepos: unexpected UpdateUserAdmin call")
}
func (stubRepos) DeleteUser(context.Context, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteUser call")
}
func (stubRepos) CountUsersByRole(context.Context, string) (map[string]int, error) {
	panic("stubRepos: unexpected CountUsersByRole call")
}
func (stubRepos) CreateUser(context.Context, store.CreateUserParams) (*store.User, error) {
	panic("stubRepos: unexpected CreateUser call")
}
func (stubRepos) ListClasses(context.Context) ([]store.Class, error) {
	panic("stubRepos: unexpected ListClasses call")
}
func (stubRepos) ListMyClasses(context.Context, uuid.UUID) ([]store.Class, error) {
	panic("stubRepos: unexpected ListMyClasses call")
}
func (stubRepos) GetClass(context.Context, uuid.UUID) (*store.Class, error) {
	panic("stubRepos: unexpected GetClass call")
}
func (stubRepos) CreateClass(context.Context, store.CreateClassParams) (*store.Class, error) {
	panic("stubRepos: unexpected CreateClass call")
}
func (stubRepos) UpdateClass(context.Context, uuid.UUID, store.UpdateClassParams) (*store.Class, error) {
	panic("stubRepos: unexpected UpdateClass call")
}
func (stubRepos) DeleteClass(context.Context, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteClass call")
}
func (stubRepos) ListClassInstructorNames(context.Context, uuid.UUID) (map[string]string, error) {
	panic("stubRepos: unexpected ListClassInstructorNames call")
}
func (stubRepos) ListClassSectionInstructors(context.Context, uuid.UUID) (map[string][]string, error) {
	panic("stubRepos: unexpected ListClassSectionInstructors call")
}
func (stubRepos) ListSectionsByClass(context.Context, uuid.UUID) ([]store.Section, error) {
	panic("stubRepos: unexpected ListSectionsByClass call")
}
func (stubRepos) ListMySections(context.Context, uuid.UUID) ([]store.MySectionInfo, error) {
	panic("stubRepos: unexpected ListMySections call")
}
func (stubRepos) UpdateSectionJoinCode(context.Context, uuid.UUID, string) (*store.Section, error) {
	panic("stubRepos: unexpected UpdateSectionJoinCode call")
}
func (stubRepos) GetSection(context.Context, uuid.UUID) (*store.Section, error) {
	panic("stubRepos: unexpected GetSection call")
}
func (stubRepos) CreateSection(context.Context, store.CreateSectionParams) (*store.Section, error) {
	panic("stubRepos: unexpected CreateSection call")
}
func (stubRepos) UpdateSection(context.Context, uuid.UUID, store.UpdateSectionParams) (*store.Section, error) {
	panic("stubRepos: unexpected UpdateSection call")
}
func (stubRepos) DeleteSection(context.Context, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteSection call")
}
func (stubRepos) ListSessions(context.Context, store.SessionFilters) ([]store.Session, error) {
	panic("stubRepos: unexpected ListSessions call")
}
func (stubRepos) GetSession(context.Context, uuid.UUID) (*store.Session, error) {
	panic("stubRepos: unexpected GetSession call")
}
func (stubRepos) CreateSession(context.Context, store.CreateSessionParams) (*store.Session, error) {
	panic("stubRepos: unexpected CreateSession call")
}
func (stubRepos) EndActiveSessions(context.Context, uuid.UUID) ([]uuid.UUID, error) {
	panic("stubRepos: unexpected EndActiveSessions call")
}
func (stubRepos) UpdateSession(context.Context, uuid.UUID, store.UpdateSessionParams) (*store.Session, error) {
	panic("stubRepos: unexpected UpdateSession call")
}
func (stubRepos) ListSessionHistory(context.Context, uuid.UUID, bool, store.SessionHistoryFilters) ([]store.Session, error) {
	panic("stubRepos: unexpected ListSessionHistory call")
}
func (stubRepos) UpdateSessionProblem(context.Context, uuid.UUID, json.RawMessage) (*store.Session, error) {
	panic("stubRepos: unexpected UpdateSessionProblem call")
}
func (stubRepos) FindCompletedSessionByProblem(context.Context, uuid.UUID, uuid.UUID) (*store.Session, error) {
	panic("stubRepos: unexpected FindCompletedSessionByProblem call")
}
func (stubRepos) CreateSessionReplacingActive(context.Context, store.CreateSessionParams) (*store.Session, []uuid.UUID, error) {
	panic("stubRepos: unexpected CreateSessionReplacingActive call")
}
func (stubRepos) ReopenSessionReplacingActive(context.Context, uuid.UUID, uuid.UUID) (*store.Session, []uuid.UUID, error) {
	panic("stubRepos: unexpected ReopenSessionReplacingActive call")
}
func (stubRepos) JoinSession(context.Context, store.JoinSessionParams) (*store.SessionStudent, error) {
	panic("stubRepos: unexpected JoinSession call")
}
// UpdateCode was removed from the interface
func (stubRepos) ListSessionStudents(context.Context, uuid.UUID) ([]store.SessionStudent, error) {
	panic("stubRepos: unexpected ListSessionStudents call")
}
func (stubRepos) GetSessionStudent(context.Context, uuid.UUID, uuid.UUID) (*store.SessionStudent, error) {
	panic("stubRepos: unexpected GetSessionStudent call")
}
func (stubRepos) ListRevisions(context.Context, uuid.UUID, *uuid.UUID) ([]store.Revision, error) {
	panic("stubRepos: unexpected ListRevisions call")
}
func (stubRepos) CreateRevision(context.Context, store.CreateRevisionParams) (*store.Revision, error) {
	panic("stubRepos: unexpected CreateRevision call")
}
func (stubRepos) GetSectionByJoinCode(context.Context, string) (*store.Section, error) {
	panic("stubRepos: unexpected GetSectionByJoinCode call")
}
func (stubRepos) CreateMembership(context.Context, store.CreateMembershipParams) (*store.SectionMembership, error) {
	panic("stubRepos: unexpected CreateMembership call")
}
func (stubRepos) DeleteMembership(context.Context, uuid.UUID, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteMembership call")
}
func (stubRepos) ListMembers(context.Context, uuid.UUID) ([]store.SectionMembership, error) {
	panic("stubRepos: unexpected ListMembers call")
}
func (stubRepos) ListMembersByRole(context.Context, uuid.UUID, string) ([]store.SectionMembership, error) {
	panic("stubRepos: unexpected ListMembersByRole call")
}
func (stubRepos) DeleteMembershipIfNotLast(context.Context, uuid.UUID, uuid.UUID, string) error {
	panic("stubRepos: unexpected DeleteMembershipIfNotLast call")
}
func (stubRepos) ListNamespaces(context.Context) ([]store.Namespace, error) {
	panic("stubRepos: unexpected ListNamespaces call")
}
func (stubRepos) GetNamespace(context.Context, string) (*store.Namespace, error) {
	panic("stubRepos: unexpected GetNamespace call")
}
func (stubRepos) CreateNamespace(context.Context, store.CreateNamespaceParams) (*store.Namespace, error) {
	panic("stubRepos: unexpected CreateNamespace call")
}
func (stubRepos) UpdateNamespace(context.Context, string, store.UpdateNamespaceParams) (*store.Namespace, error) {
	panic("stubRepos: unexpected UpdateNamespace call")
}
func (stubRepos) ListProblems(context.Context, *uuid.UUID) ([]store.Problem, error) {
	panic("stubRepos: unexpected ListProblems call")
}
func (stubRepos) ListProblemsFiltered(context.Context, store.ProblemFilters) ([]store.Problem, error) {
	panic("stubRepos: unexpected ListProblemsFiltered call")
}
func (stubRepos) GetProblem(context.Context, uuid.UUID) (*store.Problem, error) {
	panic("stubRepos: unexpected GetProblem call")
}
func (stubRepos) CreateProblem(context.Context, store.CreateProblemParams) (*store.Problem, error) {
	panic("stubRepos: unexpected CreateProblem call")
}
func (stubRepos) UpdateProblem(context.Context, uuid.UUID, store.UpdateProblemParams) (*store.Problem, error) {
	panic("stubRepos: unexpected UpdateProblem call")
}
func (stubRepos) DeleteProblem(context.Context, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteProblem call")
}
func (stubRepos) AdminStats(context.Context) (*store.AdminStats, error) {
	panic("stubRepos: unexpected AdminStats call")
}
func (stubRepos) ClearData(context.Context, uuid.UUID) error {
	panic("stubRepos: unexpected ClearData call")
}
func (stubRepos) ListAuditLogs(context.Context, store.AuditLogFilters) ([]store.AuditLog, error) {
	panic("stubRepos: unexpected ListAuditLogs call")
}
func (stubRepos) CreateAuditLog(context.Context, store.CreateAuditLogParams) (*store.AuditLog, error) {
	panic("stubRepos: unexpected CreateAuditLog call")
}
func (stubRepos) InstructorDashboard(context.Context, uuid.UUID) ([]store.DashboardClass, error) {
	panic("stubRepos: unexpected InstructorDashboard call")
}
func (stubRepos) ListInvitations(context.Context, store.InvitationFilters) ([]store.Invitation, error) {
	panic("stubRepos: unexpected ListInvitations call")
}
func (stubRepos) GetInvitation(context.Context, uuid.UUID) (*store.Invitation, error) {
	panic("stubRepos: unexpected GetInvitation call")
}
func (stubRepos) CreateInvitation(context.Context, store.CreateInvitationParams) (*store.Invitation, error) {
	panic("stubRepos: unexpected CreateInvitation call")
}
func (stubRepos) RevokeInvitation(context.Context, uuid.UUID) (*store.Invitation, error) {
	panic("stubRepos: unexpected RevokeInvitation call")
}
func (stubRepos) ConsumeInvitation(context.Context, uuid.UUID, uuid.UUID) (*store.Invitation, error) {
	panic("stubRepos: unexpected ConsumeInvitation call")
}
func (stubRepos) ListSectionProblems(context.Context, uuid.UUID, uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
	panic("stubRepos: unexpected ListSectionProblems call")
}
func (stubRepos) CreateSectionProblem(context.Context, store.CreateSectionProblemParams) (*store.SectionProblem, error) {
	panic("stubRepos: unexpected CreateSectionProblem call")
}
func (stubRepos) UpdateSectionProblem(context.Context, uuid.UUID, uuid.UUID, store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
	panic("stubRepos: unexpected UpdateSectionProblem call")
}
func (stubRepos) DeleteSectionProblem(context.Context, uuid.UUID, uuid.UUID) error {
	panic("stubRepos: unexpected DeleteSectionProblem call")
}
func (stubRepos) ListSectionsForProblem(context.Context, uuid.UUID) ([]store.SectionProblem, error) {
	panic("stubRepos: unexpected ListSectionsForProblem call")
}
func (stubRepos) GetOrCreateStudentWork(context.Context, string, uuid.UUID, uuid.UUID, uuid.UUID) (*store.StudentWork, error) {
	panic("stubRepos: unexpected GetOrCreateStudentWork call")
}
func (stubRepos) UpdateStudentWork(context.Context, uuid.UUID, store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	panic("stubRepos: unexpected UpdateStudentWork call")
}
func (stubRepos) GetStudentWork(context.Context, uuid.UUID) (*store.StudentWorkWithProblem, error) {
	panic("stubRepos: unexpected GetStudentWork call")
}
func (stubRepos) GetStudentWorkByProblem(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (*store.StudentWork, error) {
	panic("stubRepos: unexpected GetStudentWorkByProblem call")
}
func (stubRepos) ListStudentWorkBySession(context.Context, uuid.UUID) ([]store.StudentWork, error) {
	panic("stubRepos: unexpected ListStudentWorkBySession call")
}

// Compile-time check that stubRepos implements store.Repos.
var _ store.Repos = stubRepos{}

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
