@echo off
echo Clearing Electron cache and localStorage...
echo.

REM Clear Electron cache
if exist "%APPDATA%\letsbunk-admin" (
    echo Deleting %APPDATA%\letsbunk-admin
    rmdir /s /q "%APPDATA%\letsbunk-admin"
    echo Cache cleared!
) else (
    echo No cache found at %APPDATA%\letsbunk-admin
)

echo.
echo Starting admin panel...
npm start
