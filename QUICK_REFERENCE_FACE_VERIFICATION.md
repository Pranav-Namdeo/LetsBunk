# Quick Reference - Face Verification

## 🎯 What Changed

**Before:** Click ▶ → WiFi Check → Timer Starts  
**After:** Click ▶ → WiFi Check → **Face Verification** → Timer Starts

---

## 📁 Files to Copy

### 1. Helper Files (from enrollment-app)
```
Source: LetsBunk/enrollment-app/app/src/main/java/com/example/enrollmentapp/
Target: LetsBunk/android/app/src/main/java/com/countdowntimer/app/

✅ FaceDetectionHelper.kt
✅ FaceEmbeddingHelper.kt
✅ LivenessDetector.kt
```

### 2. Face Verification Module
```
Source: LetsBunk/face-verification-module/src/main/java/com/letsbunk/faceverification/
Target: LetsBunk/android/app/src/main/java/com/letsbunk/faceverification/

✅ FaceComparator.kt
✅ FaceVerificationModule.kt
✅ FaceVerificationActivity.kt
✅ FaceVerificationPackage.kt
```

### 3. Layout File
```
Source: LetsBunk/face-verification-module/src/main/res/layout/
Target: LetsBunk/android/app/src/main/res/layout/

✅ activity_face_verification.xml
```

### 4. AI Models (should already exist)
```
Location: LetsBunk/android/app/src/main/assets/

✅ face_detection_short_range.tflite (224 KB)
✅ mobile_face_net.tflite (5 MB)
```

---

## ⚙️ Configuration Changes

### MainApplication.kt
```kotlin
// Add import
import com.letsbunk.faceverification.FaceVerificationPackage

// Add to getPackages()
packages.add(FaceVerificationPackage())
```

### AndroidManifest.xml
```xml
<!-- Add inside <application> -->
<activity
    android:name="com.letsbunk.faceverification.FaceVerificationActivity"
    android:theme="@style/Theme.AppCompat.NoActionBar"
    android:screenOrientation="portrait"
    android:exported="false" />
```

### Update Imports in FaceVerificationActivity.kt
```kotlin
// Change from:
import com.example.enrollmentapp.FaceDetectionHelper

// To:
import com.countdowntimer.app.FaceDetectionHelper
```

---

## 🔨 Build Commands

```bash
cd LetsBunk/android
./gradlew clean
./gradlew assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
```

---

## 🧪 Quick Test

1. Login as student
2. Click ▶ triangle button
3. Camera should open
4. Verify face
5. Timer should start

---

## 📊 Key Specs

- **Threshold:** 75% similarity
- **Frames:** 10 captured
- **Time:** 5-10 seconds
- **Storage:** Encrypted (AES-256)
- **Verification:** Offline

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Module not found | Check MainApplication.kt |
| Camera not opening | Check permissions |
| Models not found | Check assets folder |
| Helpers not found | Copy from enrollment-app |

---

## 📚 Full Documentation

- **FACE_VERIFICATION_INTEGRATION.md** - Technical details
- **SETUP_FACE_VERIFICATION.md** - Step-by-step guide
- **FACE_VERIFICATION_COMPLETE.md** - Summary

---

**Status:** Ready for Setup  
**Next:** Follow SETUP_FACE_VERIFICATION.md
