# Custom E2E test container for GitHub Actions CI.
#
# Based on the official Playwright image (browsers pre-installed),
# adds tools needed by the e2e test scripts:
#   - make (Makefile targets)
#   - docker CLI + compose v2 (infrastructure: postgres, redis, centrifugo, executor)
#   - psmisc (fuser, used by run-e2e-tests.sh)
#
# Also includes a docker wrapper that translates container /__w paths to
# host /home/runner/work paths for docker compose volume mounts.
#
# Rebuild when Playwright version changes in frontend/package.json:
#   ./scripts/build-e2e-container.sh

ARG PLAYWRIGHT_VERSION=v1.57.0
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-noble

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       make \
       docker.io \
       docker-compose-v2 \
       psmisc \
    && rm -rf /var/lib/apt/lists/*

# In GitHub Actions container jobs, the workspace is mounted at /__w inside
# the container but lives at /home/runner/work on the host. Docker compose
# resolves relative volume mounts (e.g. ./centrifugo.json) from the Docker
# daemon's perspective (the host), so /__w paths don't resolve.
#
# This wrapper intercepts `docker compose` calls and injects
# --project-directory with the host-equivalent path.
RUN mv /usr/bin/docker /usr/bin/docker.real
COPY docker-wrapper.sh /usr/bin/docker
RUN chmod +x /usr/bin/docker

# Default shell to bash (GitHub Actions container jobs default to sh)
SHELL ["/bin/bash", "-c"]
