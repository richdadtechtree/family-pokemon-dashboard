# RETIRED 2026-11-14: the server now grows dad's Pokemon from token usage (serve.py dad_tick).
# 아빠/포켓몬-동료.json is generated on the server only and is no longer in git. Kept for reference.
param([switch]$ExportOnly)
Write-Host 'Retired: the server builds the dad companion from token usage now.'; exit 0
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location -LiteralPath $repo
$lockPath = Join-Path $repo '.git/dad-companion-sync.lock'
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Write-Host 'Another companion sync is running.'; exit 0 }
try {
  $branch = git branch --show-current
  if ($branch -ne 'main') { throw 'Sync requires main.' }
  if (Test-Path '.git/rebase-merge') { throw 'Rebase in progress.' }
  if (Test-Path '.git/rebase-apply') { throw 'Rebase in progress.' }
  if (Test-Path '.git/MERGE_HEAD') { throw 'Merge in progress.' }
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Staged changes exist; finish the other task first.' }
  $other = git status --porcelain -- . ':(exclude)아빠/포켓몬-동료.json'
  if ($other) { throw 'Other work is in progress; skipping automatic sync.' }
  # When PokeTokenBar is not running, the export also graduates and hatches (--advance) so growth never stalls.
  # When it is running, leave state changes to the app to avoid two writers.
  $appDir = if ($env:POKETOKENBAR_APP_DIR) { $env:POKETOKENBAR_APP_DIR } else { 'D:\PokeTokenBar\poketokenbar-windows-source\poketokenbar-windows' }
  $appExe = Join-Path $appDir 'node_modules\electron\dist\electron.exe'
  $appRunning = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | Where-Object { $_.ExecutablePath -eq $appExe }).Count -gt 0
  $exportArgs = if ($appRunning) { @('--write') } else { @('--write', '--advance') }
  node (Join-Path $PSScriptRoot 'export-dad-companion.cjs') @exportArgs
  if ($LASTEXITCODE -ne 0) { throw 'Export failed.' }
  if ($ExportOnly) { exit 0 }
  git add -- '아빠/포켓몬-동료.json'
  if ($LASTEXITCODE -ne 0) { throw 'Stage failed.' }
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit -m 'sync: dad companion'
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
  }
  git pull --rebase
  if ($LASTEXITCODE -ne 0) { throw 'Pull failed; resolve before retrying.' }
  git push
  if ($LASTEXITCODE -ne 0) { throw 'Push failed; local snapshot is saved.' }
  Write-Host 'Companion synced. Server will pull the snapshot automatically.'
} finally { $lock.Dispose() }
