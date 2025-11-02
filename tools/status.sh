#!/bin/bash
echo "📊 Container Status:"
docker compose -f ../.devcontainer/docker-compose.yml ps
echo ""
echo "💾 Volume Usage:"
docker volume ls | grep dungeons-and-dragons
echo ""
echo "📊 Resource Usage:"
docker stats --no-stream
