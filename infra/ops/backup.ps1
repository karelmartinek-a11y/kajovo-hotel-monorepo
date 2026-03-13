[CmdletBinding()]
param(
    [string]$ComposeFile = "compose.prod.yml",
    [string]$EnvFile = ".env",
    [string]$OutputDir = "../backups",
    [string]$DbName,
    [string]$DbUser,
    [string]$FilePrefix = "kajovo-postgres",
    [switch]$SkipManifest
)

$ErrorActionPreference = "Stop"

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path -Path $Path)) {
        return $null
    }

    $line = Get-Content -Path $Path |
        Where-Object { $_ -match "^\s*$Key\s*=" } |
        Select-Object -First 1

    if (-not $line) {
        return $null
    }

    return ($line -replace "^\s*$Key\s*=\s*", "").Trim()
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$infraDir = Resolve-Path (Join-Path $scriptDir "..")
$composePath = Join-Path $infraDir $ComposeFile
$envPath = Join-Path $infraDir $EnvFile
$outputPath = Join-Path $scriptDir $OutputDir

if (-not (Test-Path -Path $composePath)) {
    throw "Compose file not found: $composePath"
}

if (-not $DbName) {
    $DbName = Get-EnvValue -Path $envPath -Key "POSTGRES_DB"
}

if (-not $DbUser) {
    $DbUser = Get-EnvValue -Path $envPath -Key "POSTGRES_USER"
}

if (-not $DbName -or -not $DbUser) {
    throw "Unable to resolve DB name/user. Provide -DbName and -DbUser or define POSTGRES_DB and POSTGRES_USER in $envPath"
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $outputPath ("{0}-{1}.sql" -f $FilePrefix, $timestamp)

$composeArgs = @("compose", "-f", $composePath)
if (Test-Path -Path $envPath) {
    $composeArgs += @("--env-file", $envPath)
}
$composeArgs += @("exec", "-T", "postgres", "pg_dump", "-U", $DbUser, "-d", $DbName)

Write-Host "Creating backup: $backupFile"
$dumpOutput = & docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($backupFile, $dumpOutput, $utf8NoBom)

$hash = Get-FileHash -Path $backupFile -Algorithm SHA256
$hashFile = "$backupFile.sha256"
"{0} *{1}" -f $hash.Hash.ToLowerInvariant(), [System.IO.Path]::GetFileName($backupFile) | Set-Content -Path $hashFile -Encoding utf8

if (-not $SkipManifest) {
    $manifestFile = "$backupFile.json"
    $manifest = [ordered]@{
        created_at = (Get-Date).ToString("o")
        compose_file = $ComposeFile
        env_file = $EnvFile
        database = $DbName
        user = $DbUser
        backup_file = [System.IO.Path]::GetFileName($backupFile)
        sha256 = $hash.Hash.ToLowerInvariant()
        size_bytes = (Get-Item -Path $backupFile).Length
        host = $env:COMPUTERNAME
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestFile -Encoding utf8
    Write-Host "Manifest: $manifestFile"
}

Write-Host "Backup completed successfully."
Write-Host "File: $backupFile"
Write-Host "SHA256: $($hash.Hash.ToLowerInvariant())"
