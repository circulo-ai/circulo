#!/bin/bash
echo "🛑 Stopping containers..."
docker compose -f ../.devcontainer/docker-compose.yml stop
echo "✅ Containers stopped. Data is preserved."
echo "   Run ./dev.sh to start again"
