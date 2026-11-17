# Run after reviewing prepare-poketokenbar.cjs output. Backs up the original source.
param([string]$AppDir = 'D:\PokeTokenBar\poketokenbar-windows-source\poketokenbar-windows')
$ErrorActionPreference = 'Stop'
$target = Join-Path $AppDir 'src/pokemon.js'
$prepared = Join-Path $PSScriptRoot 'poketokenbar-pokemon.cjs'
if (!(Test-Path -LiteralPath $target) -or !(Test-Path -LiteralPath $prepared)) { throw 'Missing source or prepared patch.' }
$backup = $target + '.before-family-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'family-catalog.json') -Destination (Join-Path $AppDir 'src/family-catalog.json')
Copy-Item -LiteralPath $prepared -Destination $target
$testTarget = Join-Path $AppDir 'test/run-tests.js'
Copy-Item -LiteralPath $testTarget -Destination ($testTarget + '.before-family-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'poketokenbar-tests.cjs') -Destination $testTarget
node --check $target
if ($LASTEXITCODE -ne 0) { Copy-Item -LiteralPath $backup -Destination $target; throw 'Syntax error; restored original source.' }
Write-Host ('Updated app source. Backup: ' + $backup)
Write-Host 'Current companion and saved state were not changed. Restart the app to use the shared catalogue.'
