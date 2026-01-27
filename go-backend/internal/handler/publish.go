package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
)

// publishAsync spawns a goroutine to run fn with a detached context.
// Errors are logged but do not affect the HTTP response.
func publishAsync(r *http.Request, logger *slog.Logger, sessionID uuid.UUID, fn func(ctx context.Context) error) {
	ctx := context.WithoutCancel(r.Context())
	go func() {
		if err := fn(ctx); err != nil {
			logger.Error("failed to publish realtime event", "error", err, "session_id", sessionID)
		}
	}()
}
