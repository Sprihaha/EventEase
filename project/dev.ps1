# EventEase Local Dev Runner (PowerShell)
# Usage:
#   .\dev.ps1         -> Starts backend, waits for /health, then starts frontend in this terminal
#   .\dev.ps1 down    -> Kills all running backend & frontend processes and frees ports 8000 and 5173

param (
    [string]$Action = "up"
)

function Stop-AllServices {
    Write-Host "`nStopping EventEase services (ports 8000 & 5173)..." -ForegroundColor Red
    $killed = 0
    8000, 5173 | ForEach-Object {
        $pids = (Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue).OwningProcess | Where-Object { $_ -gt 0 } | Select-Object -Unique
        foreach ($p in $pids) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            $killed++
        }
    }
    Get-Process -Name "uvicorn", "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "*EventEase*"
    } | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        $killed++
    }
    if ($killed -gt 0) {
        Write-Host "✅ All EventEase processes have been stopped." -ForegroundColor Green
    } else {
        Write-Host "No active EventEase services were running on ports 8000/5173." -ForegroundColor Gray
    }
}

if ($Action -match "^(down|stop|kill)$" -or ($args -and $args[0] -match "^(down|stop|kill)$")) {
    Stop-AllServices
    exit 0
}

# ── Locate Directories ────────────────────────────────────────────────
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }

if (Test-Path (Join-Path $scriptDir "backend")) {
    $backendDir = Join-Path $scriptDir "backend"
    $frontendDir = Join-Path $scriptDir "frontend"
} elseif (Test-Path (Join-Path $scriptDir "project\backend")) {
    $backendDir = Join-Path $scriptDir "project\backend"
    $frontendDir = Join-Path $scriptDir "project\frontend"
} else {
    $backendDir = Join-Path $scriptDir "project\backend"
    $frontendDir = Join-Path $scriptDir "project\frontend"
}

# Clean any existing zombie processes on 8000 or 5173 before starting
8000, 5173 | ForEach-Object {
    (Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue).OwningProcess |
        Where-Object { $_ -gt 0 } |
        Select-Object -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Starting EventEase in PowerShell" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  * Step 1: Starting Backend API (FastAPI)..." -ForegroundColor Yellow

# Locate virtual environment Python
$backendPy = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $backendPy)) {
    $backendPy = "python"
}

# 1. Start backend attached to this terminal
$backend = Start-Process -FilePath $backendPy `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000" `
    -WorkingDirectory $backendDir `
    -NoNewWindow `
    -PassThru

# 2. Wait for backend /health to report "healthy"
Write-Host "  * Waiting for http://127.0.0.1:8000/health ..." -ForegroundColor Cyan
$maxRetries = 60
$isHealthy = $false

for ($i = 1; $i -le $maxRetries; $i++) {
    if ($backend.HasExited) {
        Write-Host "`n❌ Backend exited prematurely. Check database connection or logs above." -ForegroundColor Red
        exit 1
    }

    # Fast probe via curl.exe
    $output = & curl.exe -s -m 1 http://127.0.0.1:8000/health 2>$null
    if ($output -and $output -match "healthy") {
        $isHealthy = $true
        break
    }

    Start-Sleep -Seconds 1
}

if (-not $isHealthy) {
    Write-Host "`n❌ Backend did not become healthy within timeout." -ForegroundColor Red
    Stop-AllServices
    exit 1
}

Write-Host "`n✅ Backend /health is HEALTHY (Database connected)!" -ForegroundColor Green
Write-Host "  * Step 2: Starting Frontend (Vite)...`n" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  * Backend API:  http://localhost:8000/api/docs" -ForegroundColor Yellow
Write-Host "  * Frontend App: http://localhost:5173" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop, or run '.\dev.ps1 down' in another tab.`n" -ForegroundColor Gray

# 3. Start Frontend attached to this terminal
$frontend = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory $frontendDir `
    -NoNewWindow `
    -PassThru

# Keep running and trap Ctrl+C to terminate both cleanly
try {
    Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
    Stop-AllServices
}

