// Package config provides configuration loading from environment variables.
package config

import (
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/jdelfino/eval/internal/db"
)

// Config holds all configuration values for the application.
type Config struct {
	// Application Configuration
	Port        int    `env:"PORT" envDefault:"8080"`
	Environment string `env:"ENVIRONMENT" envDefault:"local"`
	LogLevel    string `env:"LOG_LEVEL" envDefault:"info"`

	// GCP Configuration
	GCPProjectID string `env:"GCP_PROJECT_ID"`
	GCPRegion    string `env:"GCP_REGION"`

	// Database Configuration
	DatabaseHost            string        `env:"DATABASE_HOST"`
	DatabasePort            int           `env:"DATABASE_PORT" envDefault:"5432"`
	DatabaseName            string        `env:"DATABASE_NAME"`
	DatabaseUser            string        `env:"DATABASE_USER"`
	DatabasePassword        string        `env:"DATABASE_PASSWORD"`
	DatabaseURL             string        `env:"DATABASE_URL"`
	DatabaseMaxConns        int32         `env:"DATABASE_MAX_CONNS" envDefault:"25"`
	DatabaseMinConns        int32         `env:"DATABASE_MIN_CONNS" envDefault:"5"`
	DatabaseMaxConnLifetime time.Duration `env:"DATABASE_MAX_CONN_LIFETIME" envDefault:"1h"`
	DatabaseMaxConnIdleTime time.Duration `env:"DATABASE_MAX_CONN_IDLE" envDefault:"30m"`

	// Redis Configuration
	RedisHost string `env:"REDIS_HOST"`
	RedisPort int    `env:"REDIS_PORT" envDefault:"6379"`

	// Centrifugo Configuration
	CentrifugoURL         string `env:"CENTRIFUGO_URL"`
	CentrifugoAPIKey      string `env:"CENTRIFUGO_API_KEY"`
	CentrifugoTokenSecret string `env:"CENTRIFUGO_TOKEN_SECRET"`

	// Identity Platform Configuration
	IdentityPlatformAPIKey     string `env:"IDENTITY_PLATFORM_API_KEY"`
	IdentityPlatformAuthDomain string `env:"IDENTITY_PLATFORM_AUTH_DOMAIN"`
	OAuthClientID              string `env:"OAUTH_CLIENT_ID"`
	OAuthClientSecret          string `env:"OAUTH_CLIENT_SECRET"`
}

// Load parses environment variables and returns a Config struct.
func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// DatabasePoolConfig returns a db.PoolConfig populated from this Config.
func (c *Config) DatabasePoolConfig() db.PoolConfig {
	return db.PoolConfig{
		Host:            c.DatabaseHost,
		Database:        c.DatabaseName,
		User:            c.DatabaseUser,
		Password:        c.DatabasePassword,
		Port:            c.DatabasePort,
		MaxConns:        c.DatabaseMaxConns,
		MinConns:        c.DatabaseMinConns,
		MaxConnLifetime: c.DatabaseMaxConnLifetime,
		MaxConnIdleTime: c.DatabaseMaxConnIdleTime,
	}
}
