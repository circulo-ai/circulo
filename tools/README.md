# Development Environment Setup

> **Works with ANY IDE/Editor:** VS Code, IntelliJ, WebStorm, Vim, Cursor, Zed, Sublime, etc.

This project uses Docker containers to ensure everyone has the **exact same development environment**, regardless of operating system or IDE choice.

## 🚀 Quick Start (3 commands)

```bash
# 1. Make setup script executable
chmod +x setup.sh

# 2. Run first-time setup
./setup.sh

# 3. Edit your environment variables (REQUIRED)
nano web/.env  # or use your preferred editor
```

Then choose your workflow:

### Option A: VS Code (Easiest)
1. Install "Dev Containers" extension
2. Press `F1` → "Dev Containers: Reopen in Container"
3. Terminal opens inside container automatically
4. Run: `pnpm dev`

### Option B: Any Other IDE
1. Run: `./dev.sh` (starts containers)
2. Edit files in your IDE (they sync automatically)
3. Run commands: `./exec.sh pnpm dev`
4. Or enter container: `./shell.sh` then run commands

## 📋 Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
  - Windows: Requires WSL 2
  - Mac: Just install Docker Desktop
  - Linux: Install docker + docker-compose
- **Git** (for version control)
- **Your favorite IDE/editor**

**Installation links:**
- Docker Desktop: https://www.docker.com/products/docker-desktop
- Git: https://git-scm.com/downloads

## 🛠️ Available Commands (All Platforms)

All team members can use these convenience scripts:

| Command | Description |
|---------|-------------|
| `./setup.sh` | First-time setup (run once) |
| `./dev.sh` | Start development environment |
| `./shell.sh` | Enter container shell |
| `./stop.sh` | Stop containers (keep data) |
| `./restart.sh` | Restart containers |
| `./logs.sh [service]` | View logs |
| `./status.sh` | Check container status |
| `./clean.sh` | Remove all containers & data |
| `./reset.sh` | Full rebuild from scratch |
| `./db.sh` | Connect to PostgreSQL |
| `./redis-cli.sh` | Connect to Redis CLI |
| `./install.sh <pkg>` | Install npm package |
| `./exec.sh <cmd>` | Run command in container |

**Example workflows:**

```bash
# Install a package
./install.sh axios

# Run tests
./exec.sh pnpm test

# Check database
./db.sh

# View app logs
./logs.sh app

# Full reset (if things break)
./reset.sh
```

## 🎯 What's Included

Your development environment includes:

- **Node.js 20** with pnpm, npm, yarn
- **PostgreSQL 17** with pgvector extension
- **Redis 7** for caching/sessions
- **System tools:** git, curl, GitHub CLI, postgresql-client, redis-tools
- **Shell:** Zsh with Oh My Zsh

Everything is pre-configured and ready to use!

## 📁 Project Structure

```
your-project/
├── .devcontainer/         ← Docker/VS Code config
│   ├── devcontainer.json  ← VS Code specific
│   ├── docker-compose.yml ← Service definitions
│   ├── Dockerfile         ← Container image
│   └── *.sh              ← Setup scripts
├── web/                   ← Your application code
│   ├── .env              ← Your secrets (create from .env.example)
│   ├── .env.example      ← Template
│   └── ...
├── *.sh                   ← Convenience scripts (dev.sh, shell.sh, etc.)
└── README.md             ← This file
```

## 🔌 Accessing Services

Once containers are running:

| Service | From Your Computer | From Container |
|---------|-------------------|----------------|
| **Your App** | http://localhost:3000 | http://localhost:3000 |
| **PostgreSQL** | localhost:5432 | postgres:5432 |
| **Redis** | localhost:6379 | redis:6379 |

### Database Connection Details

```
Host:     localhost (or postgres from inside container)
Port:     5432
Database: app
User:     postgres
Password: postgres
```

**GUI Tools:** Use DBeaver, TablePlus, pgAdmin, etc. with above credentials

### Environment Variables

Your app automatically gets:
```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app
REDIS_URL=redis://redis:6379
NODE_ENV=development
```

Add your own in `web/.env`:
```env
NEXTAUTH_SECRET=your-secret-here
OPENAI_API_KEY=sk-...
# etc.
```

## 🖥️ IDE-Specific Instructions

<details>
<summary><b>VS Code (Click to expand)</b></summary>

**Setup:**
1. Install extension: "Dev Containers"
2. Open project folder
3. Click "Reopen in Container" notification (or F1 → "Dev Containers: Reopen in Container")

**Features:**
- Terminal opens inside container automatically
- Extensions install inside container
- IntelliSense works perfectly
- Debugging works seamlessly

**Daily usage:**
- Just open VS Code - it reconnects automatically
- Run `pnpm dev` in integrated terminal
</details>

<details>
<summary><b>JetBrains (IntelliJ, WebStorm, etc.) - Click to expand</b></summary>

**Setup:**
1. Start containers: `./dev.sh`
2. In IDE: Settings → Build, Execution, Deployment → Docker
3. Connect to Docker daemon
4. (Optional) Install "Remote Development" plugin for better integration

**Daily usage:**
```bash
# Terminal 1: Start services
./dev.sh

# Terminal 2: Run commands
./exec.sh pnpm dev

# Or use IDE's terminal after connecting to container
```

**Database:**
- Add Data Source (PostgreSQL)
- Host: localhost, Port: 5432
- Database: app, User: postgres, Pass: postgres
</details>

<details>
<summary><b>Cursor, Zed, Sublime, Vim, Emacs, etc. - Click to expand</b></summary>

**Setup:**
1. Start containers: `./dev.sh`
2. Edit files in your IDE (they sync automatically)
3. Run commands via `./exec.sh` or `./shell.sh`

**Daily usage:**
```bash
# Start environment
./dev.sh

# Enter container for commands
./shell.sh
cd /workspace/web
pnpm dev

# Or run one-off commands
./exec.sh pnpm test
./exec.sh pnpm build
```

**Tips:**
- LSP/formatters: Configure on host or in container
- File watching: Works automatically
- Git: Use on host machine (no need to be in container)
</details>

## 🐛 Troubleshooting

### Containers won't start

```bash
# Check Docker is running
docker ps

# View logs
./logs.sh

# Try full reset
./reset.sh
```

### Port already in use

Stop your local PostgreSQL/Redis:
```bash
# Windows
net stop postgresql-x64-XX
net stop Redis

# Mac
brew services stop postgresql redis

# Linux
sudo systemctl stop postgresql redis
```

Or change ports in `.devcontainer/docker-compose.yml`

### Permission errors (Windows)

Clone your repo inside WSL for best results:
```bash
wsl
cd ~
git clone <your-repo>
```

### Changes not reflecting

```bash
# Restart containers
./restart.sh

# Or full reset
./reset.sh
```

### "Works on my machine"

That shouldn't happen with Docker! But if it does:
```bash
# Everyone runs this to get same state
./clean.sh
./setup.sh
```

## 🔄 Git Workflow

Git works **normally** from your host machine - no need to be inside container:

```bash
git status
git add .
git commit -m "Your message"
git push
```

The `.gitattributes` file ensures everyone has consistent line endings across Windows/Mac/Linux.

## 👥 Team Collaboration

### When joining the project:

1. Clone repo
2. Run `./setup.sh`
3. Edit `web/.env`
4. Start coding!

### When pulling changes:

```bash
git pull

# If package.json changed:
./exec.sh pnpm install

# If database schema changed:
./exec.sh pnpm drizzle-kit push
```

### When pushing changes:

```bash
# Run tests first
./exec.sh pnpm test

# Then commit and push normally
git add .
git commit -m "Your changes"
git push
```

## 📊 Monitoring

```bash
# Check what's running
./status.sh

# Watch logs in real-time
./logs.sh

# Check specific service
./logs.sh postgres
./logs.sh redis
./logs.sh app
```

## 🧹 Cleanup

```bash
# Stop but keep data
./stop.sh

# Remove everything (including database)
./clean.sh

# Start fresh
./setup.sh
```

## ⚙️ Advanced

### Customizing the environment

Edit these files:
- **Add system packages:** `.devcontainer/Dockerfile`
- **Add services:** `.devcontainer/docker-compose.yml`
- **Change Node version:** `.devcontainer/Dockerfile` (line 1)
- **Change ports:** `.devcontainer/docker-compose.yml`

After changes: `./reset.sh`

### Running multiple projects

Each project's containers are isolated by project name. Just run `./dev.sh` in each project directory.

### Performance tuning

**Docker Desktop Settings:**
- RAM: 4GB minimum, 8GB recommended
- Disk: 20GB minimum
- CPU: 2+ cores

## 🆘 Getting Help

1. **Check logs:** `./logs.sh`
2. **Check status:** `./status.sh`
3. **Try reset:** `./reset.sh`
4. **Still stuck?** Share the output of:
   ```bash
   ./logs.sh > logs.txt
   ./status.sh > status.txt
   ```

## 📚 Additional Documentation

- [Universal Setup Guide](./docs/UNIVERSAL_SETUP.md) - Detailed IDE setup
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues
- [Quick Reference](./docs/QUICK_REFERENCE.md) - Daily commands

## ✅ Verify Everything Works

After setup, verify:

```bash
# 1. Check services
./status.sh

# 2. Test database
./db.sh
# In psql: \l (should see 'app' database)
# Then: \q

# 3. Test Redis
./redis-cli.sh
# In redis: PING (should return PONG)
# Then: exit

# 4. Start app
./exec.sh pnpm dev
# Visit http://localhost:3000
```

If all of the above work, you're ready to develop! 🎉

## 🎯 Summary

- ✅ **Any IDE works** - VS Code, JetBrains, Vim, anything!
- ✅ **Same environment for everyone** - no more "works on my machine"
- ✅ **Easy to use** - just run `./dev.sh`
- ✅ **Cross-platform** - Windows, Mac, Linux
- ✅ **Isolated** - doesn't interfere with your system
- ✅ **Fast** - thanks to volume caching
- ✅ **Reproducible** - git pull, restart, it works

**Questions?** Check the docs or ask the team!
