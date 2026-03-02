package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// capturingSlogHandler is a slog.Handler that records all log records for assertions.
type capturingSlogHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *capturingSlogHandler) Enabled(_ context.Context, _ slog.Level) bool { return true }

func (h *capturingSlogHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, r)
	return nil
}

func (h *capturingSlogHandler) WithAttrs(attrs []slog.Attr) slog.Handler { return h }
func (h *capturingSlogHandler) WithGroup(name string) slog.Handler       { return h }

// containsErrorAttr returns true if any recorded log entry has an "error" attribute
// containing the given substring.
func (h *capturingSlogHandler) containsErrorAttr(substr string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range h.records {
		found := false
		r.Attrs(func(a slog.Attr) bool {
			if a.Key == "error" && strings.Contains(a.Value.String(), substr) {
				found = true
				return false
			}
			return true
		})
		if found {
			return true
		}
	}
	return false
}

// mockAIClient implements ai.Client for testing.
type mockAIClient struct {
	analyzeFn          func(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error)
	generateSolutionFn func(ctx context.Context, req ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error)
}

func (m *mockAIClient) AnalyzeCode(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
	return m.analyzeFn(ctx, req)
}

func (m *mockAIClient) GenerateSolution(ctx context.Context, req ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error) {
	if m.generateSolutionFn != nil {
		return m.generateSolutionFn(ctx, req)
	}
	return nil, fmt.Errorf("mockAIClient.GenerateSolution not implemented")
}

// analyzeTestRepos embeds stubRepos and overrides session + session student methods for analyze tests.
type analyzeTestRepos struct {
	stubRepos
	sess         *mockSessionRepo
	sessStudents *mockSessionStudentRepo
}

var _ store.Repos = (*analyzeTestRepos)(nil)

func (r *analyzeTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}

func (r *analyzeTestRepos) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]store.SessionStudent, error) {
	return r.sessStudents.ListSessionStudents(ctx, sessionID)
}

func setupAnalyzeHandler(sessRepo *mockSessionRepo, sessStudentsRepo *mockSessionStudentRepo, aiClient ai.Client) http.Handler {
	h := NewAnalyzeHandler(aiClient)
	repos := &analyzeTestRepos{sess: sessRepo, sessStudents: sessStudentsRepo}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/sessions/{id}/analyze", h.Analyze)
	return r
}

// newSimpleAnalyzeReq builds a minimal analyze request body (only model+custom_prompt).
func newSimpleAnalyzeReq(model, customPrompt string) []byte {
	body := map[string]any{}
	if model != "" {
		body["model"] = model
	}
	if customPrompt != "" {
		body["custom_prompt"] = customPrompt
	}
	b, _ := json.Marshal(body)
	return b
}

// defaultAnalyzeReq returns an empty JSON body (all fields optional).
func defaultAnalyzeReq() []byte {
	return []byte(`{}`)
}

func stubAnalyzeResp() *ai.AnalyzeResponse {
	return &ai.AnalyzeResponse{
		Issues: []ai.AnalysisIssue{
			{
				Title:                      "Test issue",
				Explanation:                "The code correctly solves the problem.",
				Count:                      1,
				StudentIDs:                 []string{testStudentID.String()},
				RepresentativeStudentID:    testStudentID.String(),
				RepresentativeStudentLabel: "Test Student",
				Severity:                   ai.IssueSeverityStyle,
			},
		},
		OverallNote: "Overall the class did well.",
		Summary: ai.AnalysisSummary{
			TotalSubmissions:    1,
			FilteredOut:         0,
			AnalyzedSubmissions: 1,
			CompletionEstimate: ai.CompletionEstimate{
				Finished:   0,
				InProgress: 1,
				NotStarted: 0,
			},
		},
	}
}

func defaultStudents() []store.SessionStudent {
	return []store.SessionStudent{
		{
			ID:        uuid.New(),
			SessionID: testSessionID,
			UserID:    testStudentID,
			Name:      "Test Student",
			Code:      `print("hello")`,
		},
	}
}

// analyzeHTTPResponse mirrors the expected JSON response envelope.
// Defined here so tests can decode and assert the shape.
type analyzeHTTPResponseTest struct {
	Script analyzeScriptResponseTest `json:"script"`
}

type analyzeScriptResponseTest struct {
	SessionID   string             `json:"session_id"`
	Issues      []ai.AnalysisIssue `json:"issues"`
	Summary     ai.AnalysisSummary `json:"summary"`
	OverallNote string             `json:"overall_note,omitempty"`
	GeneratedAt time.Time          `json:"generated_at"`
}

// --- Happy path ---

func TestAnalyze_HappyPath(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp analyzeHTTPResponseTest
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Response must be wrapped in a script envelope
	if resp.Script.SessionID == "" {
		t.Fatal("expected non-empty session_id in script")
	}
	if resp.Script.SessionID != testSessionID.String() {
		t.Fatalf("expected session_id %s, got %s", testSessionID, resp.Script.SessionID)
	}
	if resp.Script.GeneratedAt.IsZero() {
		t.Fatal("expected non-zero generated_at in script")
	}
	if len(resp.Script.Issues) == 0 {
		t.Fatal("expected at least one issue in script")
	}
	if resp.Script.Issues[0].Title == "" {
		t.Fatal("expected non-empty issue title")
	}
}

// --- Response must NOT be the bare AnalyzeResponse ---

func TestAnalyze_ResponseShapeHasScriptWrapper(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Decode as raw map to verify the top-level "script" key exists
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("unmarshal raw: %v", err)
	}
	if _, ok := raw["script"]; !ok {
		t.Fatalf("expected top-level 'script' key in response, got keys: %v", keysOf(raw))
	}
	// Must NOT have bare top-level "issues" key (would indicate old unwrapped response)
	if _, ok := raw["issues"]; ok {
		t.Fatal("response must not have bare top-level 'issues' key; should be nested under 'script'")
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// --- Request no longer accepts submissions or problem_description fields ---

func TestAnalyze_RequestDoesNotTakeSubmissions(t *testing.T) {
	// Sending submissions in the request body should be ignored (not cause an error).
	// The handler should fetch students server-side regardless.
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	var listCalled bool
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			listCalled = true
			return defaultStudents(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	// Body includes old-style submissions — handler must ignore and fetch server-side
	body, _ := json.Marshal(map[string]any{
		"problem_description": "ignored",
		"submissions": []map[string]any{
			{"user_id": testStudentID.String(), "code": "ignored"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !listCalled {
		t.Fatal("expected handler to call ListSessionStudents server-side")
	}
}

// --- Server-side student fetch ---

func TestAnalyze_FetchesStudentsServerSide(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}

	student1ID := uuid.New()
	student2ID := uuid.New()
	serverStudents := []store.SessionStudent{
		{ID: uuid.New(), SessionID: testSessionID, UserID: student1ID, Name: "Alice", Code: "code_alice"},
		{ID: uuid.New(), SessionID: testSessionID, UserID: student2ID, Name: "Bob", Code: "code_bob"},
	}

	var capturedReq ai.AnalyzeRequest
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return serverStudents, nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			capturedReq = req
			return &ai.AnalyzeResponse{Issues: []ai.AnalysisIssue{}, Summary: ai.AnalysisSummary{}}, nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(capturedReq.Submissions) != 2 {
		t.Fatalf("expected 2 submissions (from server), got %d", len(capturedReq.Submissions))
	}
	// Verify the server-fetched student data is passed to the AI client
	if capturedReq.Submissions[0].UserID != student1ID.String() {
		t.Fatalf("expected first submission user_id %s, got %s", student1ID, capturedReq.Submissions[0].UserID)
	}
	if capturedReq.Submissions[0].Name != "Alice" {
		t.Fatalf("expected first submission name 'Alice', got %q", capturedReq.Submissions[0].Name)
	}
	if capturedReq.Submissions[0].Code != "code_alice" {
		t.Fatalf("expected first submission code 'code_alice', got %q", capturedReq.Submissions[0].Code)
	}
}

// --- Problem description extracted from session.Problem JSON ---

func TestAnalyze_ExtractsProblemDescriptionFromSession(t *testing.T) {
	sess := activeSession()
	sess.Problem = json.RawMessage(`{"title":"Two Sum","description":"Given two numbers, return their sum."}`)

	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}

	var capturedReq ai.AnalyzeRequest
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			capturedReq = req
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.ProblemDescription != "Given two numbers, return their sum." {
		t.Fatalf("expected problem_description from session JSON, got %q", capturedReq.ProblemDescription)
	}
}

// --- Model and custom_prompt forwarded to AI client ---

func TestAnalyze_ForwardsModelAndCustomPrompt(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}

	var capturedReq ai.AnalyzeRequest
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			capturedReq = req
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := newSimpleAnalyzeReq("gemini-2.0-flash", "focus on edge cases")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Model != "gemini-2.0-flash" {
		t.Fatalf("expected model 'gemini-2.0-flash', got %q", capturedReq.Model)
	}
	if capturedReq.CustomPrompt != "focus on edge cases" {
		t.Fatalf("expected custom_prompt 'focus on edge cases', got %q", capturedReq.CustomPrompt)
	}
}

// --- Empty session (0 students) ---

func TestAnalyze_EmptySession_ReturnsValidResponse(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return []store.SessionStudent{}, nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			// Should receive 0 submissions
			if len(req.Submissions) != 0 {
				return nil, fmt.Errorf("expected 0 submissions, got %d", len(req.Submissions))
			}
			return &ai.AnalyzeResponse{
				Issues:  []ai.AnalysisIssue{},
				Summary: ai.AnalysisSummary{TotalSubmissions: 0},
			}, nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for empty session, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp analyzeHTTPResponseTest
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Script.SessionID != testSessionID.String() {
		t.Fatalf("expected session_id in empty-session response, got %q", resp.Script.SessionID)
	}
}

// --- Authentication/authorization (behavior preserved from .1) ---

func TestAnalyze_403StudentForbidden(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_401Unauthenticated(t *testing.T) {
	handler := setupAnalyzeHandler(&mockSessionRepo{}, &mockSessionStudentRepo{}, &mockAIClient{})
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_404SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_403NotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_500AIError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return nil, fmt.Errorf("ai: rate limited")
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- ListSessionStudents error handling ---

func TestAnalyze_500ListStudentsError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return nil, fmt.Errorf("db: connection lost")
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when ListSessionStudents fails, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- WriteInternalError logging: underlying error must be logged for all 500 paths ---

// TestAnalyze_GetSessionError_LogsUnderlyingError verifies that when GetSession fails
// with an internal error, WriteInternalError is used (not WriteError), so the
// underlying error string appears in the structured log output.
func TestAnalyze_GetSessionError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	underlyingErr := fmt.Errorf("db: connection refused from GetSession")
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, underlyingErr
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if !h.containsErrorAttr("connection refused from GetSession") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestAnalyze_ListStudentsError_LogsUnderlyingError verifies that when ListSessionStudents
// fails, the underlying error is logged (WriteInternalError, not WriteError).
func TestAnalyze_ListStudentsError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	underlyingErr := fmt.Errorf("db: timeout from ListSessionStudents")
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return nil, underlyingErr
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if !h.containsErrorAttr("timeout from ListSessionStudents") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestAnalyze_AIClientError_LogsUnderlyingError verifies that when the AI client
// returns an error, the underlying error is logged (WriteInternalError, not WriteError).
func TestAnalyze_AIClientError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	underlyingErr := fmt.Errorf("gemini: quota exceeded from AI client")
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	sessStudentsRepo := &mockSessionStudentRepo{
		listSessionStudentFn: func(_ context.Context, _ uuid.UUID) ([]store.SessionStudent, error) {
			return defaultStudents(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return nil, underlyingErr
		},
	}

	handler := setupAnalyzeHandler(sessRepo, sessStudentsRepo, aiClient)
	body := defaultAnalyzeReq()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if !h.containsErrorAttr("quota exceeded from AI client") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}
