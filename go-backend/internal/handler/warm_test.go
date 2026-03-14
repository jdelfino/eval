package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockActivationService implements the ActivationService interface for testing.
type mockActivationService struct {
	signalDemandFn func(ctx context.Context) error
	called         bool
}

func (m *mockActivationService) SignalDemand(ctx context.Context) error {
	m.called = true
	if m.signalDemandFn != nil {
		return m.signalDemandFn(ctx)
	}
	return nil
}

func TestWarmHandler_200WithBody(t *testing.T) {
	svc := &mockActivationService{}
	h := NewWarmHandler()
	h.SetActivation(svc)

	req := httptest.NewRequest(http.MethodPost, "/executor/warm", bytes.NewReader(nil))
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	}))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	h.Warm(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Warm() status = %d, want %d", rr.Code, http.StatusOK)
	}

	// Verify JSON body is returned (not empty) so apiPost can call response.json().
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("Warm() body is not valid JSON: %v (body: %s)", err, rr.Body.String())
	}
}

func TestWarmHandler_RequiresAuthentication(t *testing.T) {
	h := NewWarmHandler()

	req := httptest.NewRequest(http.MethodPost, "/executor/warm", bytes.NewReader(nil))
	// No auth context — unauthenticated request.

	rr := httptest.NewRecorder()
	h.Warm(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("Warm() status = %d, want %d (unauthenticated)", rr.Code, http.StatusUnauthorized)
	}
}

func TestWarmHandler_CallsSignalDemand(t *testing.T) {
	signalCalled := false
	svc := &mockActivationService{
		signalDemandFn: func(_ context.Context) error {
			signalCalled = true
			return nil
		},
	}
	h := NewWarmHandler()
	h.SetActivation(svc)

	req := httptest.NewRequest(http.MethodPost, "/executor/warm", bytes.NewReader(nil))
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleStudent,
	}))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	h.Warm(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Warm() status = %d, want %d", rr.Code, http.StatusOK)
	}
	if !signalCalled {
		t.Fatal("Warm() did not call SignalDemand")
	}
}

func TestWarmHandler_SignalDemandErrorStillReturns200(t *testing.T) {
	// Warm is best-effort; errors in SignalDemand should not fail the request.
	svc := &mockActivationService{
		signalDemandFn: func(_ context.Context) error {
			return errors.New("redis connection refused")
		},
	}
	h := NewWarmHandler()
	h.SetActivation(svc)

	req := httptest.NewRequest(http.MethodPost, "/executor/warm", bytes.NewReader(nil))
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	}))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	h.Warm(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Warm() status = %d, want %d (errors must not fail warm endpoint)", rr.Code, http.StatusOK)
	}
}

func TestWarmHandler_NoActivationWithoutSetter(t *testing.T) {
	// NewWarmHandler with no SetActivation call — must not panic, should still return 200.
	h := NewWarmHandler()

	req := httptest.NewRequest(http.MethodPost, "/executor/warm", bytes.NewReader(nil))
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          testCreatorID,
		Email:       "test@example.com",
		NamespaceID: "test-ns",
		Role:        auth.RoleInstructor,
	}))
	req = req.WithContext(store.WithRepos(req.Context(), &stubRepos{}))

	rr := httptest.NewRecorder()
	h.Warm(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Warm() status = %d, want %d (no activation should be no-op)", rr.Code, http.StatusOK)
	}
}
