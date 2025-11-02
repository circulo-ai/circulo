#!/bin/bash
set -e

echo "🚀 Starting post-create setup..."

# Navigate to web directory
if [ -d "/workspace/web" ]; then
  cd /workspace/web
fi


echo "⚙️  Setting safe Git defaults for devcontainer..."
if git rev-parse --show-toplevel > /dev/null 2>&1; then
  git config core.autocrlf input
  git config core.fileMode false
else
  echo "⚠️  Not inside a git repository — skipping git config setup."
fi


# Fix permissions for the workspace (needed for Windows mounts)
if [ ! -f "/tmp/.chown-done" ]; then
    echo "🔧 Fixing permissions..."
    sudo chown -R node:node /workspace/web
    touch /tmp/.chown-done
fi

# Check if setup was already done (for rebuild scenarios)
if [ -f "/tmp/.devcontainer-setup-done" ]; then
    echo "✅ Setup already completed previously, skipping..."
    exit 0
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the project root?"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
if [ -f "pnpm-lock.yaml" ]; then
    pnpm install
elif [ -f "yarn.lock" ]; then
    yarn install
elif [ -f "package-lock.json" ]; then
    npm install
else
    pnpm install
fi

# Copy .env.example to .env if .env doesn't exist
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Remember to update your .env file with actual values!"
fi

DB_HOST=${DB_HOST:-postgres}
REDIS_HOST=${REDIS_HOST:-redis}

# Wait for postgres to be fully ready
echo "⏳ Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0
until pg_isready -h "$DB_HOST" -p 5432 -U postgres > /dev/null 2>&1 || [ $attempt -eq $max_attempts ]; do
    attempt=$((attempt + 1))
    echo "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ PostgreSQL failed to become ready in time"
    exit 1
fi

echo "✅ PostgreSQL is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
max_attempts=30
attempt=0
until redis-cli -h "$REDIS_HOST" ping > /dev/null 2>&1 || [ $attempt -eq $max_attempts ]; do
    attempt=$((attempt + 1))
    echo "Waiting for Redis... (attempt $attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Redis failed to become ready in time"
    exit 1
fi

echo "✅ Redis is ready!"

# Run Drizzle migrations
if [ -f "drizzle.config.ts" ]; then
    echo "🗄️  Running Drizzle migrations..."

    # Generate migrations if the migrations folder doesn't exist or is empty
    if [ ! -d "src/db/migrations" ] || [ -z "$(ls -A src/db/migrations 2>/dev/null)" ]; then
        echo "📝 Generating initial migrations..."
        pnpm drizzle-kit generate || npm run drizzle-kit generate || drizzle-kit generate
    fi

    # Push/migrate the schema
    echo "⬆️  Pushing schema to database..."
    pnpm drizzle-kit push || npm run drizzle-kit push || drizzle-kit push

    echo "✅ Database migrations completed!"
else
    echo "⚠️  drizzle.config.ts not found, skipping migrations"
fi

# Mark setup as complete
touch /tmp/.devcontainer-setup-done

echo "✨ Post-create setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your .env file with actual API keys and secrets"
echo "2. Run 'pnpm dev' (or npm/yarn dev) to start the development server"
echo ""
