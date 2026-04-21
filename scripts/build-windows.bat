@echo off
echo ========================================
echo Flazz Windows Build Script
echo ========================================
echo.

cd /d "%~dp0.."

echo [1/5] Building dependencies...
call pnpm run deps
if %errorlevel% neq 0 (
    echo ERROR: Failed to build dependencies
    pause
    exit /b 1
)

echo.
echo [2/5] Building renderer...
cd apps\renderer
call pnpm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build renderer
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

echo.
echo [3/5] Building main process...
cd apps\main
call pnpm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build main process
    cd ..\..
    pause
    exit /b 1
)

echo.
echo [4/5] Packaging application...
call pnpm run package
if %errorlevel% neq 0 (
    echo ERROR: Failed to package application
    cd ..\..
    pause
    exit /b 1
)

echo.
echo [5/5] Creating installer...
call pnpm run make
if %errorlevel% neq 0 (
    echo ERROR: Failed to create installer
    cd ..\..
    pause
    exit /b 1
)

cd ..\..

echo.
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo Installer location:
echo   apps\main\out\make\squirrel.windows\x64\
echo.
echo Files created:
dir /b apps\main\out\make\squirrel.windows\x64\
echo.

pause
