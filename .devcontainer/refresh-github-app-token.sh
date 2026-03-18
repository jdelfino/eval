#!/bin/bash
# refresh-github-app-token.sh - Regenerate GitHub App token mid-session
# Call this when a push/PR fails with 401. Tokens expire after 1 hour.
exec "$(dirname "$0")/setup-github-app.sh"
