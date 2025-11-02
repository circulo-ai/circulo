# DevContainer Quick Setup Reference

## 🚀 First Time Setup (5 minutes)

### Prerequisites Checklist
- [ ] Docker Desktop installed and running
- [ ] VS Code installed with "Dev Containers" extension
- [ ] **Windows only**: WSL 2 enabled
- [ ] Git installed

### Setup Steps

1. **Update configuration files** (replace these files):
   ```
   .devcontainer/devcontainer.json
   .devcontainer/docker-compose.yml
   .devcontainer/post-create.sh
   docker/initdb/01-init-extensions.sql (create this)
   .gitattributes (add to project root)
   ```

2. **Clean any existing containers** (in terminal):
   ```bash
   docker compose -f .devcontainer/docker-compose.yml down -v
   ```

3. **Open in DevContainer**:
   - Open VS Code
   - Press `F1` → "Dev Containers: Rebuild and Reopen in Container"
   - Wait 5-10 minutes (first time only)

4. **Verify it works**:
   ```bash
   # You should be inside the container now
   pg_isready -h postgres -U postgres  # Should say "accepting connections"
   redis-cli -h redis ping              # Should say "PONG"
   pnpm dev                             # Starts your dev server
   ```

## ⚡ Daily Usage

### Starting Development
```bash
# 1. Open VS Code
# 2. It auto-connects to container (or press F1 → "Reopen in Container")
# 3. Open terminal in VS Code, run:
cd web
pnpm dev
```

### Accessing Services
- **Your App**: http://localhost:3000
- **PostgreSQL**: `localhost:5432` (from host) or `postgres:5432` (from container)
- **Redis**: `localhost:6379` (from host) or `redis:6379` (from container)

### Common Commands (inside container)
```bash
# Install dependencies
pnpm install

# Run migrations
pnpm drizzle-kit push

# Format code
pnpm format

# Run tests
pnpm test

# Database access
psql -h postgres -U postgres -d app

# Redis CLI
redis-cli -h redis
```

## 🔧 Troubleshooting One-Liners

### Container won't start
```bash
# Stop everything and start fresh
docker compose -f .devcontainer/docker-compose.yml down -v
docker system prune -a  # Warning: removes all unused Docker resources
# Then F1 → "Rebuild and Reopen in Container"
```

### "Port already in use"
```bash
# Stop local services (choose your platform)
# Windows:
net stop postgresql-x64-XX && net stop Redis
# macOS:
brew services stop postgresql && brew services stop redis
# Linux:
sudo systemctl stop postgresql redis
```

### Permission errors (Windows)
```bash
# Clone repo in WSL for best results:
wsl
cd ~
git clone <your-repo>
code .
```

### Git shows all files modified
```bash
# One-time fix:
git add --renormalize .
git commit -m "Normalize line endings"
```

### Slow performance
```bash
# Check Docker resources: Docker Desktop → Settings → Resources
# Recommended: 4GB+ RAM, 20GB+ disk

# Clean build cache:
docker builder prune -a
```

## 🆘 Emergency Recovery

If nothing works:

```bash
# Nuclear option - removes EVERYTHING Docker related
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)
docker volume rm $(docker volume ls -q)
docker network rm $(docker network ls -q)
docker system prune -a --volumes

# Then restart Docker Desktop and try again
```

## 📋 Environment Variables

Create/update `.env` in `/workspace/web/`:

```env
# Automatically set by devcontainer:
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app
REDIS_URL=redis://redis:6379
NODE_ENV=development

# Add your own:
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
# ... other variables
```

## 🖥️ Platform-Specific Notes

### Windows
- ✅ Use WSL 2 (required)
- ✅ Clone repos inside WSL (`~/projects`) for best performance
- ✅ Docker Desktop: Enable "Use WSL 2 based engine"
- ❌ Avoid cloning on C:\ or D:\ drives (slower)

### macOS
- ✅ Docker Desktop → Settings → Resources → File Sharing: Add project directory
- ⚠️ First `pnpm install` may be slow (5-10 min) - be patient
- ✅ Use at least 4GB RAM for Docker

### Linux
- ✅ Add yourself to docker group: `sudo usermod -aG docker $USER` (then logout/login)
- ✅ Install Docker Compose V2
- ✅ Works best out of the box!

## 📞 Getting Help

1. **Check logs**:
   ```bash
   docker compose -f .devcontainer/docker-compose.yml logs postgres
   docker compose -f .devcontainer/docker-compose.yml logs redis
   ```

2. **Check container status**:
   ```bash
   docker compose -f .devcontainer/docker-compose.yml ps
   ```

3. **View full troubleshooting guide**: See `DEVCONTAINER_GUIDE.md`

## ✅ Health Check

Everything working if:
- ✅ Container starts without errors
- ✅ `pg_isready -h postgres -U postgres` succeeds
- ✅ `redis-cli -h redis ping` returns PONG
- ✅ `pnpm dev` starts successfully
- ✅ No git warnings about modified files

## 🎯 Pro Tips

- **Rebuilding**: Only needed when changing Dockerfile or installing new system packages
- **Restarting**: Just close and reopen VS Code - container stays running
- **Multiple terminals**: Open multiple terminals in VS Code - all connect to same container
- **Extensions**: Install extensions inside container (they auto-sync)
- **Git**: Works from inside container - credentials pass through automatically
- **Node modules**: Don't delete the volume - it's optimized for speed

## 📚 Key Files

```
your-project/
├── .devcontainer/
│   ├── devcontainer.json      ← VS Code config
│   ├── docker-compose.yml     ← Services (app, postgres, redis)
│   ├── Dockerfile             ← Container image
│   ├── post-create.sh         ← Runs once on first build
│   └── post-start.sh          ← Runs every time container starts
├── docker/
│   └── initdb/
│       └── pgvector.sql      ← PostgreSQL setup
├── .gitattributes            ← Line ending rules (cross-platform)
└── web/
    ├── .env                   ← Your secrets (create from .env.example)
    └── package.json           ← Project dependencies
```
