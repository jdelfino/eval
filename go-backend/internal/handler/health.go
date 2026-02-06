package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jdelfino/eval/internal/db"
)

// HealthChecker is an interface for checking database health.
// This interface allows for easy testing with mock implementations.
type HealthChecker interface {
	Health(ctx context.Context) db.HealthStatus
}

// ReadyzHandler is an HTTP handler that checks service readiness including database health.
type ReadyzHandler struct {
	pool HealthChecker
}

// NewReadyzHandler creates a new ReadyzHandler with the given health checker.
func NewReadyzHandler(pool HealthChecker) *ReadyzHandler {
	return &ReadyzHandler{pool: pool}
}

// verboseDBConnections represents database connection stats in verbose output.
type verboseDBConnections struct {
	TotalConns int32 `json:"total_conns"`
	IdleConns  int32 `json:"idle_conns"`
}

// verboseDBComponent represents the database component in verbose output.
type verboseDBComponent struct {
	Status      string               `json:"status"`
	Connections verboseDBConnections `json:"connections"`
}

// verboseComponents holds all component statuses in verbose output.
type verboseComponents struct {
	Database verboseDBComponent `json:"database"`
}

// verboseReadyzResponse represents the verbose readiness response.
type verboseReadyzResponse struct {
	Status     string            `json:"status"`
	Components verboseComponents `json:"components"`
}

// ServeHTTP handles the readiness probe request.
// It returns 200 OK if the database is healthy, 503 Service Unavailable otherwise.
// When the ?verbose query parameter is present, it returns detailed component statuses.
func (h *ReadyzHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	status := h.pool.Health(r.Context())

	healthy := status.Healthy
	overallStatus := "ok"
	if !healthy {
		overallStatus = "unhealthy"
	}

	w.Header().Set("Content-Type", "application/json")

	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	verbose := r.URL.Query().Has("verbose")
	if verbose {
		dbStatus := "ok"
		if !healthy {
			dbStatus = "unhealthy"
		}
		response := verboseReadyzResponse{
			Status: overallStatus,
			Components: verboseComponents{
				Database: verboseDBComponent{
					Status: dbStatus,
					Connections: verboseDBConnections{
						TotalConns: status.TotalConns,
						IdleConns:  status.IdleConns,
					},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(response)
	} else {
		_ = json.NewEncoder(w).Encode(struct {
			Status string `json:"status"`
		}{Status: overallStatus})
	}
}
