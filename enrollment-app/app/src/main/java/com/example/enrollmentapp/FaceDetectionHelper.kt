package com.example.enrollmentapp

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
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
    companion object {
        private const val TAG = "FaceDetectionHelper"
    }

    private var faceDetector: FaceDetector? = null

    /** True only when the detector was successfully created */
    val isReady: Boolean get() = faceDetector != null

    /**
     * Must be called from a background thread (e.g. inside a coroutine on
     * Dispatchers.IO or from the camera executor thread).
     * MediaPipe's native initializer requires a non-main-thread call stack.
     */
    fun initialize() {
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
            Log.i(TAG, "FaceDetector initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize FaceDetector: ${e.message}", e)
            onError("Failed to initialize face detector: ${e.message}")
        }
    }

    fun detectFace(bitmap: Bitmap): FaceDetectorResult? {
        if (faceDetector == null) return null
        return try {
            val mpImage = BitmapImageBuilder(bitmap).build()
            faceDetector?.detect(mpImage)
        } catch (e: Exception) {
            Log.e(TAG, "Face detection failed: ${e.message}", e)
            null
        }
    }

    fun close() {
        try {
            faceDetector?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing FaceDetector: ${e.message}")
        }
        faceDetector = null
    }
}
