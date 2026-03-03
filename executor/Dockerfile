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
# Stage 2: Build Java tracer JAR (use JDK 21 for compilation)
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk AS java-builder

WORKDIR /java-tracer

COPY executor/internal/tracer/java/*.java ./
RUN javac *.java && jar cf java-tracer.jar *.class

# ---------------------------------------------------------------------------
# Stage 3: Build Go binary
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
# Stage 4: Runtime
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 ca-certificates \
    libprotobuf32 libnl-3-200 libnl-route-3-200 \
  && rm -rf /var/lib/apt/lists/*

# Copy JDK 21 from the Temurin builder stage (Debian bookworm only packages JDK 17).
ENV JAVA_HOME=/usr/lib/jvm/temurin-21
COPY --from=java-builder /opt/java/openjdk ${JAVA_HOME}
RUN ln -s ${JAVA_HOME}/bin/java /usr/bin/java \
 && ln -s ${JAVA_HOME}/bin/javac /usr/bin/javac

COPY --from=nsjail-builder /nsjail/nsjail /usr/bin/nsjail
COPY --from=go-builder /app/executor /executor
COPY --from=java-builder /java-tracer/java-tracer.jar /usr/lib/java-tracer.jar
COPY executor/seccomp-python.policy /etc/nsjail/seccomp-python.policy
COPY executor/seccomp-java.policy /etc/nsjail/seccomp-java.policy

# Register JDK shared libraries so the dynamic linker finds libjli.so inside the sandbox.
RUN echo "${JAVA_HOME}/lib" > /etc/ld.so.conf.d/jdk.conf && ldconfig

# Create the chroot directory with pre-created mount points. nsjail uses this
# as the filesystem root for sandboxed processes, so only explicitly bind-mounted
# paths are visible. Mount point directories must exist because the chroot root
# is remounted read-only before bind mounts are applied.
RUN mkdir -p /sandbox-root/usr/bin /sandbox-root/usr/lib /sandbox-root/lib \
    /sandbox-root/lib64 /sandbox-root/dev /sandbox-root/tmp \
    /sandbox-root/usr/lib/jvm /sandbox-root/etc \
 && touch /sandbox-root/etc/ld.so.cache

# NOTE: The executor process must run as root so nsjail can create namespaces
# and chroot. Student code runs as nobody (UID 65534) inside the jail via
# nsjail's --user flag.

EXPOSE 8081

ENTRYPOINT ["/executor"]
