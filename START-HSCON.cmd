@echo off
cd /d "%~dp0"
where bun.exe >nul 2>&1
if errorlevel 1 (
  echo Bun was not found. Install Bun or add it to PATH, then run this file again.
  exit /b 1
)
bun run start %*
if errorlevel 1 (
  echo.
  echo HSCON did not start. Read the error above, then press any key to close.
  pause >nul
  exit /b 1
)
