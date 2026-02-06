package realtime

import (
	"context"
	"log/slog"
	"time"
)

// asyncPublishTimeout is the maximum time allowed for an async publish operation.
const asyncPublishTimeout = 5 * time.Second

// AsyncSessionPublisher wraps a SessionPublisher and dispatches every call
// in a fire-and-forget goroutine. The parent context is detached (via
// context.WithoutCancel) so that HTTP request cancellation does not abort the
// publish, and a 5-second timeout is applied. Errors from the underlying
// publisher are logged but never returned to the caller.
type AsyncSessionPublisher struct {
	inner  SessionPublisher
	logger *slog.Logger
}

// Compile-time interface check.
var _ SessionPublisher = (*AsyncSessionPublisher)(nil)

// NewAsyncSessionPublisher creates an AsyncSessionPublisher that wraps inner.
func NewAsyncSessionPublisher(inner SessionPublisher, logger *slog.Logger) *AsyncSessionPublisher {
	return &AsyncSessionPublisher{inner: inner, logger: logger}
}

// runAsync spawns a goroutine with a detached context and deadline.
func (a *AsyncSessionPublisher) runAsync(ctx context.Context, method string, fn func(ctx context.Context) error) {
	detached := context.WithoutCancel(ctx)
	go func() {
		ctx, cancel := context.WithTimeout(detached, asyncPublishTimeout)
		defer cancel()
		if err := fn(ctx); err != nil {
			a.logger.Error("failed to publish realtime event", "error", err, "method", method)
		}
	}()
}

func (a *AsyncSessionPublisher) StudentJoined(ctx context.Context, sessionID, userID, displayName string) error {
	a.runAsync(ctx, "StudentJoined", func(ctx context.Context) error {
		return a.inner.StudentJoined(ctx, sessionID, userID, displayName)
	})
	return nil
}

func (a *AsyncSessionPublisher) CodeUpdated(ctx context.Context, sessionID, userID, code string) error {
	a.runAsync(ctx, "CodeUpdated", func(ctx context.Context) error {
		return a.inner.CodeUpdated(ctx, sessionID, userID, code)
	})
	return nil
}

func (a *AsyncSessionPublisher) SessionEnded(ctx context.Context, sessionID, reason string) error {
	a.runAsync(ctx, "SessionEnded", func(ctx context.Context) error {
		return a.inner.SessionEnded(ctx, sessionID, reason)
	})
	return nil
}

func (a *AsyncSessionPublisher) FeaturedStudentChanged(ctx context.Context, sessionID, userID, code string) error {
	a.runAsync(ctx, "FeaturedStudentChanged", func(ctx context.Context) error {
		return a.inner.FeaturedStudentChanged(ctx, sessionID, userID, code)
	})
	return nil
}

func (a *AsyncSessionPublisher) ProblemUpdated(ctx context.Context, sessionID, problemID string) error {
	a.runAsync(ctx, "ProblemUpdated", func(ctx context.Context) error {
		return a.inner.ProblemUpdated(ctx, sessionID, problemID)
	})
	return nil
}
