@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install Node.js LTS ^(32-bit x86 or 64-bit x64^).
  pause
  exit /b 1
)

if not exist "dist\server.mjs" (
  echo First-time build needed...
  if not exist "node_modules\vite" (
    echo Installing build dependencies...
    call npm install
    if errorlevel 1 (
      echo Build install failed. On a 32-bit PC, build once on a 64-bit PC first and copy the dist folder.
      pause
      exit /b 1
    )
  )
  call npm run build
  if errorlevel 1 (
    echo Build failed. On a 32-bit PC, build once on a 64-bit PC first and copy the dist folder.
    pause
    exit /b 1
  )
)

if not exist "node_modules\express" (
  echo Installing lightweight Express runtime...
  call npm install express --no-save
  if errorlevel 1 (
    echo Failed to install Express runtime.
    pause
    exit /b 1
  )
)

node launch-desktop.mjs
if errorlevel 1 (
  echo.
  echo Rinse closed with an error.
  pause
)
