@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS once, then double-click this launcher again.
  echo Your financial data has not been changed.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22 || (a===22 && b>=12) ? 0 : 1)"
if errorlevel 1 (
  echo Please update Node.js to 24 LTS, then try again.
  pause
  exit /b 1
)
cd /d "%~dp0"
node "%~dp0server.mjs" --open
if errorlevel 1 pause
