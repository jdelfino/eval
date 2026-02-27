package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestTimeoutOverride_AppliesFreshDeadline verifies that TimeoutOverride replaces
// the parent context's deadline with a new one, independent of any inherited deadline.
//
// This is the key property that distinguishes TimeoutOverride from chi's built-in
// middleware.Timeout: a child context created with context.WithTimeout cannot extend
// a parent deadline (Go's context API prevents it), but TimeoutOverride uses
// context.WithoutCancel to strip the parent deadline first.
func TestTimeoutOverride_AppliesFreshDeadline(t *testing.T) {
	const (
		outerTimeout    = 1 * time.Millisecond
		overrideTimeout = 5 * time.Millisecond
		handlerSleep    = 3 * time.Millisecond
	)

	// Build a handler that sleeps 3ms, then checks if its context is still live.
	innerHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(handlerSleep)
		select {
		case <-r.Context().Done():
			w.WriteHeader(http.StatusGatewayTimeout)
		default:
			w.WriteHeader(http.StatusOK)
		}
	})

	wrapped := TimeoutOverride(overrideTimeout)(innerHandler)

	// Construct a request whose context already has a 1ms deadline (simulating the
	// global API timeout being applied upstream by the outer router group).
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	shortCtx, shortCancel := context.WithTimeout(req.Context(), outerTimeout)
	defer shortCancel()
	req = req.WithContext(shortCtx)

	// Wait for the outer timeout to fully elapse, so the parent context is cancelled.
	time.Sleep(outerTimeout * 3)

	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	// The handler slept 3ms; the override timeout is 5ms.
	// Despite the parent context being cancelled (1ms elapsed), the handler
	// should complete successfully because TimeoutOverride uses a fresh context.
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 (handler completed within 5ms override), got %d — TimeoutOverride did not replace parent deadline", rr.Code)
	}
}

// TestTimeoutOverride_RespectsItsOwnDeadline verifies that TimeoutOverride's own
// deadline is still enforced (i.e. it does not create an immortal context).
func TestTimeoutOverride_RespectsItsOwnDeadline(t *testing.T) {
	const (
		overrideTimeout = 1 * time.Millisecond
		handlerSleep    = 5 * time.Millisecond
	)

	innerHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(handlerSleep)
		select {
		case <-r.Context().Done():
			w.WriteHeader(http.StatusGatewayTimeout)
		default:
			w.WriteHeader(http.StatusOK)
		}
	})

	wrapped := TimeoutOverride(overrideTimeout)(innerHandler)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	// Handler sleeps 5ms but override timeout is 1ms — context should be cancelled.
	// The handler checks ctx.Done() and writes 504 when the deadline expires.
	if rr.Code == http.StatusOK {
		t.Errorf("expected non-200 (handler timed out), got 200 — TimeoutOverride not enforcing its own deadline")
	}
}
