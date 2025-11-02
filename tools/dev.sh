#!/bin/bash
set -e

echo "🚀 Starting development environment..."

# Start containers
docker compose -f ../.devcontainer/docker-compose.yml up -d

echo "⏳ Waiting for services to be ready..."
sleep 3

# Check if services are healthy
if docker compose -f ../.devcontainer/docker-compose.yml ps | grep -q "unhealthy"; then
    echo "❌ Some services are unhealthy. Check logs:"
    echo "   docker compose -f ../.devcontainer/docker-compose.yml logs"
    exit 1
fi

echo "✅ Services are running!"
echo ""
echo "📦 Services available:"
echo "   • App:        http://localhost:3000"
echo "   • PostgreSQL: localhost:5432"
echo "   • Redis:      localhost:6379"
echo ""
echo "🔧 Useful commands:"
echo "   • Enter shell:  ./shell.sh"
echo "   • View logs:    ./logs.sh"
echo "   • Stop:         ./stop.sh"
echo "   • Restart:      ./restart.sh"
echo ""
echo "💡 Edit files in your IDE, they sync automatically!"
