@echo off
echo ========================================
echo LetsBunk Face Enrollment App Builder
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Cleaning previous builds...
call gradlew.bat clean
if errorlevel 1 (
    echo ERROR: Clean failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Building debug APK...
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Checking for connected devices...
adb devices

echo.
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo APK Location:
echo app\build\outputs\apk\debug\app-debug.apk
echo.
echo To install on connected device, run:
echo adb install -r app\build\outputs\apk\debug\app-debug.apk
echo.
echo Or run: INSTALL_ENROLLMENT_APK.bat
echo.
pause
