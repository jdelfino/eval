// Package server provides the HTTP server with configured middleware and routes.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/time/rate"

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/httplog"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
)

// Server wraps the HTTP server with its configuration and logger.
type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
	metrics    *metrics.Metrics
}

// healthResponse represents the JSON response for health endpoints.
type healthResponse struct {
	Status string `json:"status"`
}

// readyResponse represents the JSON response for the readiness endpoint.
type readyResponse struct {
	Status     string            `json:"status"`
	Components map[string]string `json:"components,omitempty"`
}

// New creates a new Server with the configured middleware chain and routes.
func New(cfg *config.Config, logger *slog.Logger) *Server {
	return NewWithRegistry(cfg, logger, prometheus.DefaultRegisterer)
}

// NewWithRegistry creates a new Server using the provided Prometheus registerer.
func NewWithRegistry(cfg *config.Config, logger *slog.Logger, reg prometheus.Registerer) *Server {
	m := metrics.New(reg)
	httpMetrics := httpmiddleware.NewHTTPMetrics(reg)

	r := chi.NewRouter()

	// Middleware chain
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(httplog.Logger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/ping"))
	r.Use(httpMetrics.Middleware)

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Health endpoints
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
	})

	r.Get("/readyz", readyzHandler(cfg, m))

	// Execute endpoint
	execHandler := handler.NewExecuteHandler(
		logger, sandbox.Run, m,
		handler.ExecuteHandlerConfig{
			NsjailPath:       cfg.NsjailPath,
			PythonPath:       cfg.PythonPath,
			MaxOutputBytes:   cfg.MaxOutputBytes,
			DefaultTimeoutMs: cfg.DefaultTimeoutMS,
			MaxCodeBytes:     cfg.MaxCodeBytes,
			MaxStdinBytes:    cfg.MaxStdinBytes,
			MaxFiles:         cfg.MaxFiles,
			MaxFileBytes:     cfg.MaxFileBytes,
		},
	)
	// Wrap /execute with rate limiting if enabled (RPS > 0).
	var executeHandler http.HandlerFunc = execHandler.ServeHTTP
	if cfg.RateLimitRPS > 0 {
		limiter := rate.NewLimiter(rate.Limit(cfg.RateLimitRPS), cfg.RateLimitBurst)
		executeHandler = rateLimitMiddleware(limiter, executeHandler)
	}
	r.Post("/execute", executeHandler)

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger:  logger,
		cfg:     cfg,
		metrics: m,
	}
}

// readyzHandler returns an HTTP handler that checks if nsjail and python3 binaries are accessible.
func readyzHandler(cfg *config.Config, m *metrics.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		components := map[string]string{}
		healthy := true

		if _, err := os.Stat(cfg.NsjailPath); err != nil {
			components["nsjail"] = "unavailable"
			healthy = false
		} else {
			components["nsjail"] = "ok"
		}

		if _, err := os.Stat(cfg.PythonPath); err != nil {
			components["python"] = "unavailable"
			healthy = false
		} else {
			components["python"] = "ok"
		}

		status := "ok"
		if !healthy {
			status = "unhealthy"
			m.Ready.Set(0)
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			m.Ready.Set(1)
			w.WriteHeader(http.StatusOK)
		}

		_ = json.NewEncoder(w).Encode(readyResponse{
			Status:     status,
			Components: components,
		})
	}
}

// rateLimitResponse represents the JSON response when rate limit is exceeded.
type rateLimitResponse struct {
	Error string `json:"error"`
}

// rateLimitMiddleware wraps a handler and returns 429 when the limiter rejects.
func rateLimitMiddleware(limiter *rate.Limiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(rateLimitResponse{Error: "rate limit exceeded"})
			return
		}
		next(w, r)
	}
}

// Start begins listening and serving HTTP requests.
func (s *Server) Start() error {
	s.logger.Info("starting server", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server without interrupting active connections.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
