package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"syscall"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/jdelfino/eval/pkg/httputil"

	"github.com/google/uuid"
)

// ExecutorClient is the interface for sending code to the executor service.
type ExecutorClient interface {
	Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

// ExecuteHandler handles code execution requests.
type ExecuteHandler struct {
	executor   ExecutorClient
	activation ActivationService
}

// NewExecuteHandler creates a new ExecuteHandler.
func NewExecuteHandler(exec ExecutorClient) *ExecuteHandler {
	return &ExecuteHandler{
		executor: exec,
	}
}

// SetActivation attaches an ActivationService to the handler.
// Must be called before the handler serves requests.
func (h *ExecuteHandler) SetActivation(svc ActivationService) {
	h.activation = svc
}

// executeCaseDef is the frontend-facing representation of a test case in POST /execute.
// Uses attached_files (matching store.IOTestCase) rather than files (executor wire format);
// the handler translates between the two before calling the executor.
type executeCaseDef struct {
	Name           string                `json:"name"`
	Input          string                `json:"input"`
	MatchType      string                `json:"match_type"`
	ExpectedOutput string                `json:"expected_output,omitempty"`
	RandomSeed     *int                  `json:"random_seed,omitempty"`
	AttachedFiles  []executorapi.File    `json:"attached_files,omitempty"`
}

// toExecutorCaseDef converts a frontend case def to the executor wire format.
func (c executeCaseDef) toExecutorCaseDef() executorapi.CaseDef {
	return executorapi.CaseDef{
		Name:           c.Name,
		Type:           "io",
		Input:          c.Input,
		MatchType:      c.MatchType,
		ExpectedOutput: c.ExpectedOutput,
		RandomSeed:     c.RandomSeed,
		Files:          c.AttachedFiles,
	}
}

// executeRequest is the request body for POST /api/v1/execute.
// Accepts code, language, and an optional cases[] array of test case definitions.
// When cases is omitted or empty, a single free-run case is synthesized.
type executeRequest struct {
	Code     string           `json:"code" validate:"required"`
	Language string           `json:"language" validate:"required"`
	Cases    []executeCaseDef `json:"cases,omitempty"`
}

// Execute handles POST /api/v1/execute for any authenticated user.
// Accepts {code, language, cases[]} and returns {results[], summary} natively.
// No session context is required — takes code + language directly.
func (h *ExecuteHandler) Execute(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[executeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	lang, err := normalizeLanguage(req.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Translate frontend case defs (attached_files) to executor wire format (files).
	var cases []executorapi.CaseDef
	if len(req.Cases) == 0 {
		// Synthesize a free-run case when none are given.
		cases = []executorapi.CaseDef{{Name: "run", Type: "io", Input: ""}}
	} else {
		cases = make([]executorapi.CaseDef, len(req.Cases))
		for i, c := range req.Cases {
			cases[i] = c.toExecutorCaseDef()
		}
	}

	execReq := executor.ExecuteRequest{
		Code:     req.Code,
		Language: lang,
		Cases:    cases,
	}

	// Signal executor demand so KEDA can scale from zero.
	if h.activation != nil {
		ctx := context.WithoutCancel(r.Context())
		go func() {
			if err := h.activation.SignalDemand(ctx); err != nil {
				slog.Error("activation: SignalDemand failed", "handler", "execute.Execute", "error", err)
			}
		}()
	}

	execResp, err := h.executor.Execute(r.Context(), execReq)
	if err != nil {
		writeExecutorError(w, r, err, "execution failed")
		return
	}

	// Ensure Results is never serialized as JSON null.
	if execResp.Results == nil {
		execResp.Results = []executorapi.CaseResult{}
	}

	httputil.WriteJSON(w, http.StatusOK, execResp)
}

// isConnectionError reports whether err is a network-layer connection failure,
// indicating the executor service is unreachable (e.g. scaled to zero, cold-starting).
// The executor client wraps transport errors with fmt.Errorf("executor: send request: %w", err).
func isConnectionError(err error) bool {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return true
	}
	var netErr *net.OpError
	if errors.As(err, &netErr) {
		return true
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return true
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	return false
}

// writeExecutorError writes the appropriate HTTP error for an executor client error.
// If the executor is unreachable (connection-class error), it returns 503 so the
// frontend can distinguish a cold-start from a real error and retry.
// If the executor returned 429 (rate limit / concurrency), it propagates 429.
// Otherwise it writes a 500.
func writeExecutorError(w http.ResponseWriter, r *http.Request, err error, message string) {
	if isConnectionError(err) {
		httputil.WriteError(w, http.StatusServiceUnavailable, "Code execution is warming up, please try again in a few moments")
		return
	}
	var statusErr *executor.StatusError
	if errors.As(err, &statusErr) && statusErr.Code == http.StatusTooManyRequests {
		httputil.WriteError(w, http.StatusTooManyRequests, "execution service busy, try again later")
		return
	}
	httputil.WriteInternalError(w, r, err, message)
}

// isCreatorOrParticipant checks if the user is the session creator or a participant.
func isCreatorOrParticipant(userID uuid.UUID, session *store.Session) bool {
	if session.CreatorID == userID {
		return true
	}
	for _, p := range session.Participants {
		if p == userID {
			return true
		}
	}
	return false
}

// languageAliases maps accepted language strings to their canonical form.
// "python3" is accepted as a legacy alias for "python".
var languageAliases = map[string]string{
	"python":  "python",
	"python3": "python",
	"java":    "java",
}

// normalizeLanguage returns the normalized language string.
// Returns an error for empty or unsupported languages.
func normalizeLanguage(lang string) (string, error) {
	if lang == "" {
		return "", fmt.Errorf("language is required: must be one of python, java")
	}
	if canonical, ok := languageAliases[lang]; ok {
		return canonical, nil
	}
	return "", fmt.Errorf("unsupported language %q: must be one of python, java", lang)
}
