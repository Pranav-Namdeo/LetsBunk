@echo off
echo Clearing Electron cache...
rd /s /q "%APPDATA%\letsbunk-admin" 2>nul
rd /s /q "%LOCALAPPDATA%\letsbunk-admin" 2>nul
echo Cache cleared!
echo.
echo Please restart the admin panel.
pause
