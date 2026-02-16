module github.com/jdelfino/eval/executor

go 1.24.0

toolchain go1.24.12

require github.com/jdelfino/eval/pkg/executorapi v0.0.0

require (
	github.com/caarlos0/env/v11 v11.3.1
	github.com/go-chi/chi/v5 v5.2.4
	github.com/jdelfino/eval/pkg/httplog v0.0.0-00010101000000-000000000000
	github.com/jdelfino/eval/pkg/httpmiddleware v0.0.0-00010101000000-000000000000
	github.com/jdelfino/eval/pkg/httputil v0.0.0-00010101000000-000000000000
	github.com/jdelfino/eval/pkg/ratelimit v0.0.0-00010101000000-000000000000
	github.com/jdelfino/eval/pkg/slogutil v0.0.0-00010101000000-000000000000
	github.com/prometheus/client_golang v1.23.2
	github.com/prometheus/client_model v0.6.2
	github.com/redis/go-redis/v9 v9.7.3
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/sys v0.35.0 // indirect
	google.golang.org/protobuf v1.36.8 // indirect
)

replace github.com/jdelfino/eval/pkg/executorapi => ../pkg/executorapi

replace github.com/jdelfino/eval/pkg/httputil => ../pkg/httputil

replace github.com/jdelfino/eval/pkg/httplog => ../pkg/httplog

replace github.com/jdelfino/eval/pkg/slogutil => ../pkg/slogutil

replace github.com/jdelfino/eval/pkg/httpmiddleware => ../pkg/httpmiddleware

replace github.com/jdelfino/eval/pkg/ratelimit => ../pkg/ratelimit
