// Package server provides the HTTP server with configured middleware and routes.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/jdelfino/eval/internal/ai"
	"github.com/jdelfino/eval/internal/auth"
	emailpkg "github.com/jdelfino/eval/internal/email"
	"github.com/jdelfino/eval/internal/config"
	"github.com/jdelfino/eval/internal/executor"
	"github.com/jdelfino/eval/internal/handler"
	"github.com/jdelfino/eval/internal/metrics"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/realtime"
	"github.com/jdelfino/eval/internal/revision"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
	"github.com/jdelfino/eval/pkg/httputil"
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
	revBuffer  *revision.RevisionBuffer
}

// New creates a new Server with the configured middleware chain and routes.
// userStore may be nil (e.g. in tests without a database); when nil, the
// authentication middleware is skipped on API routes.
func New(cfg *config.Config, logger *slog.Logger, pool DatabasePool, userStore store.UserRepository) *Server {
	return NewWithRegistry(cfg, logger, pool, userStore, prometheus.DefaultRegisterer)
}

// NewWithRegistry creates a new Server using the provided Prometheus registerer.
func NewWithRegistry(cfg *config.Config, logger *slog.Logger, pool DatabasePool, userStore store.UserRepository, reg prometheus.Registerer) *Server {
	httpMetrics := httpmiddleware.NewHTTPMetrics(reg)

	r := chi.NewRouter()

	// Middleware chain
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(custommw.Logger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/ping"))
	r.Use(httpMetrics.Middleware)

	// Metrics endpoint - use registry-specific handler if available
	if gatherer, ok := reg.(prometheus.Gatherer); ok {
		r.Handle("/metrics", promhttp.HandlerFor(gatherer, promhttp.HandlerOpts{}))
	} else {
		r.Handle("/metrics", promhttp.Handler())
	}

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
	r.Get("/healthz", httputil.Healthz)
	r.Handle("/readyz", handler.NewReadyzHandler(pool))

	var revBuffer *revision.RevisionBuffer

	// API routes with auth and RLS middleware
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))

		// Create auth components
		var jwtValidator *custommw.JWTValidator
		var userLoader *custommw.UserLoader
		if userStore != nil {
			var validator auth.TokenValidator
			if cfg.AuthMode == "test" {
				logger.Warn("AUTH_MODE=test: using test token validator — DO NOT USE IN PRODUCTION")
				validator = auth.NewTestValidator()
			} else {
				jwksProvider := auth.NewCachedJWKSProvider(auth.DefaultJWKSURL, nil)
				validator = auth.NewIdentityPlatformValidator(cfg.GCPProjectID, jwksProvider, logger)
			}
			adapter := NewUserLookupAdapter(userStore)
			jwtValidator = custommw.NewJWTValidator(validator, logger)
			userLoader = custommw.NewUserLoader(adapter, logger)

			// JWT validation for all authenticated routes
			r.Use(jwtValidator.Validate)
		}

		// Registration routes - JWT validated but no user lookup required
		// (these are for new users who don't have a profile yet)
		// Uses RegistrationStoreMiddleware for limited RLS access instead of bypassing RLS.
		if userStore != nil {
			r.Group(func(r chi.Router) {
				if pgxPool := pool.PgxPool(); pgxPool != nil {
					r.Use(custommw.RegistrationStoreMiddleware(pgxPool))
				}
				authHandler := handler.NewAuthHandler()
				r.Mount("/auth", authHandler.RegistrationRoutes())
			})
		}

		// Routes requiring existing user profile
		r.Group(func(r chi.Router) {
			// User loader - requires user to exist in database
			if userStore != nil {
				r.Use(userLoader.Load)
			}

			// RLS middleware - after user load, only if pool is available (not in tests)
			if pgxPool := pool.PgxPool(); pgxPool != nil {
				r.Use(custommw.RLSContextMiddleware(pgxPool))
			}

			// Protected routes that require an existing user
			if userStore != nil {
				// Auth routes for existing users (me endpoints)
				r.Get("/auth/me", handler.NewAuthHandler().GetMe)
				r.Put("/auth/me", handler.NewAuthHandler().UpdateMe)

				// Centrifugo realtime token endpoint
			if cfg.CentrifugoTokenSecret != "" {
				tokenGen, err := realtime.NewHMACTokenGenerator(cfg.CentrifugoTokenSecret)
				if err != nil {
					logger.Warn("failed to create centrifugo token generator; token endpoint unavailable", "error", err)
				} else {
					centrifugoHandler := handler.NewCentrifugoHandler(tokenGen, cfg.CentrifugoTokenExpiry)
					r.Mount("/realtime", centrifugoHandler.Routes())
				}
			}
			r.Mount("/namespaces", handler.NewNamespaceHandler().Routes())
			r.Mount("/classes", handler.NewClassHandler().Routes())

			membershipHandler := handler.NewMembershipHandler()
			r.Post("/sections/join", membershipHandler.Join)

			sectionHandler := handler.NewSectionHandler()
			r.Get("/sections/my", sectionHandler.MySections)
			r.Mount("/sections", sectionHandler.Routes())
			r.Route("/classes/{classID}/sections", func(r chi.Router) {
				r.Mount("/", sectionHandler.ClassRoutes())
			})

			r.Get("/sections/{id}/members", membershipHandler.ListMembers)
			r.Delete("/sections/{id}/membership", membershipHandler.Leave)
			// Students need to list sessions to discover active ones (RLS enforces visibility)
			r.Get("/sections/{id}/sessions", sectionHandler.ListSessions)

			// Section sub-resources (instructor+)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermContentManage))
				r.Post("/sections/{id}/regenerate-code", sectionHandler.RegenerateCode)
				r.Get("/sections/{id}/instructors", sectionHandler.ListInstructors)
				r.Post("/sections/{id}/instructors", sectionHandler.AddInstructor)
				r.Delete("/sections/{id}/instructors/{userID}", sectionHandler.RemoveInstructor)
			})

			// Instructor dashboard (instructor+)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermDataViewAll))
				dashboardHandler := handler.NewDashboardHandler()
				r.Get("/instructor/dashboard", dashboardHandler.Dashboard)
			})

			r.Mount("/problems", handler.NewProblemHandler().Routes())

			// Admin routes (system-admin only)
			adminHandler := handler.NewAdminHandler()
			r.Route("/admin", func(r chi.Router) {
				r.Mount("/", adminHandler.Routes())
				// User management routes (namespace-admin+)
				userHandler := handler.NewUserHandler()
				r.Mount("/users", userHandler.NamespaceRoutes())
			})

			// System-level user management routes
			sysUserHandler := handler.NewUserHandler()
			r.Mount("/system/users", sysUserHandler.SystemRoutes())

			// Invitation routes
			var emailCli emailpkg.Client
			if cfg.ResendAPIKey != "" {
				emailCli = emailpkg.NewResendClient(cfg.ResendAPIKey)
			} else {
				emailCli = emailpkg.NoOpClient{}
			}
			invitationHandler := handler.NewInvitationHandler(emailCli, cfg.InviteBaseURL)
			r.Mount("/namespaces/{id}/invitations", invitationHandler.Routes())
			r.Mount("/system/invitations", invitationHandler.SystemRoutes())

			// Create real-time publisher (no-op if Centrifugo is not configured).
			// Wrap with AsyncSessionPublisher so handlers don't manage goroutines.
			var sessionPub realtime.SessionPublisher
			if cfg.CentrifugoURL != "" && cfg.CentrifugoAPIKey != "" {
				client := realtime.NewClient(cfg.CentrifugoURL, cfg.CentrifugoAPIKey, logger)
				sessionPub = realtime.NewAsyncSessionPublisher(realtime.NewSessionPublisher(client), logger)
			} else {
				sessionPub = realtime.NoOpSessionPublisher{}
			}

			// Create revision buffer for auto-creating revisions on code save.
			// Uses a pool-backed Store (no RLS) because the buffer flushes
			// asynchronously outside any request context.
			poolStore := store.New(pool.PgxPool())
			revBuffer = revision.NewRevisionBuffer(poolStore, logger)
			revBuffer.Start()

			r.Mount("/sessions", handler.NewSessionHandlerWithBuffer(sessionPub, revBuffer).Routes())

			sessionStateHandler := handler.NewSessionStateHandler(sessionPub)
			r.Get("/sessions/{id}/state", sessionStateHandler.State)
			r.Get("/sessions/{id}/public-state", sessionStateHandler.PublicState)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.Get("/sessions/{id}/details", sessionStateHandler.State)
				r.Post("/sessions/{id}/feature", sessionStateHandler.Feature)
			})

			revisionHandler := handler.NewRevisionHandler()
			r.Get("/sessions/{sessionID}/revisions", revisionHandler.List)
			r.Post("/sessions/{sessionID}/revisions", revisionHandler.Create)

			execClient := executor.NewClient(cfg.ExecutorURL, cfg.ExecutorTimeout)
			executeHandler := handler.NewExecuteHandler(execClient)
			r.Post("/sessions/{id}/execute", executeHandler.Execute)

			// Standalone code execution (instructor+) — no session context
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.Post("/execute", executeHandler.StandaloneExecute)
			})

			// Advanced session features (instructor+): trace and AI analysis
			traceHandler := handler.NewTraceHandler(execClient)
			analyzeHandler := handler.NewAnalyzeHandler(&ai.StubClient{})
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.Post("/sessions/{id}/trace", traceHandler.Trace)
				r.Post("/sessions/{id}/analyze", analyzeHandler.Analyze)
			})

			sessionStudentHandler := handler.NewSessionStudentHandlerWithBuffer(sessionPub, revBuffer)
			r.Post("/sessions/{id}/join", sessionStudentHandler.Join)
			r.Put("/sessions/{id}/code", sessionStudentHandler.UpdateCode)
			r.Get("/sessions/{id}/students", sessionStudentHandler.ListStudents)
			}
		})
	})

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger:    logger,
		pool:      pool,
		revBuffer: revBuffer,
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
	if s.revBuffer != nil {
		s.revBuffer.Stop()
	}
	return s.httpServer.Shutdown(ctx)
}
