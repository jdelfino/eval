package ratelimit

import (
	"context"
	"log/slog"
)

// FallbackLimiter tries the primary limiter (typically Redis) and falls back
// to the secondary limiter (typically in-memory) if the primary returns an error.
type FallbackLimiter struct {
	primary  Limiter
	fallback Limiter
	logger   *slog.Logger
}

// NewFallbackLimiter creates a new FallbackLimiter that delegates to primary
// and falls back to fallback on error.
func NewFallbackLimiter(primary, fallback Limiter, logger *slog.Logger) *FallbackLimiter {
	return &FallbackLimiter{
		primary:  primary,
		fallback: fallback,
		logger:   logger,
	}
}

// Allow checks the rate limit using the primary limiter. If the primary fails,
// it logs a warning and delegates to the fallback limiter.
func (f *FallbackLimiter) Allow(ctx context.Context, category string, key string) (*Result, error) {
	result, err := f.primary.Allow(ctx, category, key)
	if err != nil {
		f.logger.Warn("redis rate limit failed, using in-memory fallback",
			"error", err,
			"category", category,
			"key", key,
		)
		return f.fallback.Allow(ctx, category, key)
	}
	return result, nil
}
