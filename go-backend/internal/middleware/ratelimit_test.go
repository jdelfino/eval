package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// mockLimiter implements ratelimit.Limiter for testing.
type mockLimiter struct {
	allowFn func(ctx context.Context, category string, key string) (*ratelimit.Result, error)
}

func (m *mockLimiter) Allow(ctx context.Context, category string, key string) (*ratelimit.Result, error) {
	return m.allowFn(ctx, category, key)
}

func TestForCategory_AllowsRequest(t *testing.T) {
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, cat string, key string) (*ratelimit.Result, error) {
			if cat != "execute" {
				t.Errorf("expected category 'execute', got %q", cat)
			}
			return &ratelimit.Result{
				Allowed:   true,
				Remaining: 29,
				ResetAt:   time.Now().Add(time.Minute),
			}, nil
		},
	}

	userID := uuid.New()
	handler := ForCategory(limiter, "execute", UserKey)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
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

	userID := uuid.New()
	handler := ForCategory(limiter, "execute", UserKey)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Fatal("handler should not be called when rate limited")
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify JSON body
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON body: %v", err)
	}
	if body["error"] != "rate limit exceeded" {
		t.Errorf("expected error 'rate limit exceeded', got %q", body["error"])
	}

	// Verify headers
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

	// UserKey returns "" when no user is in context
	handler := ForCategory(limiter, "execute", UserKey)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	// No auth context
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (passthrough), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestForCategory_AllowsRequestOnNilResult(t *testing.T) {
	// When both primary and fallback fail, Allow returns nil result and error.
	// Middleware should allow the request and log rather than panic.
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return nil, fmt.Errorf("both limiters failed")
		},
	}

	userID := uuid.New()
	called := false
	handler := ForCategory(limiter, "execute", UserKey)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected handler to be called when limiter returns error")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestUserKey_ReturnsUserID(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)

	key := UserKey(req)
	if key != userID.String() {
		t.Errorf("expected %q, got %q", userID.String(), key)
	}
}

func TestUserKey_ReturnsEmptyWhenNoUser(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	key := UserKey(req)
	if key != "" {
		t.Errorf("expected empty string, got %q", key)
	}
}

func TestIPKey_ReturnsRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"

	key := IPKey(req)
	if key != "192.168.1.1:12345" {
		t.Errorf("expected '192.168.1.1:12345', got %q", key)
	}
}

func TestForCategory_PassesCorrectKey(t *testing.T) {
	var capturedKey string
	limiter := &mockLimiter{
		allowFn: func(_ context.Context, _ string, key string) (*ratelimit.Result, error) {
			capturedKey = key
			return &ratelimit.Result{
				Allowed:   true,
				Remaining: 10,
				ResetAt:   time.Now().Add(time.Minute),
			}, nil
		},
	}

	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	handler := ForCategory(limiter, "execute", UserKey)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if capturedKey != userID.String() {
		t.Errorf("expected key %q, got %q", userID.String(), capturedKey)
	}
}
