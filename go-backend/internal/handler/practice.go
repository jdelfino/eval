package handler

import (
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/executor"
	"github.com/jdelfino/eval/internal/httpbind"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// PracticeLimiter implements a sliding-window rate limiter keyed by user ID.
type PracticeLimiter struct {
	mu        sync.Mutex
	maxPerMin int
	windows   map[uuid.UUID][]time.Time
}

// NewPracticeLimiter creates a rate limiter allowing maxPerMin requests per
// 60-second sliding window per user.
func NewPracticeLimiter(maxPerMin int) *PracticeLimiter {
	return &PracticeLimiter{
		maxPerMin: maxPerMin,
		windows:   make(map[uuid.UUID][]time.Time),
	}
}

// Allow returns true if the user has not exceeded the rate limit.
// It records the current timestamp on success.
func (l *PracticeLimiter) Allow(userID uuid.UUID) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-time.Minute)

	// Evict expired entries
	times := l.windows[userID]
	start := 0
	for start < len(times) && times[start].Before(cutoff) {
		start++
	}
	times = times[start:]

	// Clean up empty entries to prevent unbounded map growth
	if len(times) == 0 {
		delete(l.windows, userID)
	}

	if len(times) >= l.maxPerMin {
		l.windows[userID] = times
		return false
	}

	l.windows[userID] = append(times, now)
	return true
}

// practiceRequest is the JSON body for POST /sessions/{id}/practice.
type practiceRequest struct {
	Code              string                `json:"code" validate:"required"`
	ExecutionSettings *executionSettingsJSON `json:"execution_settings"`
}

// PracticeExecute handles POST /api/v1/sessions/{id}/practice.
// It allows students to run code in completed sessions (ephemeral, no persistent state).
func (h *ExecuteHandler) PracticeExecute(w http.ResponseWriter, r *http.Request) {
	// 1. Auth check
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// 2. Parse session ID
	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	// 3. Bind JSON request
	req, err := httpbind.BindJSON[practiceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	// 4. Look up session
	repos := store.ReposFromContext(r.Context())
	session, err := repos.GetSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// 5. Session MUST be completed
	if session.Status != "completed" {
		httputil.WriteError(w, http.StatusBadRequest, "session is not completed; use /execute for active sessions")
		return
	}

	// 6. User must be creator or participant
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "you are not a participant in this session")
		return
	}

	// 7. Rate limit check
	if !h.practiceLimiter.Allow(authUser.ID) {
		httputil.WriteError(w, http.StatusTooManyRequests, "practice mode rate limit exceeded (15 requests per minute)")
		return
	}

	// 8. Build executor request — merge problem-level settings (e.g. stdin, files)
	// with request overrides. No student record in practice mode (ephemeral).
	merged := mergeExecutionSettings(session.Problem, nil, req.ExecutionSettings)
	execReq := executor.ExecuteRequest{
		Code: req.Code,
	}
	if merged.Stdin != nil {
		execReq.Stdin = *merged.Stdin
	}
	if merged.RandomSeed != nil {
		execReq.RandomSeed = merged.RandomSeed
	}
	if len(merged.Files) > 0 {
		execReq.Files = merged.Files
	}

	// 9. Call executor
	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "execution failed")
		return
	}

	// 10. Return result
	httputil.WriteJSON(w, http.StatusOK, execResp)
}
