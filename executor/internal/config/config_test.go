package config

import (
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Clear all env vars that Load() reads so defaults are tested in isolation.
	t.Setenv("PORT", "")
	t.Setenv("ENVIRONMENT", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("GCP_PROJECT_ID", "")
	t.Setenv("NSJAIL_PATH", "")
	t.Setenv("PYTHON_PATH", "")
	t.Setenv("JAVA_PATH", "")
	t.Setenv("JAVAC_PATH", "")
	t.Setenv("DEFAULT_TIMEOUT_MS", "")
	t.Setenv("MAX_CODE_BYTES", "")
	t.Setenv("MAX_STDIN_BYTES", "")
	t.Setenv("MAX_OUTPUT_BYTES", "")
	t.Setenv("MAX_FILES", "")
	t.Setenv("MAX_FILE_BYTES", "")
	t.Setenv("MAX_CONCURRENT_EXECUTIONS", "")
	t.Setenv("TRACING_ENABLED", "")
	t.Setenv("TRACING_SAMPLE_RATE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	tests := []struct {
		name string
		got  any
		want any
	}{
		{"Port", cfg.Port, 8081},
		{"Environment", cfg.Environment, "local"},
		{"LogLevel", cfg.LogLevel, "info"},
		{"NsjailPath", cfg.NsjailPath, "/usr/bin/nsjail"},
		{"PythonPath", cfg.PythonPath, "/usr/bin/python3"},
		{"JavaPath", cfg.JavaPath, "/usr/bin/java"},
		{"JavacPath", cfg.JavacPath, "/usr/bin/javac"},
		{"DefaultTimeoutMS", cfg.DefaultTimeoutMS, 10000},
		{"MaxCodeBytes", cfg.MaxCodeBytes, 102400},
		{"MaxStdinBytes", cfg.MaxStdinBytes, 1048576},
		{"MaxOutputBytes", cfg.MaxOutputBytes, 1048576},
		{"MaxFiles", cfg.MaxFiles, 5},
		{"MaxFileBytes", cfg.MaxFileBytes, 10240},
		{"MaxConcurrentExecutions", cfg.MaxConcurrentExecutions, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %v, want %v", tt.got, tt.want)
			}
		})
	}
}

func TestLoadTracingDefaults(t *testing.T) {
	t.Setenv("TRACING_ENABLED", "")
	t.Setenv("TRACING_SAMPLE_RATE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.TracingEnabled != false {
		t.Errorf("TracingEnabled = %v, want false", cfg.TracingEnabled)
	}
	if cfg.TracingSampleRate != 0.01 {
		t.Errorf("TracingSampleRate = %v, want 0.01", cfg.TracingSampleRate)
	}
}

func TestLoadTracingCustomValues(t *testing.T) {
	t.Setenv("TRACING_ENABLED", "true")
	t.Setenv("TRACING_SAMPLE_RATE", "0.25")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if !cfg.TracingEnabled {
		t.Errorf("TracingEnabled = %v, want true", cfg.TracingEnabled)
	}
	if cfg.TracingSampleRate != 0.25 {
		t.Errorf("TracingSampleRate = %v, want 0.25", cfg.TracingSampleRate)
	}
}

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("ENVIRONMENT", "production")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("NSJAIL_PATH", "/opt/nsjail")
	t.Setenv("PYTHON_PATH", "/opt/python3")
	t.Setenv("DEFAULT_TIMEOUT_MS", "5000")
	t.Setenv("MAX_CODE_BYTES", "50000")
	t.Setenv("MAX_STDIN_BYTES", "500000")
	t.Setenv("MAX_OUTPUT_BYTES", "500000")
	t.Setenv("MAX_FILES", "10")
	t.Setenv("MAX_FILE_BYTES", "20480")
	t.Setenv("MAX_CONCURRENT_EXECUTIONS", "20")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.Port != 9090 {
		t.Errorf("Port = %d, want 9090", cfg.Port)
	}
	if cfg.Environment != "production" {
		t.Errorf("Environment = %s, want production", cfg.Environment)
	}
	if cfg.NsjailPath != "/opt/nsjail" {
		t.Errorf("NsjailPath = %s, want /opt/nsjail", cfg.NsjailPath)
	}
	if cfg.DefaultTimeoutMS != 5000 {
		t.Errorf("DefaultTimeoutMS = %d, want 5000", cfg.DefaultTimeoutMS)
	}
	if cfg.MaxFiles != 10 {
		t.Errorf("MaxFiles = %d, want 10", cfg.MaxFiles)
	}
	if cfg.MaxFileBytes != 20480 {
		t.Errorf("MaxFileBytes = %d, want 20480", cfg.MaxFileBytes)
	}
	if cfg.MaxConcurrentExecutions != 20 {
		t.Errorf("MaxConcurrentExecutions = %d, want 20", cfg.MaxConcurrentExecutions)
	}
}
