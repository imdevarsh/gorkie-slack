#!/bin/bash

set -euo pipefail

# Copy app env files
if [[ -f "apps/bot/.env" ]]; then
  echo "apps/bot/.env already exists; skipping copy"
else
  cp apps/bot/.env.example apps/bot/.env
fi

if [[ -f "apps/server/.env" ]]; then
  echo "apps/server/.env already exists; skipping copy"
else
  cp apps/server/.env.example apps/server/.env
fi

# Install dependencies
bun install
