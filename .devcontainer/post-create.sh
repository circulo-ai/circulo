#!/bin/bash
set -e

echo "Starting post-create setup..."

echo "Setting safe Git defaults for devcontainer..."
if git rev-parse --show-toplevel > /dev/null 2>&1; then
  git config --global core.autocrlf input
  git config --global core.fileMode false
  git config --global core.eol lf
else
  echo "WARNING: Not inside a git repository - skipping git config setup."
fi

# Fix permissions for the workspace (needed for Windows mounts)
if [ ! -f "/tmp/.chown-done" ]; then
    echo "Fixing permissions..."
    sudo chown -R node:node /workspace || echo "WARNING: Could not change ownership"
    touch /tmp/.chown-done
fi

# Check if setup was already done (for rebuild scenarios)
if [ -f "/tmp/.devcontainer-setup-done" ]; then
    echo "Setup already completed previously, skipping..."
    exit 0
fi

# Navigate to web directory
if [ -d "/workspace/web" ]; then
    cd /workspace/web
else
    echo "ERROR: /workspace/web directory not found"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found in /workspace/web"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile || pnpm install
elif [ -f "yarn.lock" ]; then
    yarn install --frozen-lockfile || yarn install
elif [ -f "package-lock.json" ]; then
    npm ci || npm install
else
    pnpm install
fi

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "WARNING: Remember to update your .env file with actual values!"
fi

DB_HOST=${DB_HOST:-postgres}
REDIS_HOST=${REDIS_HOST:-redis}

# Wait for postgres to be fully ready with better error handling
echo "Waiting for PostgreSQL to be ready..."
max_attempts=60
attempt=0
until pg_isready -h "$DB_HOST" -p 5432 -U postgres > /dev/null 2>&1; do
    if [ $attempt -ge $max_attempts ]; then
        echo "ERROR: PostgreSQL failed to become ready in time"
        echo "Checking PostgreSQL logs..."
        docker logs dungeons-and-dragons_devcontainer-postgres-1 2>&1 | tail -20 || true
        exit 1
    fi
    attempt=$((attempt + 1))
    echo "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
    sleep 2
done

echo "PostgreSQL is ready!"

# Verify database exists
echo "Verifying database 'app' exists..."
if ! psql -h "$DB_HOST" -U postgres -lqt | cut -d \| -f 1 | grep -qw app; then
    echo "Creating database 'app'..."
    psql -h "$DB_HOST" -U postgres -c "CREATE DATABASE app;" || echo "Database might already exist"
fi

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
max_attempts=30
attempt=0
until redis-cli -h "$REDIS_HOST" ping > /dev/null 2>&1; do
    if [ $attempt -ge $max_attempts ]; then
        echo "ERROR: Redis failed to become ready in time"
        exit 1
    fi
    attempt=$((attempt + 1))
    echo "Waiting for Redis... (attempt $attempt/$max_attempts)"
    sleep 2
done

echo "Redis is ready!"

# Run Drizzle migrations
if [ -f "drizzle.config.ts" ] || [ -f "drizzle.config.js" ]; then
    echo "Running Drizzle migrations..."

    # Generate migrations if the migrations folder doesn't exist or is empty
    if [ ! -d "src/db/migrations" ] || [ -z "$(ls -A src/db/migrations 2>/dev/null)" ]; then
        echo "Generating initial migrations..."
        pnpm drizzle-kit generate 2>/dev/null || npm run drizzle-kit generate 2>/dev/null || drizzle-kit generate 2>/dev/null || echo "Migration generation skipped"
    fi

    # Push/migrate the schema
    echo "Pushing schema to database..."
    pnpm drizzle-kit push 2>/dev/null || npm run drizzle-kit push 2>/dev/null || drizzle-kit push 2>/dev/null || echo "Schema push skipped"

    echo "Database migrations completed!"
else
    echo "WARNING: drizzle.config.ts/js not found, skipping migrations"
fi

# Mark setup as complete
touch /tmp/.devcontainer-setup-done

echo ""
echo "=========================================="
echo "✓ Post-create setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update your .env file with actual API keys and secrets"
echo "2. Run 'pnpm dev' to start the development server"
echo ""
