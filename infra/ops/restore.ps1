[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$ComposeFile = "compose.prod.yml",
    [string]$EnvFile = ".env",
    [string]$TargetDb,
    [string]$DbUser
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
if (-not (Test-Path -Path $composePath)) {
    throw "Compose file not found: $composePath"
}

if (-not (Test-Path -Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

$backupPath = Resolve-Path $BackupFile

if (-not $TargetDb) {
    $TargetDb = Get-EnvValue -Path $envPath -Key "POSTGRES_DB"
}

if (-not $DbUser) {
    $DbUser = Get-EnvValue -Path $envPath -Key "POSTGRES_USER"
}

if (-not $TargetDb -or -not $DbUser) {
    throw "Unable to resolve target DB/user. Provide -TargetDb and -DbUser or define POSTGRES_DB and POSTGRES_USER in $envPath"
}

Write-Warning "This operation will overwrite data in target DB '$TargetDb'."
Write-Host "Restoring from: $backupPath"

$composeArgs = @("compose", "-f", $composePath)
if (Test-Path -Path $envPath) {
    $composeArgs += @("--env-file", $envPath)
}
$composeArgs += @("exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", $DbUser, "-d", $TargetDb)

Get-Content -Path $backupPath -Raw | & docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    throw "Restore failed with exit code $LASTEXITCODE"
}

Write-Host "Restore completed successfully into DB '$TargetDb'."
