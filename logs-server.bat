@echo off
setlocal
cd /d "%~dp0" || exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy_server.ps1" -Action Logs
exit /b %errorlevel%
