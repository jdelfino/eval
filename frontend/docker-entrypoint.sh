#!/bin/sh
set -e

# Runtime environment variable substitution for Next.js.
#
# At build time, NEXT_PUBLIC_* env vars are set to placeholder strings
# (e.g. __NEXT_PUBLIC_API_URL__) that get baked into the JS bundles.
# This script replaces those placeholders with actual env var values
# at container start, enabling a single Docker image to be deployed
# across multiple environments.

replace_placeholder() {
  local placeholder="$1"
  local value="$2"

  if [ -n "$value" ]; then
    find /app/.next -type f \( -name '*.js' -o -name '*.html' \) -exec \
      sed -i "s|${placeholder}|${value}|g" {} +
  fi
}

replace_placeholder "__NEXT_PUBLIC_API_URL__" "$NEXT_PUBLIC_API_URL"
replace_placeholder "__NEXT_PUBLIC_FIREBASE_API_KEY__" "$NEXT_PUBLIC_FIREBASE_API_KEY"
replace_placeholder "__NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN__" "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
replace_placeholder "__NEXT_PUBLIC_FIREBASE_PROJECT_ID__" "$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
replace_placeholder "__NEXT_PUBLIC_CENTRIFUGO_URL__" "$NEXT_PUBLIC_CENTRIFUGO_URL"

exec "$@"
