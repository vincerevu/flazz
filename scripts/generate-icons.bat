@echo off
echo ========================================
echo Flazz Icon Generator
echo ========================================
echo.

cd /d "%~dp0.."

if not exist "assets\icon.png" (
    echo ERROR: Source icon not found!
    echo Please ensure assets\icon.png exists
    echo.
    pause
    exit /b 1
)

echo Source icon found: assets\icon.png
echo.

echo Checking for electron-icon-builder...
call electron-icon-builder --version >nul 2>&1
if %errorlevel% equ 0 (
    echo electron-icon-builder found!
    echo.
    echo Generating icons...
    call electron-icon-builder --input=assets\icon.png --output=assets
    echo.
    echo Done! Check assets\ folder for:
    echo   - icon.ico  (Windows)
    echo   - icon.icns (macOS)
    echo.
) else (
    echo electron-icon-builder not found!
    echo.
    echo Please install it first:
    echo   npm install -g electron-icon-builder
    echo.
    echo Or use online tools:
    echo   Windows .ico: https://convertico.com/
    echo   macOS .icns:  https://cloudconvert.com/png-to-icns
    echo.
)

pause
