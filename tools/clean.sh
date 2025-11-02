#!/bin/bash
echo "⚠️  WARNING: This will delete all data (database, redis, etc.)"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    echo "🧹 Cleaning up..."
    docker compose -f ../.devcontainer/docker-compose.yml down -v
    echo "✅ All containers and data removed"
    echo "   Run ./dev.sh to start fresh"
else
    echo "❌ Cancelled"
fi
