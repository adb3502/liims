# LIIMS Auto-Start Script
# Waits for Docker Desktop to be ready, then ensures all containers are running.
# Register with Task Scheduler to run at user login (see DEPLOYMENT.md).

$ProjectDir = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $ProjectDir "logs\startup.log"

# Ensure log directory exists
$LogDir = Join-Path $ProjectDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Write-Log {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$Timestamp  $Message" | Tee-Object -FilePath $LogFile -Append
}

Write-Log "LIIMS startup script started."

# Wait for Docker Engine to become responsive (up to 3 minutes)
$MaxWaitSeconds = 180
$Elapsed = 0
Write-Log "Waiting for Docker Engine..."

while ($Elapsed -lt $MaxWaitSeconds) {
    $Result = & docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Docker Engine is ready."
        break
    }
    Start-Sleep -Seconds 5
    $Elapsed += 5
}

if ($Elapsed -ge $MaxWaitSeconds) {
    Write-Log "ERROR: Docker Engine did not become ready within $MaxWaitSeconds seconds. Aborting."
    exit 1
}

# Start (or restart) all services
Write-Log "Running: docker compose up -d"
Set-Location $ProjectDir
$Output = & docker compose up -d 2>&1
Write-Log $Output

if ($LASTEXITCODE -eq 0) {
    Write-Log "LIIMS stack is up."
} else {
    Write-Log "ERROR: docker compose up -d exited with code $LASTEXITCODE."
    exit 1
}
