#!/bin/bash
echo "🔄 Restarting containers..."
docker compose -f ../.devcontainer/docker-compose.yml restart
echo "✅ Containers restarted"
