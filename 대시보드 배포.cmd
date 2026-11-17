@echo off
rem Double-click to deploy the family dashboard (runs dashboard\deploy\deploy.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "dashboard\deploy\deploy.ps1" %*
echo.
pause
