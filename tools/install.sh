#!/bin/bash
if [ -z "$1" ]; then
    echo "Usage: ./install.sh <package-name>"
    echo "Example: ./install.sh lodash"
    exit 1
fi

echo "📦 Installing $1..."
docker compose -f ../.devcontainer/docker-compose.yml exec app pnpm --dir /workspace/web install "$1"
