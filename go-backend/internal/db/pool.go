// Package db provides database connection management and utilities.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PoolConfig holds configuration for creating a database connection pool.
type PoolConfig struct {
	Host     string
	Database string
	User     string
	Password string
	Port     int

	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
	MaxConnIdleTime time.Duration
}

// ConnectionString returns a PostgreSQL connection string from the config.
func (c PoolConfig) ConnectionString() string {
	connStr := fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s",
		c.Host, c.Port, c.Database, c.User, c.Password,
	)

	if c.MaxConns > 0 {
		connStr += fmt.Sprintf(" pool_max_conns=%d", c.MaxConns)
	}
	if c.MinConns > 0 {
		connStr += fmt.Sprintf(" pool_min_conns=%d", c.MinConns)
	}
	if c.MaxConnLifetime > 0 {
		connStr += fmt.Sprintf(" pool_max_conn_lifetime=%s", c.MaxConnLifetime)
	}
	if c.MaxConnIdleTime > 0 {
		connStr += fmt.Sprintf(" pool_max_conn_idle_time=%s", c.MaxConnIdleTime)
	}

	return connStr
}

// Pool wraps pgxpool.Pool to provide connection management and health checks.
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a new database connection pool with the given configuration.
func NewPool(ctx context.Context, cfg PoolConfig) (*Pool, error) {
	connStr := cfg.ConnectionString()

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	// Verify connection works
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Pool{Pool: pool}, nil
}

// HealthStatus represents the health state of the connection pool.
type HealthStatus struct {
	Healthy      bool   `json:"healthy"`
	TotalConns   int32  `json:"total_conns"`
	IdleConns    int32  `json:"idle_conns"`
	AcquireConns int32  `json:"acquire_conns"`
	Message      string `json:"message"`
}

// Health returns the current health status of the connection pool.
// This is useful for Kubernetes readiness probes.
func (p *Pool) Health(ctx context.Context) HealthStatus {
	stat := p.Stat()

	status := HealthStatus{
		TotalConns:   stat.TotalConns(),
		IdleConns:    stat.IdleConns(),
		AcquireConns: stat.AcquiredConns(),
	}

	// Try to ping to verify connection is alive
	if err := p.Ping(ctx); err != nil {
		status.Healthy = false
		status.Message = fmt.Sprintf("ping failed: %v", err)
		return status
	}

	status.Healthy = true
	status.Message = "OK"
	return status
}

// Close gracefully shuts down the connection pool.
func (p *Pool) Close() {
	p.Pool.Close()
}
