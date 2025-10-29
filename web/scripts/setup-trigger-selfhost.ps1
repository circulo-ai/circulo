Param(
  [string]$RepoDir = "trigger.dev",
  [string]$ApiUrl = "http://localhost:8030"
)

Write-Host "Setting up self-hosted Trigger.dev..." -ForegroundColor Cyan

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$Root\.." | Select-Object -ExpandProperty Path
Set-Location $ProjectRoot

if (-Not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git is required. Please install Git and re-run."; exit 1
}
if (-Not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker Desktop is required. Please install Docker and re-run."; exit 1
}

if (-Not (Test-Path $RepoDir)) {
  git clone https://github.com/triggerdotdev/trigger.dev $RepoDir
} else {
  Write-Host "Repo already exists at '$RepoDir'. Skipping clone." -ForegroundColor Yellow
}

# Webapp
$WebappDir = Join-Path $RepoDir "hosting/docker/webapp"
if (-Not (Test-Path "$WebappDir/.env")) {
  Copy-Item "$WebappDir/.env.example" "$WebappDir/.env"
}

Push-Location $WebappDir
docker compose up -d
Pop-Location

Write-Host "Webapp started. Visit $ApiUrl to create a Project and Worker token." -ForegroundColor Green

# Worker
$WorkerDir = Join-Path $RepoDir "hosting/docker/worker"
if (-Not (Test-Path "$WorkerDir/.env")) {
  Copy-Item "$WorkerDir/.env.example" "$WorkerDir/.env"
}

Write-Host "Add TRIGGER_WORKER_TOKEN to '$WorkerDir/.env' before starting the worker." -ForegroundColor Yellow
Write-Host "Then run: docker compose up -d from $WorkerDir" -ForegroundColor Yellow

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1) Set TRIGGER_API_URL=$ApiUrl and TRIGGER_SECRET_KEY in web/.env" -ForegroundColor Cyan
Write-Host "2) pnpm run trigger:init" -ForegroundColor Cyan
Write-Host "3) pnpm run trigger:deploy" -ForegroundColor Cyan
Write-Host "4) pnpm dev" -ForegroundColor Cyan