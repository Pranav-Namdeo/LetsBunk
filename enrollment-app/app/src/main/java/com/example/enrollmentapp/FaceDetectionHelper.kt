package com.example.enrollmentapp

import android.content.Context
import android.graphics.Bitmap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector
import com.google.mediapipe.tasks.vision.facedetector.FaceDetectorResult

class FaceDetectionHelper(
    private val context: Context,
    private val onResults: (FaceDetectorResult) -> Unit,
    private val onError: (String) -> Unit
) {
    private var faceDetector: FaceDetector? = null

    init {
        setupFaceDetector()
    }

    private fun setupFaceDetector() {
        try {
            val baseOptions = BaseOptions.builder()
                .setModelAssetPath("face_detection_short_range.tflite")
                .build()

            val options = FaceDetector.FaceDetectorOptions.builder()
                .setBaseOptions(baseOptions)
                .setMinDetectionConfidence(0.5f)
                .setRunningMode(RunningMode.IMAGE)
                .build()

            faceDetector = FaceDetector.createFromOptions(context, options)
        } catch (e: Exception) {
            onError("Failed to initialize face detector: ${e.message}")
        }
    }

    fun detectFace(bitmap: Bitmap): FaceDetectorResult? {
        return try {
            val mpImage = BitmapImageBuilder(bitmap).build()
            faceDetector?.detect(mpImage)
        } catch (e: Exception) {
            onError("Face detection failed: ${e.message}")
            null
        }
    }

    fun close() {
        faceDetector?.close()
    }
}
