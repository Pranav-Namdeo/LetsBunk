# Required Model Files

Place the following model files in this directory:

1. **face_detection_short_range.tflite** ✓ (Already downloaded)
   - MediaPipe BlazeFace model for face detection

2. **mobile_face_net.tflite** (Required - Please download manually)
   - MobileFaceNet model for face recognition embeddings
   - Download options:
     a) From TensorFlow Hub or similar repositories
     b) Use pre-trained models from face recognition projects
     c) Convert from PyTorch/ONNX models using TFLite converter
   
   - Model specifications:
     * Input: 112x112x3 RGB image
     * Output: 192-dimensional embedding vector
     * Normalization: Pixel values in range [-1, 1]

## Alternative: The app will work without the MobileFaceNet model
- Face detection will still work
- Embedding extraction will be skipped (returns null)
- You can add the model later and rebuild

## How to add models:
1. Download the model files
2. Place them in: app/src/main/assets/
3. Rebuild the app using: gradlew.bat assembleDebug

