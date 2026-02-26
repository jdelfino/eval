package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockAIClient implements ai.Client for testing.
type mockAIClient struct {
	analyzeFn func(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error)
}

func (m *mockAIClient) AnalyzeCode(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
	return m.analyzeFn(ctx, req)
}

// analyzeTestRepos embeds stubRepos and overrides session methods for analyze tests.
type analyzeTestRepos struct {
	stubRepos
	sess *mockSessionRepo
}

var _ store.Repos = (*analyzeTestRepos)(nil)

func (r *analyzeTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}

func setupAnalyzeHandler(sessRepo *mockSessionRepo, aiClient ai.Client) http.Handler {
	h := NewAnalyzeHandler(aiClient)
	repos := &analyzeTestRepos{sess: sessRepo}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/sessions/{id}/analyze", h.Analyze)
	return r
}

func newAnalyzeReq(studentID uuid.UUID, code, problemDesc string) []byte {
	b, _ := json.Marshal(map[string]any{
		"problem_description": problemDesc,
		"submissions": []map[string]any{
			{
				"user_id": studentID.String(),
				"name":    "Test Student",
				"code":    code,
			},
		},
	})
	return b
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
		FinishedStudentIDs: []string{},
		OverallNote:        "Overall the class did well.",
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

func TestAnalyze_HappyPath(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, `print("hello")`, "Print hello world")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp ai.AnalyzeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Issues) == 0 {
		t.Fatal("expected at least one issue in response")
	}
	if resp.Issues[0].Title == "" {
		t.Fatal("expected non-empty issue title")
	}
}

func TestAnalyze_403StudentForbidden(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
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
	handler := setupAnalyzeHandler(&mockSessionRepo{}, &mockAIClient{})
	body := newAnalyzeReq(testStudentID, "code", "desc")
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
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
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
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
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

func TestAnalyze_400StudentNotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testOutsiderID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_500AIError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return nil, fmt.Errorf("ai: rate limited")
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
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

func TestAnalyze_PassesRequestToAIClient(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}

	var capturedReq ai.AnalyzeRequest
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			capturedReq = req
			return stubAnalyzeResp(), nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "my code", "my problem")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(capturedReq.Submissions) != 1 {
		t.Fatalf("expected 1 submission, got %d", len(capturedReq.Submissions))
	}
	if capturedReq.Submissions[0].Code != "my code" {
		t.Fatalf("expected code 'my code', got %q", capturedReq.Submissions[0].Code)
	}
	if capturedReq.ProblemDescription != "my problem" {
		t.Fatalf("expected problem_description 'my problem', got %q", capturedReq.ProblemDescription)
	}
}
