package com.example.enrollmentapp

import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var progressText: TextView
    private lateinit var livenessStatus: TextView
    private lateinit var takeDataButton: Button

    private lateinit var cameraExecutor: ExecutorService

    // Helpers are created lazily on the camera executor thread to avoid
    // MediaPipe's "no caller found on the stack" crash when initializing
    // on the main thread.
    private var faceDetectionHelper: FaceDetectionHelper? = null
    private lateinit var faceEmbeddingHelper: FaceEmbeddingHelper
    private lateinit var livenessDetector: LivenessDetector

    private val capturedEmbeddings = mutableListOf<FloatArray>()
    private val maxFrames = 10
    private var isProcessing = false
    private var livenessVerified = false
    private var readyToCapture = false

    // Set to true once the background init completes successfully
    @Volatile private var helpersReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_camera)

        previewView    = findViewById(R.id.previewView)
        statusText     = findViewById(R.id.statusText)
        progressText   = findViewById(R.id.progressText)
        livenessStatus = findViewById(R.id.livenessStatus)
        takeDataButton = findViewById(R.id.takeDataButton)

        // Single-thread executor — all camera + ML work runs here
        cameraExecutor = Executors.newSingleThreadExecutor()

        faceEmbeddingHelper = FaceEmbeddingHelper(this)
        livenessDetector    = LivenessDetector()

        // Check TFLite model availability up-front
        if (!faceEmbeddingHelper.isModelReady) {
            statusText.text = "Error: Face model failed to load. Cannot enroll."
            takeDataButton.isEnabled = false
            Toast.makeText(
                this,
                "Face recognition model is missing. Please reinstall the app.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        // Initialize MediaPipe on the background executor — NOT on the main thread
        statusText.text = "Initializing camera..."
        takeDataButton.isEnabled = false

        cameraExecutor.execute {
            val helper = FaceDetectionHelper(
                context   = this,
                onResults = { },
                onError   = { error ->
                    runOnUiThread {
                        Toast.makeText(this, error, Toast.LENGTH_SHORT).show()
                    }
                }
            )
            helper.initialize()   // safe here — runs on background thread
            faceDetectionHelper = helper
            helpersReady = true

            runOnUiThread {
                if (helper.isReady) {
                    statusText.text = "Position your face inside the oval, then tap Take Data"
                    takeDataButton.isEnabled = true
                } else {
                    statusText.text = "Face detector failed to initialize."
                    takeDataButton.isEnabled = false
                }
            }
        }

        takeDataButton.setOnClickListener {
            readyToCapture = true
            takeDataButton.visibility = View.GONE
            livenessDetector.reset()
            statusText.text     = "Please move your head slightly to verify liveness"
            livenessStatus.text = "Liveness check: Starting..."
            progressText.text   = "Frames: 0/$maxFrames"
        }

        startCamera()
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy -> processImage(imageProxy) }
                }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    imageAnalyzer
                )
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Camera initialization failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun processImage(imageProxy: ImageProxy) {
        // Don't process until helpers are ready and user tapped Take Data
        if (!helpersReady || !readyToCapture) {
            imageProxy.close()
            return
        }
        if (isProcessing || capturedEmbeddings.size >= maxFrames) {
            imageProxy.close()
            return
        }

        val detector = faceDetectionHelper ?: run {
            imageProxy.close()
            return
        }

        isProcessing = true

        val bitmap        = imageProxy.toBitmap()
        val rotatedBitmap = rotateBitmap(bitmap, imageProxy.imageInfo.rotationDegrees.toFloat())
        val detectionResult = detector.detectFace(rotatedBitmap)

        if (detectionResult != null && detectionResult.detections().isNotEmpty()) {
            val detection   = detectionResult.detections()[0]
            val boundingBox = detection.boundingBox()

            if (!livenessVerified) {
                val livenessResult = livenessDetector.analyzeLiveness(detectionResult, rotatedBitmap)

                runOnUiThread {
                    statusText.text     = livenessResult.message
                    livenessStatus.text = "Liveness: ${livenessDetector.getProgress()}"
                    livenessStatus.setTextColor(
                        if (livenessResult.isLive) 0xFF4CAF50.toInt() else 0xFFFFEB3B.toInt()
                    )
                }

                if (livenessResult.isLive) {
                    livenessVerified = true
                    runOnUiThread {
                        statusText.text     = "Liveness verified! Capturing facial data..."
                        livenessStatus.text = "Liveness: ✓ Verified"
                        livenessStatus.setTextColor(0xFF4CAF50.toInt())
                        progressText.text   = "Frames: 0/$maxFrames"
                    }
                }
            } else {
                val faceBitmap = cropFace(rotatedBitmap, boundingBox)
                val embedding  = faceEmbeddingHelper.extractEmbedding(faceBitmap)

                if (embedding != null) {
                    capturedEmbeddings.add(embedding)
                    runOnUiThread {
                        progressText.text = "Frames: ${capturedEmbeddings.size}/$maxFrames"
                        statusText.text   = "Capturing... Keep your face steady"
                    }
                    if (capturedEmbeddings.size >= maxFrames) finishCapture()
                } else {
                    runOnUiThread { statusText.text = "Processing face..." }
                }
            }
        } else {
            runOnUiThread {
                statusText.text = "No face detected. Position your face in the oval"
                if (!livenessVerified) livenessStatus.text = "Liveness: Waiting for face..."
            }
        }

        isProcessing = false
        imageProxy.close()
    }

    private fun cropFace(bitmap: Bitmap, boundingBox: android.graphics.RectF): Bitmap {
        val left   = maxOf(0, boundingBox.left.toInt())
        val top    = maxOf(0, boundingBox.top.toInt())
        val width  = minOf(bitmap.width  - left, boundingBox.width().toInt())
        val height = minOf(bitmap.height - top,  boundingBox.height().toInt())
        return Bitmap.createBitmap(bitmap, left, top, width, height)
    }

    private fun rotateBitmap(bitmap: Bitmap, degrees: Float): Bitmap {
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun finishCapture() {
        runOnUiThread {
            statusText.text   = "Processing complete!"
            progressText.text = "Captured $maxFrames frames"
        }

        val averageEmbedding = calculateAverageEmbedding(capturedEmbeddings)
        intent.putExtra("face_embedding", averageEmbedding)
        setResult(RESULT_OK, intent)
        finish()
    }

    private fun calculateAverageEmbedding(embeddings: List<FloatArray>): FloatArray {
        val size    = embeddings[0].size
        val average = FloatArray(size)
        for (i in 0 until size) {
            var sum = 0f
            for (e in embeddings) sum += e[i]
            average[i] = sum / embeddings.size
        }
        val norm = kotlin.math.sqrt(average.sumOf { (it * it).toDouble() }).toFloat()
        if (norm > 0f) for (i in average.indices) average[i] /= norm
        return average
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        faceDetectionHelper?.close()
        faceEmbeddingHelper.close()
    }
}

@androidx.camera.core.ExperimentalGetImage
fun ImageProxy.toBitmap(): Bitmap {
    val image  = this.image ?: throw IllegalStateException("Image is null")
    val planes = image.planes
    val yBuffer = planes[0].buffer
    val uBuffer = planes[1].buffer
    val vBuffer = planes[2].buffer

    val ySize = yBuffer.remaining()
    val uSize = uBuffer.remaining()
    val vSize = vBuffer.remaining()

    val nv21 = ByteArray(ySize + uSize + vSize)
    yBuffer.get(nv21, 0, ySize)
    vBuffer.get(nv21, ySize, vSize)
    uBuffer.get(nv21, ySize + vSize, uSize)

    val yuvImage = android.graphics.YuvImage(
        nv21, android.graphics.ImageFormat.NV21, width, height, null
    )
    val out = java.io.ByteArrayOutputStream()
    yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), 100, out)
    return android.graphics.BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
}
