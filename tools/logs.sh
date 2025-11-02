#!/bin/bash
if [ -z "$1" ]; then
    docker compose -f ../.devcontainer/docker-compose.yml logs -f
else
    docker compose -f ../.devcontainer/docker-compose.yml logs -f "$1"
fi
