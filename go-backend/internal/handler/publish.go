package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// publishAsyncTimeout is the maximum time allowed for an async publish operation.
const publishAsyncTimeout = 5 * time.Second

// publishAsync spawns a goroutine to run fn with a detached context and deadline.
// Errors are logged but do not affect the HTTP response.
func publishAsync(r *http.Request, logger *slog.Logger, sessionID uuid.UUID, fn func(ctx context.Context) error) {
	ctx := context.WithoutCancel(r.Context())
	go func() {
		ctx, cancel := context.WithTimeout(ctx, publishAsyncTimeout)
		defer cancel()
		if err := fn(ctx); err != nil {
			logger.Error("failed to publish realtime event", "error", err, "session_id", sessionID)
		}
	}()
}
