@echo off
echo ========================================
echo LetsBunk Face Enrollment App Builder
echo ========================================
echo.

REM ── Android SDK: use existing env var or fall back to common install paths ──
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    ) else if exist "%USERPROFILE%\AppData\Local\Android\Sdk" (
        set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
    ) else (
        echo ERROR: ANDROID_HOME is not set and SDK not found in default location.
        echo Please set ANDROID_HOME to your Android SDK path and re-run.
        pause
        exit /b 1
    )
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%ANDROID_HOME%\build-tools\34.0.0;%PATH%"

echo ANDROID_HOME: %ANDROID_HOME%
echo.

cd /d "%~dp0"

echo [1/3] Cleaning previous builds...
call gradlew.bat clean --no-daemon
if errorlevel 1 (
    echo ERROR: Clean failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Building release APK...
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Copying APK to folder...
set "APK_SRC=app\build\outputs\apk\release\app-release.apk"
set "APK_DST=Enrollment-App-Release.apk"

if exist "%APK_SRC%" (
    copy /Y "%APK_SRC%" "%APK_DST%" >nul
    for %%A in ("%APK_DST%") do set /a APK_MB=%%~zA/1024/1024
    echo APK ready: %APK_DST% (~%APK_MB% MB^)
) else (
    echo ERROR: APK not found at %APK_SRC%
    pause
    exit /b 1
)

echo.
echo [4/4] Checking for connected devices...
adb devices

echo.
echo ========================================
echo BUILD SUCCESSFUL
echo ========================================
echo Server: https://letsbunk-server.azurewebsites.net
echo APK:    %APK_DST%
echo.
echo To install on connected device:
echo   adb install -r "%APK_DST%"
echo.
pause
