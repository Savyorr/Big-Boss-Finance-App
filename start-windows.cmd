@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or later from https://nodejs.org then run this launcher again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Check your connection and try again.
    pause
    exit /b 1
  )
)
echo Starting Big Boss Finance. Open the Local address printed below.
echo Keep this window open while using the development app.
call npm run dev -- --host 127.0.0.1
if errorlevel 1 pause
