// Package ratelimit provides distributed rate limiting with Redis and in-memory fallback.
package ratelimit

import (
	"context"
	"time"
)

// Limiter checks whether a request is allowed under the configured rate limit.
type Limiter interface {
	Allow(ctx context.Context, category string, key string) (*Result, error)
}

// Result contains the outcome of a rate limit check.
type Result struct {
	Allowed   bool
	Remaining int
	ResetAt   time.Time
}

// NoopLimiter always allows requests. Used in test environments.
type NoopLimiter struct{}

func (NoopLimiter) Allow(_ context.Context, _ string, _ string) (*Result, error) {
	return &Result{Allowed: true, Remaining: 1}, nil
}

// Category defines a rate limit configuration.
type Category struct {
	Name      string
	Algorithm string // "sliding" or "fixed"
	Limit     int
	Window    time.Duration
}
