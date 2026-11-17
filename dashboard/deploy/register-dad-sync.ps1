# Run once after the first manual sync has passed. Uses this user's interactive session.
$ErrorActionPreference = 'Stop'
$name = 'FamilyDashboard-DadCompanion'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  throw 'Task already exists. Inspect it before changing the schedule.'
}
$script = Join-Path $PSScriptRoot 'sync-dad-companion.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Export dad companion and sync its JSON only; skips when other work is in progress.' | Select-Object TaskName,State
