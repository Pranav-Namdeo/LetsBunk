@echo off
echo ========================================
echo   College Admin Panel - Starting...
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting Admin Panel...
call npm start
