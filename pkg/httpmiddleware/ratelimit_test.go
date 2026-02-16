package httpmiddleware

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/jdelfino/eval/pkg/ratelimit"
)

type mockLimiter struct {
	allowFn func(ctx context.Context, category string, key string) (*ratelimit.Result, error)
}

func (m *mockLimiter) Allow(ctx context.Context, category string, key string) (*ratelimit.Result, error) {
	return m.allowFn(ctx, category, key)
}

var testLogger = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestForCategory_AllowsRequest(t *testing.T) {
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, cat string, key string) (*ratelimit.Result, error) {
			if cat != "execute" {
				t.Errorf("expected category 'execute', got %q", cat)
			}
			if key != "global" {
				t.Errorf("expected key 'global', got %q", key)
			}
			return &ratelimit.Result{
				Allowed:   true,
				Remaining: 29,
				ResetAt:   time.Now().Add(time.Minute),
			}, nil
		},
	}

	handler := ForCategory(limiter, "execute", GlobalKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	remaining := rec.Header().Get("X-RateLimit-Remaining")
	if remaining != "29" {
		t.Errorf("expected X-RateLimit-Remaining=29, got %q", remaining)
	}
}

func TestForCategory_Returns429WhenDenied(t *testing.T) {
	resetAt := time.Now().Add(30 * time.Second)
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return &ratelimit.Result{
				Allowed:   false,
				Remaining: 0,
				ResetAt:   resetAt,
			}, nil
		},
	}

	handler := ForCategory(limiter, "execute", GlobalKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Fatal("handler should not be called when rate limited")
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON body: %v", err)
	}
	if body["error"] != "rate limit exceeded" {
		t.Errorf("expected error 'rate limit exceeded', got %q", body["error"])
	}

	remaining := rec.Header().Get("X-RateLimit-Remaining")
	if remaining != "0" {
		t.Errorf("expected X-RateLimit-Remaining=0, got %q", remaining)
	}

	retryAfter := rec.Header().Get("Retry-After")
	if retryAfter == "" {
		t.Fatal("expected Retry-After header to be set")
	}
	retrySeconds, err := strconv.Atoi(retryAfter)
	if err != nil {
		t.Fatalf("Retry-After is not an integer: %q", retryAfter)
	}
	if retrySeconds < 1 || retrySeconds > 31 {
		t.Errorf("expected Retry-After between 1 and 31, got %d", retrySeconds)
	}
}

func TestForCategory_SkipsWhenKeyFuncReturnsEmpty(t *testing.T) {
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			t.Fatal("limiter should not be called when key is empty")
			return nil, nil
		},
	}

	emptyKey := func(_ *http.Request) string { return "" }
	handler := ForCategory(limiter, "execute", emptyKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (passthrough), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestForCategory_AllowsOnError(t *testing.T) {
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return nil, fmt.Errorf("both limiters failed")
		},
	}

	called := false
	handler := ForCategory(limiter, "execute", GlobalKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected handler to be called when limiter returns error")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestForCategory_AllowsOnNilResult(t *testing.T) {
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return nil, nil
		},
	}

	called := false
	handler := ForCategory(limiter, "execute", GlobalKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected handler to be called when limiter returns nil result")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGlobalKey_ReturnsConstant(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	if key := GlobalKey(req); key != "global" {
		t.Errorf("expected 'global', got %q", key)
	}
}

func TestIPKey_ReturnsRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	if key := IPKey(req); key != "192.168.1.1:12345" {
		t.Errorf("expected '192.168.1.1:12345', got %q", key)
	}
}

func TestForCategory_PassesCorrectCategoryAndKey(t *testing.T) {
	var capturedCat, capturedKey string
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, cat string, key string) (*ratelimit.Result, error) {
			capturedCat = cat
			capturedKey = key
			return &ratelimit.Result{Allowed: true, Remaining: 10, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}

	customKey := func(_ *http.Request) string { return "user-123" }
	handler := ForCategory(limiter, "write", customKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if capturedCat != "write" {
		t.Errorf("expected category 'write', got %q", capturedCat)
	}
	if capturedKey != "user-123" {
		t.Errorf("expected key 'user-123', got %q", capturedKey)
	}
}

func TestForCategory_RetryAfterMinimumIsOne(t *testing.T) {
	// When ResetAt is in the past, Retry-After should still be at least 1.
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return &ratelimit.Result{
				Allowed:   false,
				Remaining: 0,
				ResetAt:   time.Now().Add(-5 * time.Second),
			}, nil
		},
	}

	handler := ForCategory(limiter, "execute", GlobalKey, testLogger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Fatal("handler should not be called")
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	retryAfter := rec.Header().Get("Retry-After")
	seconds, _ := strconv.Atoi(retryAfter)
	if seconds != 1 {
		t.Errorf("expected Retry-After=1 for past ResetAt, got %d", seconds)
	}
}
