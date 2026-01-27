package handler

import (
	"encoding/json"
	"net/http"
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
	json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
}

// Readyz is the readiness probe handler for Kubernetes.
// It returns 200 OK with {"status": "ok"} when the service is ready.
func Readyz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(healthResponse{Status: "ok"})
}
