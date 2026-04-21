#!/usr/bin/env pwsh
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Flazz Windows Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"
$startLocation = Get-Location

try {
    # Navigate to project root
    Set-Location $PSScriptRoot\..

    Write-Host "[1/5] Building dependencies..." -ForegroundColor Yellow
    pnpm run deps
    if ($LASTEXITCODE -ne 0) { throw "Failed to build dependencies" }

    Write-Host ""
    Write-Host "[2/5] Building renderer..." -ForegroundColor Yellow
    Set-Location apps\renderer
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Failed to build renderer" }
    Set-Location ..\..

    Write-Host ""
    Write-Host "[3/5] Building main process..." -ForegroundColor Yellow
    Set-Location apps\main
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Failed to build main process" }

    Write-Host ""
    Write-Host "[4/5] Packaging application..." -ForegroundColor Yellow
    pnpm run package
    if ($LASTEXITCODE -ne 0) { throw "Failed to package application" }

    Write-Host ""
    Write-Host "[5/5] Creating installer..." -ForegroundColor Yellow
    pnpm run make
    if ($LASTEXITCODE -ne 0) { throw "Failed to create installer" }

    Set-Location ..\..

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer location:" -ForegroundColor Cyan
    Write-Host "  apps\main\out\make\squirrel.windows\x64\" -ForegroundColor White
    Write-Host ""
    Write-Host "Files created:" -ForegroundColor Cyan
    Get-ChildItem apps\main\out\make\squirrel.windows\x64\ | Select-Object -ExpandProperty Name
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Set-Location $startLocation
    exit 1
}
finally {
    Set-Location $startLocation
}
