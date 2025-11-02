#!/bin/bash
set -e

echo "🎉 Welcome to the project setup!"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is not installed. Please install Docker Desktop."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "❌ Git is not installed. Please install Git."; exit 1; }
echo "✅ Prerequisites met"
echo ""

# Make scripts executable
echo "Making scripts executable..."
chmod +x *.sh
echo "✅ Scripts are now executable"
echo ""

# Copy env file
if [ ! -f "web/.env" ]; then
    if [ -f "web/.env.example" ]; then
        echo "Creating .env file..."
        cp web/.env.example web/.env
        echo "✅ .env created from .env.example"
        echo "⚠️  IMPORTANT: Edit web/.env and add your actual API keys!"
    else
        echo "⚠️  WARNING: No .env.example found"
    fi
else
    echo "✅ .env already exists"
fi
echo ""

# Start containers
echo "Starting containers (this may take 5-10 minutes on first run)..."
docker compose -f ../.devcontainer/docker-compose.yml up -d

echo ""
echo "⏳ Waiting for setup to complete..."
docker compose -f ../.devcontainer/docker-compose.yml logs -f app &
LOGS_PID=$!

# Wait for setup completion marker
max_wait=300  # 5 minutes
waited=0
until docker compose -f ../.devcontainer/docker-compose.yml exec -T app test -f /tmp/.devcontainer-setup-done 2>/dev/null || [ $waited -ge $max_wait ]; do
    sleep 5
    waited=$((waited + 5))
done

kill $LOGS_PID 2>/dev/null || true

if [ $waited -ge $max_wait ]; then
    echo "❌ Setup timed out. Check logs with: ./logs.sh"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Edit web/.env with your API keys"
echo "   2. Run: ./shell.sh (to enter container)"
echo "   3. Run: pnpm dev (to start dev server)"
echo ""
echo "💡 Or start development with: ./dev.sh"
