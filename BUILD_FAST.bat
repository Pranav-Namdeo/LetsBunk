@echo off
setlocal enabledelayedexpansion
echo ========================================
echo LetsBunk Offline-BSSID Build and Install
echo ========================================
echo.

REM Step 1: Cleanup old APKs (no uninstall - preserves permissions)
echo Step 1: Removing old APKs...
del /S /F /Q *.apk >nul 2>&1
echo ✅ Cleanup complete
echo.

REM Step 2: Build
echo Step 2: Building (Fast Mode)...
echo This may take a few minutes...
cd android
call gradlew assembleRelease --no-daemon
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Build failed!
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo ✅ Build completed successfully!

REM Step 3: Install
set APK_PATH=android\app\build\outputs\apk\release\app-release.apk
if not exist "%APK_PATH%" (
    echo ❌ APK not found at: %APK_PATH%
    pause
    exit /b 1
)

echo ✅ APK ready: %APK_PATH%

REM Check for devices
adb devices > temp_devices.txt 2>nul
findstr /C:"device" temp_devices.txt | findstr /V /C:"List of devices" >nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Device detected - installing directly...
    adb install -r "%APK_PATH%"
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo ✅ SUCCESS! APK installed on device
        echo ========================================
    ) else (
        echo.
        echo ⚠️ Install failed - check your device for permission prompts
        echo You may need to enable "Install via USB" in Developer Options.
    )
) else (
    echo.
    echo ⚠️ No device connected - Build successful
    echo APK is located at: %APK_PATH%
)

del temp_devices.txt 2>nul
echo.
pause
