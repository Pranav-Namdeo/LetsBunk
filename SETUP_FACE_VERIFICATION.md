# Setup Face Verification - Step by Step Guide

## ⚠️ Important Note

The face verification module uses the same AI helpers and models from the enrollment app. We need to make them accessible to the face verification module.

---

## 📋 Setup Steps

### Step 1: Copy Helper Files

Since the helpers are already in `enrollment-app`, we need to make them accessible to the main app.

**Option A: Copy to Android Main App** (Recommended)

Copy these files from `enrollment-app` to main Android app:

```bash
# From: LetsBunk/enrollment-app/app/src/main/java/com/example/enrollmentapp/
# To: LetsBunk/android/app/src/main/java/com/countdowntimer/app/

FaceDetectionHelper.kt
FaceEmbeddingHelper.kt
LivenessDetector.kt
```

**Option B: Update Package References**

Update the imports in `FaceVerificationActivity.kt` to point to enrollment app package:
```kotlin
import com.example.enrollmentapp.FaceDetectionHelper
import com.example.enrollmentapp.FaceEmbeddingHelper
import com.example.enrollmentapp.LivenessDetector
```

---

### Step 2: Copy AI Models

Ensure AI models are in the main app assets:

```bash
# From: LetsBunk/enrollment-app/app/src/main/assets/
# To: LetsBunk/android/app/src/main/assets/

face_detection_short_range.tflite (224 KB)
mobile_face_net.tflite (5 MB)
```

---

### Step 3: Update MainApplication.kt

**File:** `LetsBunk/android/app/src/main/java/com/countdowntimer/app/MainApplication.kt`

Add import:
```kotlin
import com.letsbunk.faceverification.FaceVerificationPackage
```

Add to packages list in `getPackages()`:
```kotlin
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).packages.apply {
        // Add custom packages here
        add(FaceVerificationPackage())  // ← ADD THIS LINE
    }
}
```

---

### Step 4: Update AndroidManifest.xml

**File:** `LetsBunk/android/app/src/main/AndroidManifest.xml`

Add inside `<application>` tag:
```xml
<activity
    android:name="com.letsbunk.faceverification.FaceVerificationActivity"
    android:theme="@style/Theme.AppCompat.NoActionBar"
    android:screenOrientation="portrait"
    android:exported="false" />
```

---

### Step 5: Update build.gradle

**File:** `LetsBunk/android/app/build.gradle`

Ensure these dependencies exist (they should already be there from enrollment app):

```gradle
dependencies {
    // ... existing dependencies ...
    
    // CameraX
    implementation "androidx.camera:camera-core:1.2.0"
    implementation "androidx.camera:camera-camera2:1.2.0"
    implementation "androidx.camera:camera-lifecycle:1.2.0"
    implementation "androidx.camera:camera-view:1.2.0"
    
    // TensorFlow Lite
    implementation 'org.tensorflow:tensorflow-lite:2.12.0'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.3'
    implementation 'org.tensorflow:tensorflow-lite-gpu:2.12.0'
    implementation 'org.tensorflow:tensorflow-lite-task-vision:0.4.3'
    
    // MediaPipe (for face detection)
    implementation 'com.google.mediapipe:tasks-vision:0.10.0'
}
```

---

### Step 6: Copy Face Verification Module to Android

Copy the entire face-verification-module to the Android project:

```bash
# From: LetsBunk/face-verification-module/
# To: LetsBunk/android/app/src/main/java/com/letsbunk/faceverification/

FaceComparator.kt
FaceVerificationModule.kt
FaceVerificationActivity.kt
FaceVerificationPackage.kt
```

And the layout:
```bash
# From: LetsBunk/face-verification-module/src/main/res/layout/
# To: LetsBunk/android/app/src/main/res/layout/

activity_face_verification.xml
```

---

### Step 7: Update Package Names (if needed)

If you copied helpers to main app, update package names in all files:

**In FaceVerificationActivity.kt:**
```kotlin
// Change from:
import com.example.enrollmentapp.FaceDetectionHelper
import com.example.enrollmentapp.FaceEmbeddingHelper
import com.example.enrollmentapp.LivenessDetector

// To:
import com.countdowntimer.app.FaceDetectionHelper
import com.countdowntimer.app.FaceEmbeddingHelper
import com.countdowntimer.app.LivenessDetector
```

---

### Step 8: Clean and Rebuild

```bash
cd LetsBunk/android
./gradlew clean
./gradlew assembleRelease
```

---

### Step 9: Install and Test

```bash
# Install APK
adb install android/app/build/outputs/apk/release/app-release.apk

# Or use the build script
.\BUILD_RELEASE_APK.bat
.\INSTALL_RELEASE_APK.bat
```

---

## 🧪 Testing Checklist

### Test 1: Face Data Available
- [ ] Login as student
- [ ] Check face data downloaded
- [ ] Verify SecureStorage has embedding

### Test 2: Start Timer with Face Verification
- [ ] Click triangle button
- [ ] Location permission granted
- [ ] WiFi validation passed
- [ ] Camera opens for face verification
- [ ] Liveness detection works
- [ ] Face captured (10 frames)
- [ ] Verification succeeds
- [ ] Timer starts

### Test 3: Face Verification Failure
- [ ] Use different person's face
- [ ] Verification fails
- [ ] Error message shown
- [ ] Timer doesn't start

### Test 4: Cancelled Verification
- [ ] Click triangle button
- [ ] Camera opens
- [ ] Press back button
- [ ] Cancellation message shown
- [ ] Timer doesn't start

### Test 5: No Face Data
- [ ] Logout and clear data
- [ ] Login without face enrollment
- [ ] Click triangle button
- [ ] Error message about missing face data
- [ ] Timer doesn't start

---

## 🐛 Troubleshooting

### Issue: Module not found
**Error:** `FaceVerificationModule is not available`

**Solution:**
1. Check MainApplication.kt has FaceVerificationPackage registered
2. Rebuild the app completely
3. Clear cache: `./gradlew clean`

### Issue: Camera not opening
**Error:** Camera permission denied

**Solution:**
1. Check AndroidManifest.xml has CAMERA permission
2. Grant permission in device settings
3. Restart the app

### Issue: Face detection not working
**Error:** Models not found

**Solution:**
1. Ensure AI models are in `android/app/src/main/assets/`
2. Check file names match exactly
3. Rebuild the app

### Issue: Helpers not found
**Error:** Cannot resolve FaceDetectionHelper

**Solution:**
1. Copy helpers from enrollment-app to main app
2. Update package names in imports
3. Sync Gradle files

---

## 📁 Final File Structure

```
LetsBunk/
├── FaceVerification.js (React Native bridge)
├── App.js (Updated with face verification)
├── SecureStorage.js (Stores face embedding)
│
└── android/
    └── app/
        └── src/
            └── main/
                ├── assets/
                │   ├── face_detection_short_range.tflite
                │   └── mobile_face_net.tflite
                │
                ├── java/com/
                │   ├── countdowntimer/app/
                │   │   ├── MainApplication.kt (Updated)
                │   │   ├── FaceDetectionHelper.kt (Copied)
                │   │   ├── FaceEmbeddingHelper.kt (Copied)
                │   │   └── LivenessDetector.kt (Copied)
                │   │
                │   └── letsbunk/faceverification/
                │       ├── FaceComparator.kt
                │       ├── FaceVerificationModule.kt
                │       ├── FaceVerificationActivity.kt
                │       └── FaceVerificationPackage.kt
                │
                ├── res/
                │   └── layout/
                │       └── activity_face_verification.xml
                │
                └── AndroidManifest.xml (Updated)
```

---

## ✅ Verification

After setup, verify:

1. ✅ App builds without errors
2. ✅ Face verification module loads
3. ✅ Camera opens when clicking triangle
4. ✅ Liveness detection works
5. ✅ Face comparison succeeds/fails correctly
6. ✅ Timer starts only after successful verification

---

## 📞 Support

If you encounter issues:

1. Check logs: `adb logcat | grep -i face`
2. Verify all files copied correctly
3. Ensure package names match
4. Clean and rebuild project
5. Check AI models are in assets folder

---

**Last Updated:** February 19, 2026  
**Status:** Ready for Implementation
