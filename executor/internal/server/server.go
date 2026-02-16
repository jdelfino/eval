// Package server provides the HTTP server with configured middleware and routes.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"

	"github.com/jdelfino/eval/executor/internal/config"
	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/httplog"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
	"github.com/jdelfino/eval/pkg/httputil"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// Server wraps the HTTP server with its configuration and logger.
type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
	metrics    *metrics.Metrics
	memLimiter *ratelimit.MemoryLimiter
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
	r.Get("/healthz", httputil.Healthz)

	r.Get("/readyz", readyzHandler(cfg, m))

	// Select sandbox runner. DISABLE_SANDBOX skips nsjail for environments
	// where it can't run (CI, devcontainers). Never allowed in production.
	runner := handler.SandboxRunner(sandbox.Run)
	if cfg.DisableSandbox {
		if cfg.Environment == "production" || cfg.Environment == "prod" {
			logger.Error("DISABLE_SANDBOX is set in production — refusing to start without sandboxing")
			fmt.Fprintln(os.Stderr, "FATAL: DISABLE_SANDBOX=true is not allowed in production")
			os.Exit(1)
		}
		logger.Warn("sandbox disabled — executing code without nsjail isolation")
		runner = sandbox.RunUnsafe
	}

	// Set up distributed rate limiter.
	var rl ratelimit.Limiter
	cats := ratelimit.Categories()
	memLimiter := ratelimit.NewMemoryLimiter(cats)
	memLimiter.Start()
	if cfg.RedisHost != "" {
		redisClient := redis.NewClient(&redis.Options{
			Addr: fmt.Sprintf("%s:%d", cfg.RedisHost, cfg.RedisPort),
		})
		rl = ratelimit.NewFallbackLimiter(
			ratelimit.NewRedisLimiter(redisClient, cats),
			memLimiter,
			logger,
		)
	} else {
		rl = memLimiter
	}

	// Execute endpoint
	execHandler := handler.NewExecuteHandler(
		logger, runner, m,
		handler.ExecuteHandlerConfig{
			NsjailPath:       cfg.NsjailPath,
			PythonPath:       cfg.PythonPath,
			MaxOutputBytes:   cfg.MaxOutputBytes,
			DefaultTimeoutMs: cfg.DefaultTimeoutMS,
			MaxCodeBytes:     cfg.MaxCodeBytes,
			MaxStdinBytes:    cfg.MaxStdinBytes,
			MaxFiles:         cfg.MaxFiles,
			MaxFileBytes:            cfg.MaxFileBytes,
			MaxConcurrentExecutions: cfg.MaxConcurrentExecutions,
		},
	)
	// Defense-in-depth global rate limit. Per-student limits are enforced
	// at the go-backend; this only guards against bypass.
	globalRL := httpmiddleware.ForCategory(rl, "executorGlobal", httpmiddleware.GlobalKey, logger)
	r.With(globalRL).Post("/execute", execHandler.ServeHTTP)

	// Trace endpoint (shares concurrency pool concept with /execute).
	traceHandler := handler.NewTraceHandler(
		logger, runner, m,
		handler.TraceHandlerConfig{
			NsjailPath:              cfg.NsjailPath,
			PythonPath:              cfg.PythonPath,
			MaxOutputBytes:          cfg.MaxOutputBytes,
			MaxCodeBytes:            cfg.MaxCodeBytes,
			MaxStdinBytes:           cfg.MaxStdinBytes,
			MaxConcurrentExecutions: cfg.MaxConcurrentExecutions,
		},
	)
	r.With(globalRL).Post("/trace", traceHandler.ServeHTTP)

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger:     logger,
		cfg:        cfg,
		metrics:    m,
		memLimiter: memLimiter,
	}
}

// readyzHandler returns an HTTP handler that checks if nsjail and python3 binaries are accessible.
func readyzHandler(cfg *config.Config, m *metrics.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
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
		code := http.StatusOK
		if !healthy {
			status = "unhealthy"
			code = http.StatusServiceUnavailable
			m.Ready.Set(0)
		} else {
			m.Ready.Set(1)
		}

		httputil.WriteJSON(w, code, readyResponse{
			Status:     status,
			Components: components,
		})
	}
}

// Start begins listening and serving HTTP requests.
func (s *Server) Start() error {
	s.logger.Info("starting server", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server without interrupting active connections.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.memLimiter != nil {
		s.memLimiter.Stop()
	}
	return s.httpServer.Shutdown(ctx)
}
