#!/bin/bash

echo "Running post-start checks..."

# Navigate to web directory if it exists
if [ -d "/workspace/web" ]; then
  cd /workspace/web
else
  echo "ERROR: /workspace/web directory not found"
  exit 1
fi

# Set PostgreSQL password for non-interactive commands
export PGPASSWORD=postgres

# Verify PostgreSQL connection (use service name, not localhost)
if pg_isready -h postgres -p 5432 -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running"

    # Try to connect to the app database
    if psql -h postgres -U postgres -d app -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ Database 'app' is accessible"
    else
        echo "⚠️  Database 'app' is not accessible"
    fi
else
    echo "⚠️  PostgreSQL is not accessible"
fi

# Verify Redis connection (use service name, not localhost)
if redis-cli -h redis ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "⚠️  Redis is not accessible"
fi

# Clean up password variable
unset PGPASSWORD

# Check if .env exists
if [ -f ".env" ]; then
    echo "✅ .env file exists"
else
    echo "⚠️  .env file not found - copy from .env.example"
fi

echo ""
echo "=========================================="
echo "🚀 Container is ready for development!"
echo "=========================================="
echo ""
echo "Run 'pnpm dev' to start the development server"
