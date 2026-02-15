package httpbind_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/httpbind"
)

func TestParseUUIDParam_Valid(t *testing.T) {
	expected := uuid.New()

	r := chi.NewRouter()
	var gotID uuid.UUID
	var gotOK bool
	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		gotID, gotOK = httpbind.ParseUUIDParam(w, r, "id")
	})

	req := httptest.NewRequest(http.MethodGet, "/"+expected.String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if !gotOK {
		t.Fatal("expected ok=true for valid UUID")
	}
	if gotID != expected {
		t.Fatalf("expected %s, got %s", expected, gotID)
	}
}

func TestParseUUIDParam_Invalid(t *testing.T) {
	r := chi.NewRouter()
	var gotOK bool
	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		_, gotOK = httpbind.ParseUUIDParam(w, r, "id")
	})

	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if gotOK {
		t.Fatal("expected ok=false for invalid UUID")
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if body["error"] != "invalid id" {
		t.Fatalf("expected error message 'invalid id', got %q", body["error"])
	}
}

func TestParseUUIDParam_Empty(t *testing.T) {
	// Simulate empty param (no chi context)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()

	_, ok := httpbind.ParseUUIDParam(w, req, "id")
	if ok {
		t.Fatal("expected ok=false for empty param")
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
