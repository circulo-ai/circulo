FROM node:20-bullseye

# Install additional OS packages including GitHub CLI
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    postgresql-client \
    redis-tools \
    git \
    curl \
    gnupg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Set up non-root user
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Configure node user
RUN if [ "$USER_GID" != "1000" ] || [ "$USER_UID" != "1000" ]; then \
    groupmod --gid $USER_GID $USERNAME \
    && usermod --uid $USER_UID --gid $USER_GID $USERNAME \
    && chown -R $USER_UID:$USER_GID /home/$USERNAME; \
    fi

# Install global npm packages as root
RUN npm install -g pnpm@latest drizzle-kit@latest

# Install sudo for permission fixes
RUN apt-get update && apt-get install -y sudo && \
    echo "node ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Create directories with proper ownership BEFORE switching user
RUN mkdir -p /workspace/web && \
    mkdir -p /home/$USERNAME/.local/share/pnpm/store && \
    mkdir -p /home/$USERNAME/.local/share/pnpm/.tools && \
    mkdir -p /home/$USERNAME/.cache && \
    chown -R $USERNAME:$USERNAME /workspace && \
    chown -R $USERNAME:$USERNAME /home/$USERNAME

USER $USERNAME

WORKDIR /workspace/web
