[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$ComposeFile = "compose.prod.yml",
    [string]$EnvFile = ".env",
    [string]$TargetDb,
    [string]$DbUser,
    [switch]$Force,
    [switch]$SkipIntegrityCheck,
    [switch]$CreatePreRestoreBackup
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

function Test-BackupIntegrity {
    param(
        [string]$BackupPath,
        [string]$ExpectedDb
    )

    $hash = Get-FileHash -Path $BackupPath -Algorithm SHA256
    $hashFile = "$BackupPath.sha256"
    if (Test-Path -Path $hashFile) {
        $expectedHash = ((Get-Content -Path $hashFile -Raw).Trim().Split(" ")[0]).ToLowerInvariant()
        if ($expectedHash -ne $hash.Hash.ToLowerInvariant()) {
            throw "Checksum mismatch for backup file: $BackupPath"
        }
    }

    $manifestFile = "$BackupPath.json"
    if (Test-Path -Path $manifestFile) {
        $manifest = Get-Content -Path $manifestFile -Raw | ConvertFrom-Json
        if ($manifest.sha256 -and $manifest.sha256.ToLowerInvariant() -ne $hash.Hash.ToLowerInvariant()) {
            throw "Manifest checksum mismatch for backup file: $BackupPath"
        }
        if ($ExpectedDb -and $manifest.database -and $manifest.database -ne $ExpectedDb) {
            throw "Backup manifest DB '$($manifest.database)' does not match target DB '$ExpectedDb'"
        }
    }
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

if (-not $Force) {
    throw "Restore requires -Force confirmation."
}

if (-not $SkipIntegrityCheck) {
    Test-BackupIntegrity -BackupPath $backupPath -ExpectedDb $TargetDb
}

if ($CreatePreRestoreBackup) {
    $backupScript = Join-Path $scriptDir "backup.ps1"
    & $backupScript -ComposeFile $ComposeFile -EnvFile $EnvFile -DbName $TargetDb -DbUser $DbUser -FilePrefix "pre-restore-$TargetDb"
    if ($LASTEXITCODE -ne 0) {
        throw "Pre-restore backup failed with exit code $LASTEXITCODE"
    }
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
