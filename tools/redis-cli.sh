#!/bin/bash
docker compose -f ../.devcontainer/docker-compose.yml exec redis redis-cli
