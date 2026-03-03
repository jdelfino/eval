#!/bin/bash
# Wrapper around docker CLI that translates /__w paths to /home/runner/work
# for docker compose volume mount resolution in GitHub Actions container jobs.
#
# Only affects `docker compose` — all other docker commands pass through.

if [ "$1" = "compose" ]; then
  shift
  HOST_DIR="${PWD/\/__w//home/runner/work}"
  exec /usr/bin/docker.real compose --project-directory "$HOST_DIR" "$@"
else
  exec /usr/bin/docker.real "$@"
fi
