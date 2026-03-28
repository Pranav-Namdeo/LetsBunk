@echo off
echo ========================================
echo LetsBunk Face Enrollment App Builder
echo ========================================
echo.

REM Set Android SDK environment variables
echo Setting up Android SDK environment...
set ANDROID_HOME=C:\Users\ASUS\AppData\Local\Android\Sdk
set ANDROID_SDK_ROOT=C:\Users\ASUS\AppData\Local\Android\Sdk
set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%ANDROID_HOME%\build-tools\34.0.0;%PATH%"

echo ✅ ANDROID_HOME: %ANDROID_HOME%
echo ✅ ANDROID_SDK_ROOT: %ANDROID_SDK_ROOT%
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
echo [3/3] Copying APK to main folder...
if exist "app\build\outputs\apk\release\app-release.apk" (
    copy /Y "app\build\outputs\apk\release\app-release.apk" "Enrollment-App-Release.apk" >nul
    echo ✅ APK ready: Enrollment-App-Release.apk
    
    for %%A in ("Enrollment-App-Release.apk") do set APK_SIZE=%%~zA
    if defined APK_SIZE (
        set /a APK_SIZE_MB=%APK_SIZE%/1024/1024
    ) else (
        set APK_SIZE_MB=Unknown
    )
    echo ✅ Size: %APK_SIZE_MB% MB
) else (
    echo ❌ APK not found after build
)

echo.
echo [4/4] Checking for connected devices...
adb devices

echo.
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo APK Location: Enrollment-App-Release.apk
echo Features: Face Enrollment + MediaPipe + TensorFlow
echo.
echo To install on connected device:
echo adb install -r "Enrollment-App-Release.apk"
echo.
pause
