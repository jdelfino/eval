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
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/jdelfino/eval/executor/internal/config"
	custommw "github.com/jdelfino/eval/executor/internal/middleware"
)

// Server wraps the HTTP server with its configuration and logger.
type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
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
	r := chi.NewRouter()

	// Middleware chain
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(custommw.Logger(logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/ping"))

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Health endpoints
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
	})

	r.Get("/readyz", readyzHandler(cfg))

	// Execute endpoint (placeholder, wired in later task)
	r.Post("/execute", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
	})

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf(":%d", cfg.Port),
			Handler: r,
		},
		logger: logger,
		cfg:    cfg,
	}
}

// readyzHandler returns an HTTP handler that checks if nsjail and python3 binaries are accessible.
func readyzHandler(cfg *config.Config) http.HandlerFunc {
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
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			w.WriteHeader(http.StatusOK)
		}

		_ = json.NewEncoder(w).Encode(readyResponse{
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
	return s.httpServer.Shutdown(ctx)
}
