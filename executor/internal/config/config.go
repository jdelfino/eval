// Package config provides configuration loading from environment variables.
package config

import (
	"github.com/caarlos0/env/v11"
)

// Config holds all configuration values for the executor service.
type Config struct {
	// Application Configuration
	Port        int    `env:"PORT" envDefault:"8081"`
	Environment string `env:"ENVIRONMENT" envDefault:"local"`
	LogLevel    string `env:"LOG_LEVEL" envDefault:"info"`

	// GCP Configuration
	GCPProjectID string `env:"GCP_PROJECT_ID"`

	// Sandbox Configuration
	NsjailPath     string `env:"NSJAIL_PATH" envDefault:"/usr/bin/nsjail"`
	PythonPath     string `env:"PYTHON_PATH" envDefault:"/usr/bin/python3"`
	DisableSandbox bool   `env:"DISABLE_SANDBOX" envDefault:"false"`

	// Execution Limits
	MaxConcurrentExecutions int `env:"MAX_CONCURRENT_EXECUTIONS" envDefault:"10"`
	DefaultTimeoutMS        int `env:"DEFAULT_TIMEOUT_MS" envDefault:"10000"`
	MaxCodeBytes     int `env:"MAX_CODE_BYTES" envDefault:"102400"`
	MaxStdinBytes    int `env:"MAX_STDIN_BYTES" envDefault:"1048576"`
	MaxOutputBytes   int `env:"MAX_OUTPUT_BYTES" envDefault:"1048576"`
	MaxFiles         int `env:"MAX_FILES" envDefault:"5"`
	MaxFileBytes     int `env:"MAX_FILE_BYTES" envDefault:"10240"`

	// Redis (for distributed rate limiting)
	RedisHost string `env:"REDIS_HOST"`
	RedisPort int    `env:"REDIS_PORT" envDefault:"6379"`

	// Tracing Configuration
	TracingEnabled    bool    `env:"TRACING_ENABLED" envDefault:"false"`
	TracingSampleRate float64 `env:"TRACING_SAMPLE_RATE" envDefault:"0.01"`
}

// Load parses environment variables and returns a Config struct.
func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
