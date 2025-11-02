#!/bin/bash
if [ -z "$1" ]; then
    echo "Usage: ./exec.sh <command>"
    echo "Example: ./exec.sh pnpm test"
    exit 1
fi

docker compose -f ../.devcontainer/docker-compose.yml exec app bash -c "cd /workspace/web && $*"
