package db

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPoolConfigConnectionString(t *testing.T) {
	tests := []struct {
		name     string
		cfg      PoolConfig
		contains []string
	}{
		{
			name: "basic config",
			cfg: PoolConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				User:     "testuser",
				Password: "testpass",
			},
			contains: []string{
				"host=localhost",
				"port=5432",
				"dbname=testdb",
				"user=testuser",
				"password=testpass",
			},
		},
		{
			name: "with pool settings",
			cfg: PoolConfig{
				Host:            "db.example.com",
				Port:            5433,
				Database:        "proddb",
				User:            "admin",
				Password:        "secret",
				MaxConns:        10,
				MinConns:        2,
				MaxConnLifetime: 30 * time.Minute,
				MaxConnIdleTime: 5 * time.Minute,
			},
			contains: []string{
				"host=db.example.com",
				"port=5433",
				"dbname=proddb",
				"user=admin",
				"password=secret",
				"pool_max_conns=10",
				"pool_min_conns=2",
				"pool_max_conn_lifetime=30m",
				"pool_max_conn_idle_time=5m",
			},
		},
		{
			name: "zero pool settings omitted",
			cfg: PoolConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				User:     "testuser",
				Password: "testpass",
				MaxConns: 0,
				MinConns: 0,
			},
			contains: []string{
				"host=localhost",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			connStr := tt.cfg.ConnectionString()
			for _, want := range tt.contains {
				if !strings.Contains(connStr, want) {
					t.Errorf("ConnectionString() = %q, want to contain %q", connStr, want)
				}
			}
		})
	}
}

func TestPoolConfigConnectionStringNoZeroPoolSettings(t *testing.T) {
	cfg := PoolConfig{
		Host:     "localhost",
		Port:     5432,
		Database: "testdb",
		User:     "testuser",
		Password: "testpass",
		MaxConns: 0,
		MinConns: 0,
	}

	connStr := cfg.ConnectionString()

	if strings.Contains(connStr, "pool_max_conns") {
		t.Errorf("ConnectionString() = %q, should not contain pool_max_conns when zero", connStr)
	}
	if strings.Contains(connStr, "pool_min_conns") {
		t.Errorf("ConnectionString() = %q, should not contain pool_min_conns when zero", connStr)
	}
}

func TestHealthStatusDefaults(t *testing.T) {
	status := HealthStatus{}

	if status.Healthy {
		t.Error("HealthStatus default Healthy should be false")
	}
	if status.TotalConns != 0 {
		t.Error("HealthStatus default TotalConns should be 0")
	}
	if status.Message != "" {
		t.Error("HealthStatus default Message should be empty")
	}
}

func TestHealthStatusHealthy(t *testing.T) {
	status := HealthStatus{
		Healthy:      true,
		TotalConns:   5,
		IdleConns:    3,
		AcquireConns: 2,
		Message:      "OK",
	}

	if !status.Healthy {
		t.Error("HealthStatus Healthy should be true")
	}
	if status.TotalConns != 5 {
		t.Errorf("HealthStatus TotalConns = %d, want 5", status.TotalConns)
	}
	if status.IdleConns != 3 {
		t.Errorf("HealthStatus IdleConns = %d, want 3", status.IdleConns)
	}
	if status.AcquireConns != 2 {
		t.Errorf("HealthStatus AcquireConns = %d, want 2", status.AcquireConns)
	}
	if status.Message != "OK" {
		t.Errorf("HealthStatus Message = %q, want %q", status.Message, "OK")
	}
}

// TestPoolImplementsServerInterface verifies that Pool implements the interface
// needed by the server package at compile time.
func TestPoolImplementsServerInterface(t *testing.T) {
	// This test verifies compile-time interface compliance.
	// The interface is defined in the server package, but we verify
	// the methods exist here.
	var _ interface {
		Health(ctx context.Context) HealthStatus
		PgxPool() *pgxpool.Pool
		Close()
	} = (*Pool)(nil)

	t.Log("Pool implements required interface methods")
}

