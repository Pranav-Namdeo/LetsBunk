@echo off
echo ========================================
echo Installing LetsBunk Release APK
echo ========================================
echo.

echo Checking for connected devices...
C:\Users\Prathmesh\AppData\Local\Android\Sdk\platform-tools\adb.exe devices

echo.
echo Installing APK...
C:\Users\Prathmesh\AppData\Local\Android\Sdk\platform-tools\adb.exe install -r LetsBunk-Release.apk

echo.
echo ========================================
echo INSTALLATION COMPLETE!
echo ========================================
echo.
echo You can now open LetsBunk app on your device.
echo No Metro bundler needed!
echo.
pause
