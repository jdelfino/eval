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
	"github.com/redis/go-redis/v9"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/config"
	emailpkg "github.com/jdelfino/eval/go-backend/internal/email"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/handler"
	"github.com/jdelfino/eval/go-backend/internal/metrics"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/realtime"
	"github.com/jdelfino/eval/go-backend/internal/revision"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httpmiddleware"
	"github.com/jdelfino/eval/pkg/httputil"
	"github.com/jdelfino/eval/pkg/ratelimit"
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
	httpServer  *http.Server
	logger      *slog.Logger
	pool        DatabasePool
	revBuffer   *revision.RevisionBuffer
	memLimiter  *ratelimit.MemoryLimiter
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

	// Create rate limiter
	cats := ratelimit.Categories()
	memLimiter := ratelimit.NewMemoryLimiter(cats)
	memLimiter.Start()
	var rl ratelimit.Limiter
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

			}

		// Registration routes — GET is public, POST requires JWT (via inline middleware).
		// No user lookup needed (new users don't have a DB profile yet).
		if userStore != nil {
			r.Group(func(r chi.Router) {
				if pgxPool := pool.PgxPool(); pgxPool != nil {
					r.Use(custommw.RegistrationStoreMiddleware(pgxPool))
				}
				authHandler := handler.NewAuthHandler()
				r.Mount("/auth", authHandler.RegistrationRoutes(jwtValidator.Validate, custommw.ForCategory(rl, "auth", custommw.IPKey)))
			})
		}

		// Routes requiring existing user profile
		r.Group(func(r chi.Router) {
			// JWT validation + user loader
			if userStore != nil {
				r.Use(jwtValidator.Validate)
				r.Use(userLoader.Load)
			}

			// RLS middleware - after user load, only if pool is available (not in tests)
			if pgxPool := pool.PgxPool(); pgxPool != nil {
				r.Use(custommw.RLSContextMiddleware(pgxPool))
			}

			// Protected routes that require an existing user
			if userStore != nil {
				// Read rate limiting for GET endpoints
				readRL := custommw.ForCategory(rl, "read", custommw.UserKey)
				// Write rate limiting for POST/PUT/PATCH/DELETE endpoints
				writeRL := custommw.ForCategory(rl, "write", custommw.UserKey)

				// Auth routes for existing users (me endpoints)
				r.With(readRL).Get("/auth/me", handler.NewAuthHandler().GetMe)
				r.With(writeRL).Put("/auth/me", handler.NewAuthHandler().UpdateMe)

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

			// Create executor client early so it can be used by multiple handlers
			execClient := executor.NewClient(cfg.ExecutorURL, cfg.ExecutorTimeout)

			membershipHandler := handler.NewMembershipHandler()
			r.With(custommw.ForCategory(rl, "join", custommw.IPKey)).Post("/sections/join", membershipHandler.Join)

			sectionProblemHandler := handler.NewSectionProblemHandler()
			studentWorkHandler := handler.NewStudentWorkHandler().WithExecutor(execClient)

			sectionHandler := handler.NewSectionHandler(membershipHandler, sectionProblemHandler, studentWorkHandler).WithRateLimiting(readRL, writeRL)
			r.With(readRL).Get("/sections/my", sectionHandler.MySections)
			r.Mount("/sections", sectionHandler.Routes())
			r.Route("/classes/{classID}/sections", func(r chi.Router) {
				r.Mount("/", sectionHandler.ClassRoutes())
			})
			// Instructor dashboard (instructor+)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermDataViewAll))
				dashboardHandler := handler.NewDashboardHandler()
				r.With(readRL).Get("/instructor/dashboard", dashboardHandler.Dashboard)
			})

			r.Mount("/problems", handler.NewProblemHandler(sectionProblemHandler).Routes())

			// Student work routes
			r.With(readRL).Get("/student-work/{id}", studentWorkHandler.Get)
			r.With(writeRL).Patch("/student-work/{id}", studentWorkHandler.Update)
			r.With(custommw.ForCategory(rl, "execute", custommw.UserKey)).Post("/student-work/{id}/execute", studentWorkHandler.Execute)

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
				emailCli = emailpkg.NewResendClient(cfg.ResendAPIKey, cfg.ResendFromEmail)
			} else {
				emailCli = emailpkg.NoOpClient{}
			}
			invitationHandler := handler.NewInvitationHandler(emailCli, cfg.InviteBaseURL, logger)
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

			practiceSessionHandler := handler.NewPracticeSessionHandler(poolStore)

			sessionHandler := handler.NewSessionHandlerWithBuffer(sessionPub, revBuffer)
			r.Route("/sessions", func(r chi.Router) {
				r.With(readRL).Get("/", sessionHandler.List)
				r.With(readRL).Get("/history", sessionHandler.History)
				r.With(readRL).Get("/{id}", sessionHandler.Get)
				r.Group(func(r chi.Router) {
					r.Use(custommw.RequirePermission(auth.PermSessionManage))
					r.With(custommw.ForCategory(rl, "sessionCreate", custommw.UserKey)).Post("/", sessionHandler.Create)
					r.With(writeRL).Patch("/{id}", sessionHandler.Update)
					r.With(writeRL).Delete("/{id}", sessionHandler.Delete)
					r.With(writeRL).Post("/{id}/reopen", sessionHandler.Reopen)
					r.With(writeRL).Post("/{id}/update-problem", sessionHandler.UpdateProblem)
				})
			})

			sessionStateHandler := handler.NewSessionStateHandler(sessionPub)
			r.With(readRL).Get("/sessions/{id}/state", sessionStateHandler.State)
			r.With(readRL).Get("/sessions/{id}/public-state", sessionStateHandler.PublicState)
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.With(readRL).Get("/sessions/{id}/details", sessionStateHandler.State)
				r.With(writeRL).Post("/sessions/{id}/feature", sessionStateHandler.Feature)
			})

			revisionHandler := handler.NewRevisionHandler()
			r.With(readRL).Get("/sessions/{sessionID}/revisions", revisionHandler.List)
			r.With(writeRL).Post("/sessions/{sessionID}/revisions", revisionHandler.Create)

			executeHandler := handler.NewExecuteHandler(execClient)
			r.With(custommw.ForCategory(rl, "execute", custommw.UserKey)).Post("/sessions/{id}/execute", executeHandler.Execute)
			r.With(custommw.ForCategory(rl, "practice", custommw.UserKey)).Post("/sessions/{id}/practice", executeHandler.PracticeExecute)
			r.With(custommw.ForCategory(rl, "practice", custommw.UserKey)).Post("/problems/{id}/practice", practiceSessionHandler.StartPractice)

			// Standalone code execution (instructor+) — no session context
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.With(custommw.ForCategory(rl, "execute", custommw.UserKey)).Post("/execute", executeHandler.StandaloneExecute)
			})

			// Standalone trace (any authenticated user) — no session context
			traceHandler := handler.NewTraceHandler(execClient)
			r.With(custommw.ForCategory(rl, "trace", custommw.UserKey)).Post("/trace", traceHandler.StandaloneTrace)

			// Advanced session features (instructor+): AI analysis
			// Rate limits stacked: per-user daily (most restrictive, checked first),
			// global daily, then per-minute burst.
			analyzeHandler := handler.NewAnalyzeHandler(&ai.StubClient{})
			r.Group(func(r chi.Router) {
				r.Use(custommw.RequirePermission(auth.PermSessionManage))
				r.With(
					custommw.ForCategory(rl, "analyzeDaily", custommw.UserKey),
					custommw.ForCategory(rl, "analyzeGlobal", httpmiddleware.GlobalKey),
					custommw.ForCategory(rl, "analyze", custommw.UserKey),
				).Post("/sessions/{id}/analyze", analyzeHandler.Analyze)
			})

			sessionStudentHandler := handler.NewSessionStudentHandlerWithBuffer(sessionPub, revBuffer)
			r.With(custommw.ForCategory(rl, "join", custommw.IPKey)).Post("/sessions/{id}/join", sessionStudentHandler.Join)
			r.With(writeRL).Put("/sessions/{id}/code", sessionStudentHandler.UpdateCode)
			r.With(readRL).Get("/sessions/{id}/students", sessionStudentHandler.ListStudents)
			}
		})
	})

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger:     logger,
		pool:       pool,
		revBuffer:  revBuffer,
		memLimiter: memLimiter,
	}
}

// Start begins listening and serving HTTP requests.
// It returns http.ErrServerClosed when Shutdown is called.
func (s *Server) Start() error {
	s.logger.Info("starting server", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

// Handler returns the HTTP handler for the server. This is useful for
// integration tests that use httptest.NewServer.
func (s *Server) Handler() http.Handler {
	return s.httpServer.Handler
}

// Shutdown gracefully shuts down the server without interrupting active connections.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.revBuffer != nil {
		s.revBuffer.Stop()
	}
	if s.memLimiter != nil {
		s.memLimiter.Stop()
	}
	return s.httpServer.Shutdown(ctx)
}
