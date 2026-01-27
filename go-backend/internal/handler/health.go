package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jdelfino/eval/internal/db"
)

// healthResponse represents the JSON response for health endpoints.
type healthResponse struct {
	Status string `json:"status"`
}

// Healthz is the liveness probe handler for Kubernetes.
// It always returns 200 OK with {"status": "ok"}.
func Healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
}

// Readyz is the readiness probe handler for Kubernetes.
// It returns 200 OK with {"status": "ok"} when the service is ready.
// Deprecated: Use ReadyzHandler for database health checking.
func Readyz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
}

// HealthChecker is an interface for checking database health.
// This interface allows for easy testing with mock implementations.
type HealthChecker interface {
	Health(ctx context.Context) db.HealthStatus
}

// databaseCheck represents the database health check result in the response.
type databaseCheck struct {
	Healthy    bool  `json:"healthy"`
	TotalConns int32 `json:"total_conns"`
	IdleConns  int32 `json:"idle_conns"`
}

// readyzChecks represents all health checks in the response.
type readyzChecks struct {
	Database databaseCheck `json:"database"`
}

// readyzResponse represents the full readiness response.
type readyzResponse struct {
	Status string       `json:"status"`
	Checks readyzChecks `json:"checks"`
}

// ReadyzHandler is an HTTP handler that checks service readiness including database health.
type ReadyzHandler struct {
	pool HealthChecker
}

// NewReadyzHandler creates a new ReadyzHandler with the given health checker.
func NewReadyzHandler(pool HealthChecker) *ReadyzHandler {
	return &ReadyzHandler{pool: pool}
}

// ServeHTTP handles the readiness probe request.
// It returns 200 OK if the database is healthy, 503 Service Unavailable otherwise.
func (h *ReadyzHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	status := h.pool.Health(r.Context())

	response := readyzResponse{
		Status: "ok",
		Checks: readyzChecks{
			Database: databaseCheck{
				Healthy:    status.Healthy,
				TotalConns: status.TotalConns,
				IdleConns:  status.IdleConns,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")

	if !status.Healthy {
		response.Status = "unhealthy"
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	_ = json.NewEncoder(w).Encode(response)
}
