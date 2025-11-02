#!/bin/bash
docker compose -f ../.devcontainer/docker-compose.yml exec postgres psql -U postgres -d app
