// Package server provides the HTTP server with configured middleware and routes.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/config"
	"github.com/jdelfino/eval/internal/handler"
	"github.com/jdelfino/eval/internal/metrics"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
)

var registerDBPoolOnce sync.Once

// DatabasePool is the interface for database pool operations needed by the server.
// This allows for easy testing with mock implementations.
type DatabasePool interface {
	handler.HealthChecker
	// PgxPool returns the underlying pgxpool.Pool for middleware that need direct access.
	// Returns nil in tests where actual database access is not needed.
	PgxPool() *pgxpool.Pool
}

// Server wraps the HTTP server with its configuration and logger.
type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	pool       DatabasePool
}

// New creates a new Server with the configured middleware chain and routes.
// s may be nil (e.g. in tests without a database); when nil, the
// authentication middleware is skipped on API routes.
func New(cfg *config.Config, logger *slog.Logger, pool DatabasePool, s *store.Store) *Server {
	r := chi.NewRouter()

	// Middleware chain
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(custommw.Logger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/ping"))
	r.Use(custommw.Metrics)

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Register DB pool metrics if pool is available (once to avoid panic on re-registration)
	if pgxPool := pool.PgxPool(); pgxPool != nil {
		registerDBPoolOnce.Do(func() {
			prometheus.MustRegister(metrics.NewDBPoolCollector(func() metrics.PoolStats {
				s := pgxPool.Stat()
				return metrics.PoolStats{
					AcquireCount:         s.AcquireCount(),
					AcquiredConns:        s.AcquiredConns(),
					IdleConns:            s.IdleConns(),
					ConstructingConns:    s.ConstructingConns(),
					TotalConns:           s.TotalConns(),
					MaxConns:             s.MaxConns(),
					EmptyAcquireCount:    s.EmptyAcquireCount(),
					CanceledAcquireCount: s.CanceledAcquireCount(),
				}
			}))
		})
	}

	// Health endpoints
	r.Get("/healthz", handler.Healthz)
	r.Handle("/readyz", handler.NewReadyzHandler(pool))

	// API routes with auth and RLS middleware
	r.Route("/api/v1", func(r chi.Router) {
		// Auth middleware - validates JWT and populates user context
		if s != nil {
			jwksProvider := auth.NewCachedJWKSProvider(auth.DefaultJWKSURL, nil)
			validator := auth.NewIdentityPlatformValidator(cfg.GCPProjectID, jwksProvider, logger)
			adapter := NewUserLookupAdapter(s)
			authenticator := custommw.NewAuthenticator(validator, adapter, logger)
			r.Use(authenticator.Authenticate)
		}

		// RLS middleware - after auth, only if pool is available (not in tests)
		if pgxPool := pool.PgxPool(); pgxPool != nil {
			r.Use(custommw.RLSContextMiddleware(pgxPool))
		}

		// Protected routes
		if s != nil {
			r.Mount("/auth", handler.NewAuthHandler(s).Routes())
			r.Mount("/namespaces", handler.NewNamespaceHandler(s).Routes())
		}
	})

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger: logger,
		pool:   pool,
	}
}

// Start begins listening and serving HTTP requests.
// It returns http.ErrServerClosed when Shutdown is called.
func (s *Server) Start() error {
	s.logger.Info("starting server", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server without interrupting active connections.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
