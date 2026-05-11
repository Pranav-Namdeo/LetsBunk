@echo off
echo Starting LetsBunk Admin Panel...
cd /d "%~dp0"
if exist "dist\win-unpacked\LetsBunk Admin.exe" (
    start "" "dist\win-unpacked\LetsBunk Admin.exe"
) else (
    echo Error: LetsBunk Admin.exe not found!
    echo Please run "npm run build-win" first to build the application.
    pause
)