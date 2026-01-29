# Multi-stage Dockerfile for the executor service.
#
# NOTE: nsjail requires Linux kernel capabilities at runtime.
# The Kubernetes pod spec must grant securityContext with at minimum
# CAP_SYS_ADMIN (for user namespaces), CAP_SYS_CHROOT, CAP_SETUID,
# CAP_SETGID, and CAP_NET_ADMIN. For local development, use:
#   docker run --privileged -p 8081:8081 executor
#
# The runtime image uses debian (not alpine/scratch) because nsjail
# requires glibc and libnl.

# ---------------------------------------------------------------------------
# Stage 1: Build nsjail from source
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS nsjail-builder

RUN apt-get update && apt-get install -y \
    build-essential git protobuf-compiler pkg-config flex bison \
    libprotobuf-dev libnl-3-dev libnl-route-3-dev \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/google/nsjail.git /nsjail

WORKDIR /nsjail

RUN make

# ---------------------------------------------------------------------------
# Stage 2: Build Go binary
# ---------------------------------------------------------------------------
FROM golang:1.24-alpine AS go-builder

WORKDIR /app

# Copy shared packages first (needed by replace directives in go.mod).
COPY pkg/ /pkg/

COPY executor/go.mod executor/go.sum ./
RUN go mod download

COPY executor/ .
RUN CGO_ENABLED=0 go build \
    -ldflags="-w -s" \
    -o /app/executor \
    ./cmd/executor

# ---------------------------------------------------------------------------
# Stage 3: Runtime
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 ca-certificates \
    libprotobuf32 libnl-3-200 libnl-route-3-200 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-builder /nsjail/nsjail /usr/bin/nsjail
COPY --from=go-builder /app/executor /executor

# Create an empty chroot directory. nsjail uses this as the filesystem root
# for sandboxed processes, so only explicitly bind-mounted paths are visible.
# This prevents student code from reading host files like /etc/passwd or /proc.
RUN mkdir -p /sandbox-root

# NOTE: The executor process must run as root so nsjail can create namespaces
# and chroot. Student code runs as nobody (UID 65534) inside the jail via
# nsjail's --user flag.

EXPOSE 8081

ENTRYPOINT ["/executor"]
