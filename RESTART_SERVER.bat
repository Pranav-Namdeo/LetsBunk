@echo off
echo ========================================
echo  LetsBunk Server Restart Script
echo ========================================
echo.

echo Stopping current server...
taskkill /F /PID 28352 2>nul
if %errorlevel% equ 0 (
    echo [OK] Server stopped
) else (
    echo [INFO] No server running on PID 28352
)

echo.
echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo.
echo Starting server...
echo.
echo ========================================
echo  Server will start in new window
echo  Press Ctrl+C in that window to stop
echo ========================================
echo.

start "LetsBunk Server" cmd /k "cd /d %~dp0 && node server.js"

echo.
echo [OK] Server started in new window
echo.
echo Testing server connection...
timeout /t 3 /nobreak >nul

node -e "const fetch = require('node-fetch'); fetch('http://192.168.1.6:3000/api/health').then(r => r.json()).then(d => console.log('[OK] Server is responding:', d.status)).catch(e => console.log('[ERROR] Server not responding:', e.message))"

echo.
echo ========================================
echo  Next Steps:
echo ========================================
echo  1. Run: node test-login-face-data.js
echo  2. Verify face fields are returned
echo  3. Rebuild LetsBunk APK
echo  4. Install on device and test
echo ========================================
echo.
pause
