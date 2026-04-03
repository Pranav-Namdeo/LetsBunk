package com.letsbunk.faceverification

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.enrollmentapp.FaceDetectionHelper
import com.example.enrollmentapp.FaceEmbeddingHelper
import com.example.enrollmentapp.LivenessDetector
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class FaceVerificationActivity : AppCompatActivity() {
    
    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var progressText: TextView
    private lateinit var livenessStatus: TextView
    
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var faceDetectionHelper: FaceDetectionHelper
    private lateinit var faceEmbeddingHelper: FaceEmbeddingHelper
    private lateinit var livenessDetector: LivenessDetector
    private lateinit var faceComparator: FaceComparator
    
    private lateinit var storedEmbedding: FloatArray
    private val capturedEmbeddings = mutableListOf<FloatArray>()
    private val maxFrames = 10
    private var isProcessing = false
    private var livenessVerified = false
    private var frameCount = 0
    
    private val CAMERA_PERMISSION_CODE = 100
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face_verification)
        
        // Get stored embedding from intent
        storedEmbedding = intent.getFloatArrayExtra("storedEmbedding") ?: run {
            Toast.makeText(this, "Error: No stored face data", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        
        previewView = findViewById(R.id.previewView)
        statusText = findViewById(R.id.statusText)
        progressText = findViewById(R.id.progressText)
        livenessStatus = findViewById(R.id.livenessStatus)
        
        cameraExecutor = Executors.newSingleThreadExecutor()
        
        faceDetectionHelper = FaceDetectionHelper(
            context = this,
            onResults = { },
            onError = { error ->
                runOnUiThread {
                    Toast.makeText(this, error, Toast.LENGTH_SHORT).show()
                }
            }
        )
        
        faceEmbeddingHelper = FaceEmbeddingHelper(this)
        livenessDetector = LivenessDetector()
        faceComparator = FaceComparator()
        
        if (checkCameraPermission()) {
            startCamera()
        } else {
            requestCameraPermission()
        }
    }
    
    private fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.CAMERA),
            CAMERA_PERMISSION_CODE
        )
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
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
                    it.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImage(imageProxy)
                    }
                }
            
            val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA
            
            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this, cameraSelector, preview, imageAnalyzer
                )
            } catch (e: Exception) {
                Toast.makeText(this, "Camera initialization failed", Toast.LENGTH_SHORT).show()
                finish()
            }
            
        }, ContextCompat.getMainExecutor(this))
    }
    
    private fun processImage(imageProxy: ImageProxy) {
        if (isProcessing || capturedEmbeddings.size >= maxFrames) {
            imageProxy.close()
            return
        }
        
        isProcessing = true
        frameCount++
        
        val bitmap = imageProxy.toBitmap()
        val rotatedBitmap = rotateBitmap(bitmap, imageProxy.imageInfo.rotationDegrees.toFloat())
        
        // Detect face
        val detectionResult = faceDetectionHelper.detectFace(rotatedBitmap)
        
        if (detectionResult != null && detectionResult.detections().isNotEmpty()) {
            val detection = detectionResult.detections()[0]
            val boundingBox = detection.boundingBox()
            
            // Perform liveness detection
            if (!livenessVerified) {
                val livenessResult = livenessDetector.analyzeLiveness(detectionResult, rotatedBitmap)
                
                runOnUiThread {
                    statusText.text = livenessResult.message
                    livenessStatus.text = "Liveness: ${livenessDetector.getProgress()}"
                    livenessStatus.setTextColor(
                        if (livenessResult.isLive) 0xFF4CAF50.toInt() else 0xFFFFEB3B.toInt()
                    )
                }
                
                if (livenessResult.isLive) {
                    livenessVerified = true
                    runOnUiThread {
                        statusText.text = "Liveness verified! Capturing facial data..."
                        livenessStatus.text = "Liveness: ✓ Verified"
                        livenessStatus.setTextColor(0xFF4CAF50.toInt())
                        progressText.text = "Frames: 0/$maxFrames"
                    }
                }
            } else {
                // Liveness verified, now capture embeddings
                val faceBitmap = cropFace(rotatedBitmap, boundingBox)
                val embedding = faceEmbeddingHelper.extractEmbedding(faceBitmap)
                
                if (embedding != null) {
                    capturedEmbeddings.add(embedding)
                    
                    runOnUiThread {
                        progressText.text = "Frames: ${capturedEmbeddings.size}/$maxFrames"
                        statusText.text = "Capturing... Keep your face steady"
                    }
                    
                    if (capturedEmbeddings.size >= maxFrames) {
                        finishCapture()
                    }
                } else {
                    runOnUiThread {
                        statusText.text = "Processing face..."
                    }
                }
            }
        } else {
            runOnUiThread {
                statusText.text = "No face detected. Position your face in frame"
                if (!livenessVerified) {
                    livenessStatus.text = "Liveness: Waiting for face..."
                }
            }
        }
        
        isProcessing = false
        imageProxy.close()
    }
    
    private fun cropFace(bitmap: Bitmap, boundingBox: android.graphics.RectF): Bitmap {
        val left = maxOf(0, boundingBox.left.toInt())
        val top = maxOf(0, boundingBox.top.toInt())
        val width = minOf(bitmap.width - left, boundingBox.width().toInt())
        val height = minOf(bitmap.height - top, boundingBox.height().toInt())
        
        return Bitmap.createBitmap(bitmap, left, top, width, height)
    }
    
    private fun rotateBitmap(bitmap: Bitmap, degrees: Float): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(degrees)
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
    
    private fun finishCapture() {
        runOnUiThread {
            statusText.text = "Comparing faces..."
            progressText.text = "Verifying identity..."
        }
        
        // Calculate average embedding
        val averageEmbedding = calculateAverageEmbedding(capturedEmbeddings)
        
        // Compare with stored embedding
        val result = faceComparator.compareFaces(storedEmbedding, averageEmbedding)
        
        // Return result
        val intent = Intent()
        intent.putExtra("isMatch", result.isMatch)
        intent.putExtra("similarity", result.similarity)
        intent.putExtra("distance", result.distance)
        intent.putExtra("message", result.message)
        setResult(RESULT_OK, intent)
        
        runOnUiThread {
            statusText.text = result.message
            progressText.text = if (result.isMatch) "✓ Verified" else "✗ Not Verified"
        }
        
        // Delay before closing
        android.os.Handler(mainLooper).postDelayed({
            finish()
        }, 2000)
    }
    
    private fun calculateAverageEmbedding(embeddings: List<FloatArray>): FloatArray {
        val embeddingSize = embeddings[0].size
        val average = FloatArray(embeddingSize)
        
        for (i in 0 until embeddingSize) {
            var sum = 0f
            for (embedding in embeddings) {
                sum += embedding[i]
            }
            average[i] = sum / embeddings.size
        }
        
        // Normalize the average embedding
        val norm = kotlin.math.sqrt(average.sumOf { (it * it).toDouble() }).toFloat()
        for (i in average.indices) {
            average[i] /= norm
        }
        
        return average
    }
    
    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        faceDetectionHelper.close()
        faceEmbeddingHelper.close()
    }
}

@androidx.camera.core.ExperimentalGetImage
fun ImageProxy.toBitmap(): Bitmap {
    val image = this.image ?: throw IllegalStateException("Image is null")
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
    
    val yuvImage = android.graphics.YuvImage(nv21, android.graphics.ImageFormat.NV21, width, height, null)
    val out = java.io.ByteArrayOutputStream()
    yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), 100, out)
    val imageBytes = out.toByteArray()
    return android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
}
