<#
.SYNOPSIS
    PyRIT Offline Scanner - PowerShell Wrapper
    ISO 27001: A.14.2.5 - Secure Development
.PARAMETER Repo
    GitHub repo "owner/repo" or local path
.PARAMETER Offline
    Force offline mode
.EXAMPLE
    .\pyrit-scan.ps1 -Repo "Trancendos/infinity-portal" -Offline
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Repo,
    [switch]$Offline,
    [string]$OutputDir = "./results",
    [string]$ConfigPath = "$PSScriptRoot/../config/offline-bundle.yaml",
    [string]$PythonPath = "python"
)

function Write-ScanLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    $logDir = Join-Path $env:TEMP "trancendos-pyrit"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path (Join-Path $logDir "pyrit-scan.log") -Value "[$ts] [$Level] $Message"
    switch ($Level) {
        "ERROR"   { Write-Error $Message }
        "WARNING" { Write-Warning $Message }
        default   { Write-Host "[$Level] $Message" }
    }
}

Write-ScanLog "Starting PyRIT scan for: $Repo"

try { $pv = & $PythonPath --version 2>&1; Write-ScanLog "Python: $pv" }
catch { Write-ScanLog "Python not found" "ERROR"; return @{ Repo=$Repo; RiskScore=1.0; Passed=$false; Error="Python not found" } }

if ($Offline) {
    $env:PYRIT_MODE = "offline"
    $env:TRANSFORMERS_OFFLINE = "1"
    Write-ScanLog "Running in OFFLINE mode"
}

$tempDir = $null
$scanTarget = $null

if (Test-Path $Repo) {
    $scanTarget = (Resolve-Path $Repo).Path
} elseif ($Repo -match "^[\w-]+/[\w.-]+$") {
    $tempDir = Join-Path $env:TEMP "pyrit-scan-$(Get-Random)"
    try {
        git clone --depth 1 "https://github.com/$Repo.git" $tempDir 2>&1 | Out-Null
        $scanTarget = $tempDir
    } catch {
        Write-ScanLog "Clone failed: $($_.Exception.Message)" "ERROR"
        return @{ Repo=$Repo; RiskScore=1.0; Passed=$false; Error="Clone failed" }
    }
} else {
    Write-ScanLog "Invalid repo: $Repo" "ERROR"
    return @{ Repo=$Repo; RiskScore=1.0; Passed=$false; Error="Invalid repo format" }
}

Write-ScanLog "Scanning: $scanTarget"

$scannerPath = Join-Path $PSScriptRoot "pyrit_scanner.py"
$args = @("-t", $scanTarget, "-o", $OutputDir)
if (Test-Path $ConfigPath) { $args += @("-c", $ConfigPath) }

try {
    $output = & $PythonPath $scannerPath @args 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host $_ }

    $resultFiles = Get-ChildItem -Path $OutputDir -Filter "pyrit-scan-*.json" | Sort-Object LastWriteTime -Descending
    if ($resultFiles.Count -gt 0) {
        $result = Get-Content $resultFiles[0].FullName | ConvertFrom-Json
        $summary = @{
            Repo = $Repo; RiskScore = $result.risk_score.overall
            Passed = $result.risk_score.passed; Findings = $result.findings.Count
            FilesScanned = $result.files_scanned; Duration = $result.scan_duration_seconds
            ReportPath = $resultFiles[0].FullName
        }
    } else {
        $summary = @{ Repo=$Repo; RiskScore=1.0; Passed=$false; Error="No report generated" }
    }
} catch {
    Write-ScanLog "Scan failed: $($_.Exception.Message)" "ERROR"
    $summary = @{ Repo=$Repo; RiskScore=1.0; Passed=$false; Error=$_.Exception.Message }
} finally {
    if ($tempDir -and (Test-Path $tempDir)) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-ScanLog "Cleaned temp directory"
    }
}

Write-ScanLog "Scan complete. Risk: $($summary.RiskScore), Passed: $($summary.Passed)"
return $summary
