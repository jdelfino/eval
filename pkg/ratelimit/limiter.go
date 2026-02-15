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

// Category defines a rate limit configuration.
type Category struct {
	Name      string
	Algorithm string // "sliding" or "fixed"
	Limit     int
	Window    time.Duration
}
