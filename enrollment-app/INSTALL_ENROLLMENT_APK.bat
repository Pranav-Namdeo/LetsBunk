@echo off
echo ========================================
echo LetsBunk Face Enrollment App Installer
echo ========================================
echo.

cd /d "%~dp0"

echo Checking for connected devices...
adb devices
echo.

set APK_PATH=app\build\outputs\apk\debug\app-debug.apk

if not exist "%APK_PATH%" (
    echo ERROR: APK not found!
    echo Please build the APK first using BUILD_ENROLLMENT_APK.bat
    pause
    exit /b 1
)

echo Installing APK...
adb install -r "%APK_PATH%"

if errorlevel 1 (
    echo.
    echo ERROR: Installation failed!
    echo Make sure:
    echo 1. Device is connected via USB
    echo 2. USB debugging is enabled
    echo 3. Device is authorized
    pause
    exit /b 1
)

echo.
echo ========================================
echo INSTALLATION SUCCESSFUL!
echo ========================================
echo.
echo You can now open the "Enrollment App" on your device
echo.
pause
