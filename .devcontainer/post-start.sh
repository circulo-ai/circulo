#!/bin/bash

echo "Running post-start checks..."

# Navigate to web directory if it exists
if [ -d "/workspace/web" ]; then
  cd /workspace/web
else
  echo "ERROR: /workspace/web directory not found"
  exit 1
fi

# Verify PostgreSQL connection (use service name, not localhost)
if pg_isready -h postgres -p 5432 -U postgres > /dev/null 2>&1; then
    echo "PostgreSQL is running"
else
    echo "WARNING: PostgreSQL is not accessible"
fi

# Verify Redis connection (use service name, not localhost)
if redis-cli -h redis ping > /dev/null 2>&1; then
    echo "Redis is running"
else
    echo "WARNING: Redis is not accessible"
fi

# Check if .env exists
if [ -f ".env" ]; then
    echo ".env file exists"
else
    echo "WARNING: .env file not found - copy from .env.example"
fi

echo "Container is ready for development!"
echo "Run 'cd web && pnpm dev' to start the development server"
