#!/bin/bash
echo "🔄 Full reset - this may take a few minutes..."

echo "Stopping containers..."
docker compose -f ../.devcontainer/docker-compose.yml down -v

echo "Rebuilding containers..."
docker compose -f ../.devcontainer/docker-compose.yml build --no-cache

echo "Starting containers..."
docker compose -f ../.devcontainer/docker-compose.yml up -d

echo "✅ Reset complete!"
echo "   Run ./shell.sh to enter the container"
