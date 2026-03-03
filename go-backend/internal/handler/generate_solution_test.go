package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// setupGenerateSolutionHandlerWithRBAC creates a chi router that mirrors the production
// wiring: GenerateSolutionHandler behind RequirePermission(PermContentManage).
func setupGenerateSolutionHandlerWithRBAC(aiClient ai.Client) http.Handler {
	h := NewGenerateSolutionHandler(aiClient)
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequirePermission(auth.PermContentManage))
		r.Post("/problems/generate-solution", h.GenerateSolution)
	})
	return r
}

func TestGenerateSolution_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	aiClient := &mockAIClient{}
	router := setupGenerateSolutionHandlerWithRBAC(aiClient)

	body, _ := json.Marshal(map[string]any{
		"description": "Write a function that adds two numbers",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST generate-solution, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestGenerateSolution_NewHandler_Success verifies the extracted GenerateSolutionHandler works end-to-end.
func TestGenerateSolution_NewHandler_Success(t *testing.T) {
	aiClient := &mockAIClient{
		generateSolutionFn: func(_ context.Context, req ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error) {
			return &ai.GenerateSolutionResponse{Solution: "def add(a, b):\n    return a + b"}, nil
		},
	}

	h := NewGenerateSolutionHandler(aiClient)
	body, _ := json.Marshal(map[string]any{
		"description":  "Write a function that adds two numbers",
		"starter_code": "def add(a, b):\n    pass",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GenerateSolution(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp generateSolutionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Solution != "def add(a, b):\n    return a + b" {
		t.Errorf("expected solution %q, got %q", "def add(a, b):\n    return a + b", resp.Solution)
	}
}
