@echo off
setlocal enabledelayedexpansion
echo ========================================
echo LetsBunk Offline-BSSID Fast Build Script
echo ========================================
echo.

REM Set Android SDK environment variables
if not defined ANDROID_HOME set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
if not defined ANDROID_SDK_ROOT set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%ANDROID_HOME%\build-tools\34.0.0;%PATH%"

echo ANDROID_HOME: %ANDROID_HOME%
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
    echo ERROR: Android SDK not found. Install Android Studio first.
    pause
    exit /b 1
)
echo Android SDK OK
echo.

REM Step 1: Kill java only (keep adb alive for install)
echo Step 1: Cleaning processes...
taskkill /F /IM java.exe 2>nul
timeout /t 1 /nobreak >nul
echo.

REM Step 2: Remove old APKs
echo Step 2: Removing old APKs...
if exist "android\app\build\outputs\apk\release\app-release.apk" del /F /Q "android\app\build\outputs\apk\release\app-release.apk" 2>nul
if exist "LetsBunk-Offline-BSSID-Release.apk" del /F /Q "LetsBunk-Offline-BSSID-Release.apk" 2>nul
echo Old APKs removed
echo.

REM Step 3: Build
echo Step 3: Building APK...
cd android
call gradlew assembleRelease --no-daemon
set BUILD_RESULT=%ERRORLEVEL%
cd ..
echo.

REM Step 4: Copy, size, install
if not %BUILD_RESULT% EQU 0 (
    echo BUILD FAILED with error: %BUILD_RESULT%
    echo Check output above for details.
    pause
    exit /b %BUILD_RESULT%
)

set SRC=android\app\build\outputs\apk\release\app-release.apk
set DST=LetsBunk-Offline-BSSID-Release.apk

if not exist "%SRC%" (
    echo ERROR: APK not found at %SRC%
    pause
    exit /b 1
)

copy /Y "%SRC%" "%DST%" >nul
echo Build SUCCESS - APK copied to %DST%

REM Get size using PowerShell (avoids cmd integer overflow for large files)
for /f %%S in ('powershell -NoProfile -Command "(Get-Item '%DST%').Length / 1MB" 2^>nul') do set APK_MB=%%S
echo APK size: %APK_MB% MB
echo.

REM Install on connected device
echo Checking for connected device...
adb devices 2>nul | findstr /V "List of devices" | findstr "device" >nul
if %ERRORLEVEL% EQU 0 (
    echo Device found - installing...
    adb install -r "%DST%"
    if !ERRORLEVEL! EQU 0 (
        echo.
        echo ========================================
        echo  INSTALL SUCCESS
        echo  APK: %DST%
        echo  Size: %APK_MB% MB
        echo ========================================
    ) else (
        echo WARNING: Install failed - APK is ready for manual install
    )
) else (
    echo No device connected - APK ready: %DST%
)

echo.
pause
