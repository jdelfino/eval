#!/bin/bash
# post-start.sh - Start background services
# Runs via postStartCommand (every container start, including restarts)
set -e

# Start beads daemon with auto-push (commits and pushes to sync branch automatically)
bd daemon start --auto-push 2>/dev/null || true

# Generate GitHub App installation token (for Claude's sandboxed identity)
.devcontainer/setup-github-app.sh || true
