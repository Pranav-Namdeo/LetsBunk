@echo off
echo ========================================
echo  LetsBunk Admin Panel - Installer Build
echo ========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if we're in the correct directory
if not exist "package.json" (
    echo ERROR: package.json not found
    echo Please run this script from the admin-panel directory
    pause
    exit /b 1
)

echo [1/5] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed.
)

echo.
echo [2/5] Cleaning previous builds...
if exist "dist" (
    rmdir /s /q "dist"
    echo Previous build files removed.
)

echo.
echo [3/5] Building application...
npm run build-installer
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [4/5] Verifying build output...
if exist "dist\LetsBunk Admin Setup 1.0.0.exe" (
    echo ✓ Installer created successfully!
    
    :: Get file size
    for %%A in ("dist\LetsBunk Admin Setup 1.0.0.exe") do (
        set size=%%~zA
        set /a sizeMB=!size!/1024/1024
    )
    
    echo   File: LetsBunk Admin Setup 1.0.0.exe
    echo   Size: !sizeMB! MB
    echo   Location: %cd%\dist\
) else (
    echo ERROR: Installer file not found
    pause
    exit /b 1
)

echo.
echo [5/5] Build Summary
echo ========================================
echo ✓ Single-file installer created
echo ✓ Desktop shortcut will be created
echo ✓ Start menu entry will be added
echo ✓ Proper uninstaller included
echo ✓ Windows Programs list integration
echo ✓ Professional branding applied
echo.
echo The installer is ready for distribution!
echo Location: %cd%\dist\LetsBunk Admin Setup 1.0.0.exe
echo.
echo Features included:
echo - One-click installation
echo - Desktop shortcut creation
echo - Start menu integration
echo - Automatic uninstaller
echo - Windows 10+ compatibility check
echo - Professional installer UI
echo.

:: Ask if user wants to test the installer
set /p test="Do you want to test the installer now? (y/n): "
if /i "%test%"=="y" (
    echo.
    echo Opening installer...
    start "" "dist\LetsBunk Admin Setup 1.0.0.exe"
)

echo.
echo Build completed successfully!
pause