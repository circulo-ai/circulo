FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

# Install essential tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack and activate the exact pnpm version from packageManager
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Verify pnpm installation
RUN pnpm --version

# Create workspace directory (source is mounted via docker-compose)
RUN mkdir -p /workspaces/web && chown -R node:node /workspaces/web

# Set working directory
WORKDIR /workspaces/web

# Switch to node user
USER node

# Default shell
SHELL ["/bin/bash", "-lc"]