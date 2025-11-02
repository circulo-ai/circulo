# Universal DevContainer Setup - Any IDE/Editor

## Overview

This devcontainer works with **any IDE or editor** by using Docker Compose directly. VS Code users get extra features, but everyone can develop with the same environment.

## 🎯 Quick Start (Any IDE)

### Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose on Linux)
- Git
- Your preferred IDE/editor

### Starting the Environment

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd <your-repo>

# 2. Start the containers
docker compose -f .devcontainer/docker-compose.yml up -d

# 3. Enter the development container
docker compose -f .devcontainer/docker-compose.yml exec app bash

# 4. Navigate to web directory (if needed)
cd /workspace/web

# 5. Start development server
pnpm dev
```

That's it! Your IDE can now:
- Edit files on your host machine (they sync automatically)
- Connect to localhost:3000 (your app)
- Connect to localhost:5432 (PostgreSQL)
- Connect to localhost:6379 (Redis)

### Stopping the Environment

```bash
# Stop containers (keeps data)
docker compose -f .devcontainer/docker-compose.yml stop

# Stop and remove containers (keeps data)
docker compose -f .devcontainer/docker-compose.yml down

# Stop and remove everything including data
docker compose -f .devcontainer/docker-compose.yml down -v
```

## 🖥️ IDE-Specific Setup

### VS Code (Recommended - Best Integration)
1. Install "Dev Containers" extension
2. Press F1 → "Dev Containers: Reopen in Container"
3. Everything is automatic ✨

**Advantages:**
- Automatic container connection
- Terminal opens inside container
- Extensions install inside container
- IntelliSense works perfectly
- Debugging works seamlessly

---

### JetBrains IDEs (IntelliJ, WebStorm, PyCharm)

**Option 1: Docker Integration (Easier)**
1. Open project folder in your IDE
2. Go to Settings → Docker
3. Connect to Docker daemon
4. Run containers:
   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d
   ```
5. Use IDE's terminal or external terminal to exec into container

**Option 2: Remote Development (Better)**
1. Install "Remote Development" plugin
2. Start containers:
   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d
   ```
3. In IDE: Tools → Remote Development → Docker → Connect to running container
4. Select `dungeons-and-dragons_devcontainer-app-1`

**Database Setup:**
- Add Data Source: PostgreSQL
- Host: `localhost`, Port: `5432`
- Database: `app`, User: `postgres`, Password: `postgres`

---

### Cursor, Zed, Sublime Text, Vim, Emacs, etc.

**Setup:**
1. Start containers:
   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d
   ```

2. Edit files in your IDE on your host machine
   - Files sync automatically via Docker volumes
   - No special configuration needed

3. Run commands in container:
   ```bash
   # Open a shell in the container
   docker compose -f .devcontainer/docker-compose.yml exec app bash

   # Or run one-off commands
   docker compose -f .devcontainer/docker-compose.yml exec app pnpm dev
   ```

**For Neovim/Vim users:**
- LSP, linters, formatters work if configured on host
- Or install them inside container and use `docker exec` workflow

---

### GitHub Codespaces
1. Click "Code" → "Codespaces" → "Create codespace"
2. It automatically uses `.devcontainer/devcontainer.json`
3. Works identically to VS Code

---

## 🔧 Common Tasks (All IDEs)

### Running Commands in Container

```bash
# Method 1: Exec into container
docker compose -f .devcontainer/docker-compose.yml exec app bash
cd /workspace/web
pnpm dev

# Method 2: One-off commands
docker compose -f .devcontainer/docker-compose.yml exec app pnpm --dir /workspace/web dev

# Method 3: Interactive shell
docker compose -f .devcontainer/docker-compose.yml exec -it app zsh
```

### Database Access

**From Host Machine:**
```bash
# Using psql (if installed locally)
psql -h localhost -p 5432 -U postgres -d app

# Using Docker
docker compose -f .devcontainer/docker-compose.yml exec postgres psql -U postgres -d app
```

**Database GUI Tools:**
- **DBeaver**, **TablePlus**, **pgAdmin**, etc.
- Host: `localhost`, Port: `5432`
- Database: `app`, User: `postgres`, Password: `postgres`

### Redis Access

```bash
# From host (if redis-cli installed)
redis-cli -h localhost -p 6379

# From Docker
docker compose -f .devcontainer/docker-compose.yml exec redis redis-cli
```

### Git Operations

**Works normally from host machine** - no need to be inside container:
```bash
git status
git add .
git commit -m "Your message"
git push
```

The `.gitattributes` file ensures everyone has consistent line endings.

## 📦 Package Management

### Installing Dependencies

```bash
# From inside container
docker compose -f .devcontainer/docker-compose.yml exec app bash
cd /workspace/web
pnpm install <package-name>

# Or one-liner from host
docker compose -f .devcontainer/docker-compose.yml exec app pnpm --dir /workspace/web install <package-name>
```

**Important:** Always install packages from inside the container to ensure compatibility!

## 🚀 Team Workflow

### Daily Workflow (Non-VS Code Users)

```bash
# Morning - Start work
docker compose -f .devcontainer/docker-compose.yml up -d
docker compose -f .devcontainer/docker-compose.yml exec app bash
cd /workspace/web
pnpm dev

# Edit files in your IDE
# (Files on host machine automatically sync to container)

# Run tests, build, etc.
pnpm test
pnpm build

# Evening - End work
docker compose -f .devcontainer/docker-compose.yml stop
```

### First-Time Setup (New Team Member)

```bash
# 1. Clone repo
git clone <repo-url>
cd <repo-name>

# 2. Copy environment file
cp web/.env.example web/.env
# Edit web/.env with your values

# 3. Start containers (first time takes 5-10 min)
docker compose -f .devcontainer/docker-compose.yml up -d

# 4. Wait for setup to complete (watch logs)
docker compose -f .devcontainer/docker-compose.yml logs -f app

# 5. When you see "Post-create setup complete!", press Ctrl+C

# 6. Enter container and start coding
docker compose -f .devcontainer/docker-compose.yml exec app bash
cd /workspace/web
pnpm dev
```

## 🔍 Troubleshooting

### "Container not found" or "No such service"

Make sure you're in the project root directory and containers are running:
```bash
docker compose -f .devcontainer/docker-compose.yml ps
```

### "Cannot connect to database"

Check if PostgreSQL is healthy:
```bash
docker compose -f .devcontainer/docker-compose.yml ps postgres
docker compose -f .devcontainer/docker-compose.yml logs postgres
```

### "Port already in use"

Stop local services or change ports in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Change host port
  - "5433:5432"  # Change host port
```

### Code changes not reflecting

Files should sync automatically. If not:
```bash
# Restart container
docker compose -f .devcontainer/docker-compose.yml restart app
```

## 🎯 IDE Feature Comparison

| Feature | VS Code | JetBrains | Other IDEs |
|---------|---------|-----------|------------|
| Auto container startup | ✅ | ❌ | ❌ |
| Terminal in container | ✅ | ✅ (with plugin) | ❌ |
| IntelliSense from container | ✅ | ✅ (with plugin) | Varies |
| Debugging in container | ✅ | ✅ (with plugin) | Varies |
| File sync | ✅ | ✅ | ✅ |
| Database access | ✅ | ✅ | Via GUI tools |
| Git integration | ✅ | ✅ | ✅ |
| Ease of setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 📝 Shell Aliases (Optional)

Add these to your `~/.bashrc` or `~/.zshrc` for convenience:

```bash
# Docker Compose shortcuts
alias dc='docker compose -f .devcontainer/docker-compose.yml'
alias dcup='docker compose -f .devcontainer/docker-compose.yml up -d'
alias dcdown='docker compose -f .devcontainer/docker-compose.yml down'
alias dcrestart='docker compose -f .devcontainer/docker-compose.yml restart'
alias dclogs='docker compose -f .devcontainer/docker-compose.yml logs -f'

# Container exec shortcuts
alias dex='docker compose -f .devcontainer/docker-compose.yml exec app'
alias desh='docker compose -f .devcontainer/docker-compose.yml exec app bash'

# Quick commands
alias dcdev='docker compose -f .devcontainer/docker-compose.yml exec app pnpm --dir /workspace/web dev'
alias dctest='docker compose -f .devcontainer/docker-compose.yml exec app pnpm --dir /workspace/web test'
```

Then you can just run:
```bash
dcup          # Start containers
desh          # Enter shell
dcdev         # Start dev server
dcdown        # Stop containers
```

## ✅ What Works for Everyone

Regardless of IDE choice, everyone gets:

- ✅ **Same Node.js version** (20)
- ✅ **Same PostgreSQL version** (17 with pgvector)
- ✅ **Same Redis version** (7)
- ✅ **Same system packages**
- ✅ **Same environment variables**
- ✅ **Same database schema** (via migrations)
- ✅ **Consistent line endings** (via .gitattributes)
- ✅ **No "works on my machine" issues**

## 🎓 Learning Resources

- **Docker Compose Docs**: https://docs.docker.com/compose/
- **PostgreSQL Docker**: https://hub.docker.com/_/postgres
- **Redis Docker**: https://hub.docker.com/_/redis

## 🆘 Getting Help

```bash
# Check container status
docker compose -f .devcontainer/docker-compose.yml ps

# View logs
docker compose -f .devcontainer/docker-compose.yml logs app
docker compose -f .devcontainer/docker-compose.yml logs postgres
docker compose -f .devcontainer/docker-compose.yml logs redis

# Check resource usage
docker stats

# Clean everything (nuclear option)
docker compose -f .devcontainer/docker-compose.yml down -v
docker system prune -a
```

---

**Pro Tip:** VS Code users get the smoothest experience, but everyone can be productive with any IDE using the Docker Compose workflow! 🚀
