#!/bin/sh
set -eu

echo "Applying database migrations..."
bun ./node_modules/drizzle-kit/bin.cjs migrate --config=packages/db/drizzle.config.ts

exec bun dist/index.js
