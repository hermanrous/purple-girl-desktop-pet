@echo off
cd /d "%~dp0"
title Desktop Pet Builder

echo ========================================
echo   Purple Girl Desktop Pet - Build
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/4] Node.js version:
node --version
echo.

echo [2/4] Installing dependencies...
call npm ci
if errorlevel 1 (
    echo [ERROR] npm ci failed.
    pause
    exit /b 1
)
echo Done.
echo.

echo [3/4] Processing assets...
call npm run process:assets
echo Done.
echo.

echo [4/4] Packaging Windows EXE...
call npm run package:win
if errorlevel 1 (
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD SUCCESS!
echo ========================================
echo.
echo EXE is in: release\*win32-x64-ready-to-run\*.exe
echo Keep the whole folder, do NOT copy only the EXE.
echo.
pause
