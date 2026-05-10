# LetsBunk Face Enrollment App

## Overview
Android app for enrolling student faces into the LetsBunk attendance system. Uses MediaPipe face detection and MobileFaceNet for face recognition.

## Features
- ✅ Face detection with MediaPipe
- ✅ Liveness detection (anti-spoofing)
- ✅ Face embedding extraction (192D vector)
- ✅ Multi-frame capture (10 frames averaged)
- ✅ Validates enrollment number against LetsBunk database
- ✅ Stores face data in existing student records

## Prerequisites
- Android Studio
- Android device or emulator (API 24+)
- LetsBunk server running on local network
- Student must be registered in LetsBunk first

## Setup

### 1. Configure Server URL
Edit `app/src/main/res/values/config.xml`:
```xml
<string name="server_base_url">http://YOUR_COMPUTER_IP:3000/api</string>
```

Current configuration: `http://192.168.1.6:3000/api`

### 2. Build APK
```bash
cd LetsBunk/enrollment-app
gradlew.bat assembleDebug
```

APK location: `app/build/outputs/apk/debug/app-debug.apk`

### 3. Install on Device
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## How to Use

1. **Start LetsBunk Server**
   ```bash
   cd LetsBunk
   node server.js
   ```

2. **Open Enrollment App** on your Android device

3. **Enter Enrollment Number**
   - Must match an existing student in LetsBunk database
   - Example: If student exists with enrollmentNo "2024001", enter "2024001"

4. **Tap "Take Facial Data"**
   - Camera opens with front camera
   - Position face in frame
   - Move head slightly for liveness detection
   - Wait for "Liveness verified!" message
   - App captures 10 frames automatically
   - Returns to main screen

5. **Tap "Save"**
   - Sends face embedding to LetsBunk server
   - Updates student record with face data
   - Shows success message

## API Integration

The app connects to LetsBunk server using these endpoints:

### Enroll Face
```
POST /api/enrollment
Body: {
  "enrollmentNo": "2024001",
  "faceEmbedding": [0.123, 0.456, ..., 0.789] // 192 floats
}
```

### Verify Student Exists
```
POST /api/enrollment/verify
Body: {
  "enrollmentNo": "2024001"
}
```

### Get Enrollment Status
```
GET /api/enrollment/:enrollmentNo
```

## Database Schema

Face data is stored in the `StudentManagement` collection:

```javascript
{
  enrollmentNo: "2024001",
  name: "Student Name",
  email: "student@example.com",
  branch: "B.Tech Data Science",
  semester: "3",
  faceEmbedding: [192 floats], // Face recognition vector
  faceEnrolledAt: Date,         // When face was enrolled
  // ... other student fields
}
```

## AI Models

Located in `app/src/main/assets/`:

1. **face_detection_short_range.tflite** (MediaPipe)
   - Detects faces in camera frames
   - Fast, optimized for mobile

2. **mobile_face_net.tflite** (MobileFaceNet)
   - Extracts 192D face embeddings
   - Input: 112x112 RGB face image
   - Output: 192 normalized floats

## Liveness Detection

Anti-spoofing checks to prevent photo attacks:
- Head movement detection
- Texture analysis (2D vs 3D face)
- Brightness variation
- Optional blink detection

## Troubleshooting

### "Student not found" error
- Ensure student is registered in LetsBunk admin panel first
- Check enrollment number spelling/format
- Verify database connection

### "Network error"
- Check if LetsBunk server is running
- Verify IP address in config.xml
- Ensure phone and computer on same WiFi
- Check firewall settings

### Camera not working
- Grant camera permission in app settings
- Check if another app is using camera
- Restart app

### Face not detected
- Ensure good lighting
- Position face clearly in frame
- Remove glasses/mask if needed
- Try different angle

## Security Notes

- Face embeddings are stored (not raw images)
- Liveness detection prevents photo spoofing
- Enrollment numbers validated against database
- Use HTTPS in production
- Add API authentication for production

## Project Structure

```
enrollment-app/
├── app/
│   ├── src/main/
│   │   ├── java/com/example/enrollmentapp/
│   │   │   ├── MainActivity.kt          # Main enrollment form
│   │   │   ├── CameraActivity.kt        # Camera capture
│   │   │   ├── ApiService.kt            # Server communication
│   │   │   ├── FaceDetectionHelper.kt   # MediaPipe face detection
│   │   │   ├── FaceEmbeddingHelper.kt   # Face embedding extraction
│   │   │   └── LivenessDetector.kt      # Anti-spoofing
│   │   ├── res/
│   │   │   ├── layout/                  # UI layouts
│   │   │   └── values/config.xml        # Server URL config
│   │   └── assets/                      # AI models (.tflite)
│   └── build.gradle.kts
├── gradle/
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

## Dependencies

- CameraX (camera handling)
- MediaPipe Tasks Vision (face detection)
- TensorFlow Lite (face embeddings)
- Kotlin Coroutines (async operations)

## Next Steps

After enrolling faces:
1. Students can use face verification in LetsBunk app
2. Face data used for attendance verification
3. Admin can view enrolled students in admin panel

## Support

For issues or questions:
1. Check LetsBunk server logs
2. Check Android logcat for app errors
3. Verify network connectivity
4. Ensure student exists in database
