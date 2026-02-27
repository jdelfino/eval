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
// This test uses small synthetic timeouts (1ms global, 5ms analyze-route override)
// to verify the middleware composition without making the test suite slow.
// A handler that sleeps for 3ms should:
//   - timeout on a regular route (only 1ms allowed)
//   - succeed on the analyze route (5ms override replaces the 1ms deadline)
func TestAnalyzeRouteTimeoutOverridesGlobal(t *testing.T) {
	const (
		globalTimeout   = 1 * time.Millisecond
		analyzeTimeout  = 5 * time.Millisecond
		handlerSleep    = 3 * time.Millisecond
	)

	// Build a router that mirrors the production structure:
	//   /api/v1 group with global timeout
	//     /other  — no override; subject to global 1ms timeout
	//     /analyze group with TimeoutOverride(5ms) — replaces the 1ms deadline
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
		// The handler sleeps 3ms but the global timeout is 1ms.
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
		// The handler sleeps 3ms; the analyze-route override is 5ms.
		// TimeoutOverride replaces the 1ms deadline with a fresh 5ms deadline,
		// so the handler completes before timing out → must return 200.
		if rr.Code != http.StatusOK {
			t.Errorf("analyze route: expected 200 (handler finishes within 5ms override), got %d — TimeoutOverride not working", rr.Code)
		}
	})
}
