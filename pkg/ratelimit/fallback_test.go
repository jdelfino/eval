package ratelimit

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"
)

type mockLimiter struct {
	allowFunc func(ctx context.Context, category string, key string) (*Result, error)
	count     int
}

func (m *mockLimiter) Allow(ctx context.Context, category string, key string) (*Result, error) {
	m.count++
	return m.allowFunc(ctx, category, key)
}

func TestFallbackLimiter_UsesPrimaryWhenHealthy(t *testing.T) {
	primary := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return &Result{Allowed: true, Remaining: 5, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}
	fallback := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return &Result{Allowed: true, Remaining: 10, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}

	fl := NewFallbackLimiter(primary, fallback, slog.Default())

	res, err := fl.Allow(context.Background(), "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Fatal("expected allowed")
	}
	if res.Remaining != 5 {
		t.Fatalf("expected remaining 5 (from primary), got %d", res.Remaining)
	}
	if primary.count != 1 {
		t.Fatalf("expected primary called once, got %d", primary.count)
	}
	if fallback.count != 0 {
		t.Fatalf("expected fallback not called, got %d", fallback.count)
	}
}

func TestFallbackLimiter_FallsBackOnPrimaryError(t *testing.T) {
	primary := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return nil, errors.New("redis connection refused")
		},
	}
	fallback := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return &Result{Allowed: true, Remaining: 9, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}

	fl := NewFallbackLimiter(primary, fallback, slog.Default())

	res, err := fl.Allow(context.Background(), "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Fatal("expected allowed via fallback")
	}
	if res.Remaining != 9 {
		t.Fatalf("expected remaining 9 (from fallback), got %d", res.Remaining)
	}
	if primary.count != 1 || fallback.count != 1 {
		t.Fatalf("expected primary=1 fallback=1, got primary=%d fallback=%d", primary.count, fallback.count)
	}
}

func TestFallbackLimiter_RecoversAfterError(t *testing.T) {
	callCount := 0
	primary := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			callCount++
			if callCount == 1 {
				return nil, errors.New("redis timeout")
			}
			return &Result{Allowed: true, Remaining: 4, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}
	fallback := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return &Result{Allowed: true, Remaining: 9, ResetAt: time.Now().Add(time.Minute)}, nil
		},
	}

	fl := NewFallbackLimiter(primary, fallback, slog.Default())

	// First call: primary fails, uses fallback.
	res, _ := fl.Allow(context.Background(), "test", "user1")
	if res.Remaining != 9 {
		t.Fatalf("expected remaining 9 (fallback), got %d", res.Remaining)
	}

	// Second call: primary recovers.
	res, _ = fl.Allow(context.Background(), "test", "user1")
	if res.Remaining != 4 {
		t.Fatalf("expected remaining 4 (primary recovered), got %d", res.Remaining)
	}
	if fallback.count != 1 {
		t.Fatalf("fallback should only have been called once, got %d", fallback.count)
	}
}

func TestFallbackLimiter_PropagatesFallbackError(t *testing.T) {
	primary := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return nil, errors.New("primary error")
		},
	}
	fallback := &mockLimiter{
		allowFunc: func(_ context.Context, _ string, _ string) (*Result, error) {
			return nil, errors.New("fallback error")
		},
	}

	fl := NewFallbackLimiter(primary, fallback, slog.Default())

	_, err := fl.Allow(context.Background(), "test", "user1")
	if err == nil {
		t.Fatal("expected error when both primary and fallback fail")
	}
}
