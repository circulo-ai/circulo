#!/bin/bash
set -e

echo "🔄 Running post-start checks..."

# Navigate to web directory
cd /workspace/web

# Verify PostgreSQL connection
if pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running"
else
    echo "⚠️  PostgreSQL is not accessible"
fi

# Verify Redis connection
if redis-cli -h localhost ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "⚠️  Redis is not accessible"
fi

# Check if .env exists
if [ -f ".env" ]; then
    echo "✅ .env file exists"
else
    echo "⚠️  .env file not found - copy from .env.example"
fi

echo "✨ Container is ready for development!"