@echo off
setlocal
cd /d "%~dp0" || goto :failed

if not exist "backend\.venv\Scripts\python.exe" (
  py -3 -m venv backend\.venv
  if errorlevel 1 goto :failed
)

"backend\.venv\Scripts\python.exe" scripts\run_local.py %*
if errorlevel 1 goto :failed
exit /b 0

:failed
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo Khong the khoi dong du an. Xem thong bao loi o phia tren.
pause
exit /b %EXIT_CODE%
