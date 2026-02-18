@echo off
echo ========================================
echo Building LetsBunk Release APK
echo ========================================
echo.

cd android

echo [1/3] Cleaning previous build...
call gradlew clean

echo.
echo [2/3] Building release APK...
call gradlew assembleRelease

echo.
echo [3/3] Copying APK to main folder...
cd ..
copy "android\app\build\outputs\apk\release\app-release.apk" "LetsBunk-Release.apk" /Y

echo.
echo ========================================
echo BUILD COMPLETE!
echo ========================================
echo.
echo APK Location: LetsBunk-Release.apk
echo.
echo To install on device:
echo adb install -r LetsBunk-Release.apk
echo.
pause
