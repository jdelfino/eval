package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
)

// TestAnalyzeRouteTimeoutOverridesGlobal verifies that the analyze route group
// applies a timeout longer than the global API timeout using TimeoutOverride.
//
// The analyze endpoint can take 30-120s for large classes. The global 30s timeout
// is applied at the /api/v1 router level. A plain nested middleware.Timeout(120s)
// would NOT work because context.WithTimeout cannot extend a parent deadline —
// it can only shorten it. TimeoutOverride uses context.WithoutCancel first to
// strip the parent deadline before applying the new one.
//
// This test uses small synthetic timeouts (10ms global, 100ms analyze-route override)
// to verify the middleware composition without making the test suite slow.
// A handler that sleeps for 50ms should:
//   - timeout on a regular route (only 10ms allowed)
//   - succeed on the analyze route (100ms override replaces the 10ms deadline)
//
// The timing margins are intentionally generous (10x ratio) to avoid flakiness
// under CPU contention (e.g. parallel pre-push hooks running multiple test suites).
func TestAnalyzeRouteTimeoutOverridesGlobal(t *testing.T) {
	const (
		globalTimeout  = 10 * time.Millisecond
		analyzeTimeout = 100 * time.Millisecond
		handlerSleep   = 50 * time.Millisecond
	)

	// Build a router that mirrors the production structure:
	//   /api/v1 group with global timeout
	//     /other  — no override; subject to global 10ms timeout
	//     /analyze group with TimeoutOverride(100ms) — replaces the 10ms deadline
	r := chi.NewRouter()
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Timeout(globalTimeout))

		// Regular route — no timeout override; will be killed by global timeout.
		r.Get("/other", func(w http.ResponseWriter, req *http.Request) {
			time.Sleep(handlerSleep)
			select {
			case <-req.Context().Done():
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			default:
				w.WriteHeader(http.StatusOK)
			}
		})

		// Analyze group — uses TimeoutOverride to replace (not extend) the parent deadline.
		r.Group(func(r chi.Router) {
			r.Use(custommw.TimeoutOverride(analyzeTimeout))
			r.Get("/sessions/{id}/analyze", func(w http.ResponseWriter, req *http.Request) {
				time.Sleep(handlerSleep)
				select {
				case <-req.Context().Done():
					w.WriteHeader(http.StatusServiceUnavailable)
					return
				default:
					w.WriteHeader(http.StatusOK)
				}
			})
		})
	})

	t.Run("regular route times out under global timeout", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/other", nil)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		// The handler sleeps 50ms but the global timeout is 10ms.
		// The timeout middleware cancels the context; the handler sees ctx.Done()
		// and returns 503, or the middleware writes 504.
		// Either way, the response must NOT be 200.
		if rr.Code == http.StatusOK {
			t.Errorf("regular route: expected timeout (non-200), got 200 — global timeout not enforced")
		}
	})

	t.Run("analyze route succeeds under TimeoutOverride", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/abc/analyze", nil)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		// The handler sleeps 50ms; the analyze-route override is 100ms.
		// TimeoutOverride replaces the 10ms deadline with a fresh 100ms deadline,
		// so the handler completes before timing out → must return 200.
		if rr.Code != http.StatusOK {
			t.Errorf("analyze route: expected 200 (handler finishes within 100ms override), got %d — TimeoutOverride not working", rr.Code)
		}
	})
}
