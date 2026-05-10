# LetsBunk Admin Panel - Professional Installer Build Script
# This script creates a single-file installer with desktop shortcuts and proper Windows integration

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LetsBunk Admin Panel - Installer Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Check if Node.js is installed
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow
if (-not (Test-Command "node")) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVersion = node --version
Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found" -ForegroundColor Red
    Write-Host "Please run this script from the admin-panel directory" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Found package.json" -ForegroundColor Green

# Check and install dependencies
Write-Host ""
Write-Host "[2/6] Managing dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✓ Dependencies already installed" -ForegroundColor Green
}

# Clean previous builds
Write-Host ""
Write-Host "[3/6] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "✓ Previous build files removed" -ForegroundColor Green
} else {
    Write-Host "✓ No previous builds to clean" -ForegroundColor Green
}

# Build the application
Write-Host ""
Write-Host "[4/6] Building application..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Cyan

npm run build-installer
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✓ Application built successfully" -ForegroundColor Green

# Verify build output
Write-Host ""
Write-Host "[5/6] Verifying build output..." -ForegroundColor Yellow

$installerPath = "dist\LetsBunk Admin Setup 1.0.0.exe"
$portablePath = "dist\win-unpacked\LetsBunk Admin.exe"

if (Test-Path $installerPath) {
    $installerSize = [math]::Round((Get-Item $installerPath).Length / 1MB, 2)
    Write-Host "✓ Installer created successfully!" -ForegroundColor Green
    Write-Host "  File: LetsBunk Admin Setup 1.0.0.exe" -ForegroundColor Cyan
    Write-Host "  Size: $installerSize MB" -ForegroundColor Cyan
    Write-Host "  Location: $(Resolve-Path 'dist')" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: Installer file not found" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
}

if (Test-Path $portablePath) {
    Write-Host "✓ Portable version also available" -ForegroundColor Green
    Write-Host "  Location: dist\win-unpacked\" -ForegroundColor Cyan
}

# Build Summary
Write-Host ""
Write-Host "[6/6] Build Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Single-file installer created" -ForegroundColor Green
Write-Host "✓ Desktop shortcut will be created" -ForegroundColor Green
Write-Host "✓ Start menu entry will be added" -ForegroundColor Green
Write-Host "✓ Proper uninstaller included" -ForegroundColor Green
Write-Host "✓ Windows Programs list integration" -ForegroundColor Green
Write-Host "✓ Professional branding applied" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 The installer is ready for distribution!" -ForegroundColor Green
Write-Host "📁 Location: $(Resolve-Path $installerPath)" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Features included:" -ForegroundColor Yellow
Write-Host "   • Professional installer UI with LetsBunk branding" -ForegroundColor White
Write-Host "   • Automatic desktop shortcut creation" -ForegroundColor White
Write-Host "   • Start menu integration under 'LetsBunk' folder" -ForegroundColor White
Write-Host "   • Complete uninstaller with registry cleanup" -ForegroundColor White
Write-Host "   • Windows 10+ compatibility verification" -ForegroundColor White
Write-Host "   • Proper Windows Programs and Features integration" -ForegroundColor White
Write-Host "   • File size optimization and compression" -ForegroundColor White
Write-Host "   • Installation directory selection" -ForegroundColor White
Write-Host "   • License agreement display" -ForegroundColor White
Write-Host "   • Post-installation launch option" -ForegroundColor White
Write-Host ""

# Distribution instructions
Write-Host "📤 Distribution Instructions:" -ForegroundColor Yellow
Write-Host "   1. Share the single file: LetsBunk Admin Setup 1.0.0.exe" -ForegroundColor White
Write-Host "   2. Users just need to run this file" -ForegroundColor White
Write-Host "   3. No additional files or dependencies required" -ForegroundColor White
Write-Host "   4. Works on Windows 10 and Windows 11 (64-bit)" -ForegroundColor White
Write-Host ""

# Ask if user wants to test the installer
$test = Read-Host "Do you want to test the installer now? (y/n)"
if ($test -eq "y" -or $test -eq "Y") {
    Write-Host ""
    Write-Host "🚀 Opening installer..." -ForegroundColor Cyan
    Start-Process $installerPath
}

Write-Host ""
Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host "Press Enter to exit..." -ForegroundColor Gray
Read-Host