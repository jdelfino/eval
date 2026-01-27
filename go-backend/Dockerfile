# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install CA certificates
RUN apk add --no-cache ca-certificates tzdata

# Copy go mod files first (cache layer)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/server \
    ./cmd/server

# Runtime stage
FROM scratch

# Copy timezone data and CA certs
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary
COPY --from=builder /app/server /server

# Non-root user
USER 65534:65534

EXPOSE 8080

ENTRYPOINT ["/server"]
