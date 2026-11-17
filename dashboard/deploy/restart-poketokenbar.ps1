param([string]$AppDir = 'D:\PokeTokenBar\poketokenbar-windows-source\poketokenbar-windows')
$ErrorActionPreference = 'Stop'
$exe = Join-Path $AppDir 'node_modules/electron/dist/electron.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Expected source-run Electron executable is missing.' }
$state = Join-Path $env:APPDATA 'poketokenbar-windows/state.json'
if (!(Test-Path -LiteralPath $state)) { throw 'Expected app state is missing; do not start a new profile.' }
$saved = Get-Content -Raw -Encoding UTF8 -LiteralPath $state | ConvertFrom-Json
if (!$saved.companion) { throw 'No saved companion; inspect before restarting.' }
Copy-Item -LiteralPath $state -Destination ($state + '.before-family-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$running = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | Where-Object {
  $_.ExecutablePath -eq $exe -and $_.CommandLine -notmatch '--type=|test-dad-ui.cjs'
}
foreach ($p in $running) { Stop-Process -Id $p.ProcessId -ErrorAction Stop }
$started = Start-Process -FilePath $exe -ArgumentList ('"' + $AppDir + '"') -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
Write-Host ('PokeTokenBar restarted with preserved state. PID: ' + $started.Id)
