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

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockTracerClient implements TracerClient for testing.
type mockTracerClient struct {
	traceFn func(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error)
}

func (m *mockTracerClient) Trace(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
	return m.traceFn(ctx, req)
}

// traceTestRepos embeds stubRepos for trace handler tests.
type traceTestRepos struct {
	stubRepos
	sess *mockSessionRepo
}

var _ store.Repos = (*traceTestRepos)(nil)

func (r *traceTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}

func setupTraceHandler(sessRepo *mockSessionRepo, tracer TracerClient) http.Handler {
	h := NewTraceHandler(tracer)
	repos := &traceTestRepos{sess: sessRepo}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/sessions/{id}/trace", h.Trace)
	return r
}

func newTraceReq(studentID uuid.UUID, code string) []byte {
	b, _ := json.Marshal(map[string]any{
		"student_id": studentID,
		"code":       code,
	})
	return b
}

func TestTrace_HappyPath(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{
				Steps: []executor.TraceStep{
					{Line: 1, Event: "line", Locals: map[string]interface{}{"x": 5}, Globals: map[string]interface{}{}, Stdout: ""},
					{Line: 2, Event: "line", Locals: map[string]interface{}{"x": 5, "y": 10}, Globals: map[string]interface{}{}, Stdout: "15"},
				},
				TotalSteps: 2,
				ExitCode:   0,
			}, nil
		},
	}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testStudentID, `x = 5; y = 10; print(x+y)`)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp executor.TraceResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(resp.Steps))
	}
}

func TestTrace_200StudentParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{
				Steps: []executor.TraceStep{
					{Line: 1, Event: "line", Locals: map[string]interface{}{"x": 1}, Globals: map[string]interface{}{}, Stdout: "1"},
				},
				TotalSteps: 1,
				ExitCode:   0,
			}, nil
		},
	}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testStudentID, "x = 1; print(x)")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTrace_401Unauthenticated(t *testing.T) {
	handler := setupTraceHandler(&mockSessionRepo{}, &mockTracerClient{})
	body := newTraceReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTrace_404SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	tracer := &mockTracerClient{}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTrace_403NotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	tracer := &mockTracerClient{}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// outsider instructor
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTrace_400StudentNotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	tracer := &mockTracerClient{}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testOutsiderID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTrace_500TracerError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, _ executor.TraceRequest) (*executor.TraceResponse, error) {
			return nil, fmt.Errorf("executor: connection refused")
		},
	}

	handler := setupTraceHandler(sessRepo, tracer)
	body := newTraceReq(testStudentID, "code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/trace", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
