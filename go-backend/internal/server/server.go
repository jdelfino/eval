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
	r.Get("/healthz", handler.Healthz)
	r.Handle("/readyz", handler.NewReadyzHandler(pool))

	var revBuffer *revision.RevisionBuffer

	// API routes with auth and RLS middleware
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))
		// Auth middleware - validates JWT and populates user context
		if userStore != nil {
			jwksProvider := auth.NewCachedJWKSProvider(auth.DefaultJWKSURL, nil)
			validator := auth.NewIdentityPlatformValidator(cfg.GCPProjectID, jwksProvider, logger)
			adapter := NewUserLookupAdapter(userStore)
			authenticator := custommw.NewAuthenticator(validator, adapter, logger)
			r.Use(authenticator.Authenticate)
		}

		// RLS middleware - after auth, only if pool is available (not in tests)
		if pgxPool := pool.PgxPool(); pgxPool != nil {
			r.Use(custommw.RLSContextMiddleware(pgxPool))
		}

		// Protected routes
		if userStore != nil {
			r.Mount("/auth", handler.NewAuthHandler().Routes())

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

			// Section sub-resources (instructor+)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
				r.Get("/sections/{id}/sessions", sectionHandler.ListSessions)
				r.Post("/sections/{id}/regenerate-code", sectionHandler.RegenerateCode)
				r.Get("/sections/{id}/instructors", sectionHandler.ListInstructors)
				r.Post("/sections/{id}/instructors", sectionHandler.AddInstructor)
				r.Delete("/sections/{id}/instructors/{userID}", sectionHandler.RemoveInstructor)
			})

			// Instructor dashboard (instructor+)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
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

			// Create real-time publisher (no-op if Centrifugo is not configured)
			var sessionPub realtime.SessionPublisher
			if cfg.CentrifugoURL != "" && cfg.CentrifugoAPIKey != "" {
				client := realtime.NewClient(cfg.CentrifugoURL, cfg.CentrifugoAPIKey, logger)
				sessionPub = realtime.NewSessionPublisher(client)
			} else {
				sessionPub = realtime.NoOpSessionPublisher{}
			}

			// Create revision buffer for auto-creating revisions on code save.
			poolStore := store.New(pool.PgxPool())
			revBuffer = revision.NewRevisionBuffer(poolStore, logger)
			revBuffer.Start()

			r.Mount("/sessions", handler.NewSessionHandlerWithBuffer(sessionPub, revBuffer, logger).Routes())

			sessionStateHandler := handler.NewSessionStateHandler(sessionPub, logger)
			r.Get("/sessions/{id}/state", sessionStateHandler.State)
			r.Get("/sessions/{id}/public-state", sessionStateHandler.PublicState)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
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
				r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
				r.Post("/execute", executeHandler.StandaloneExecute)
			})

			// Advanced session features (instructor+): trace and AI analysis
			traceHandler := handler.NewTraceHandler(execClient)
			analyzeHandler := handler.NewAnalyzeHandler(&ai.StubClient{})
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequireRole(auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin))
				r.Post("/sessions/{id}/trace", traceHandler.Trace)
				r.Post("/sessions/{id}/analyze", analyzeHandler.Analyze)
			})

			sessionStudentHandler := handler.NewSessionStudentHandlerWithBuffer(sessionPub, revBuffer, logger)
			r.Post("/sessions/{id}/join", sessionStudentHandler.Join)
			r.Put("/sessions/{id}/code", sessionStudentHandler.UpdateCode)
			r.Get("/sessions/{id}/students", sessionStudentHandler.ListStudents)
		}
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
