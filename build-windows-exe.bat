@echo off
setlocal
cd /d "%~dp0"

echo Building Rinse Windows Installer and Portable Apps ^(32-bit + 64-bit^)...
if not exist "node_modules\electron" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

call npm run desktop:win
if errorlevel 1 (
  echo Desktop build failed.
  pause
  exit /b 1
)

echo.
echo Build complete! Check the "release" folder for:
echo   - Rinse-Setup-1.0.0.exe ^(Universal 32-bit + 64-bit Installer^)
echo   - Rinse-Portable-1.0.0-ia32.exe ^(32-bit Portable^)
echo   - Rinse-Portable-1.0.0-x64.exe  ^(64-bit Portable^)
pause
