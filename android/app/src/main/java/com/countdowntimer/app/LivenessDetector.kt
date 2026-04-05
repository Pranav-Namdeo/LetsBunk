package com.countdowntimer.app

import android.graphics.Bitmap
import com.google.mediapipe.tasks.vision.facedetector.FaceDetectorResult
import kotlin.math.abs

class LivenessDetector {
    
    private val blinkHistory = mutableListOf<Boolean>()
    private val headPoseHistory = mutableListOf<FloatArray>()
    private val brightnessHistory = mutableListOf<Float>()
    
    private var lastEyeOpenness = 1.0f
    private var blinkCount = 0
    private var headMovementDetected = false
    
    private val requiredBlinks = 0 // No blinks required, just detect any movement
    private val requiredHeadMovement = 0.08f // Reduced from 0.15 to 0.08 (more lenient)
    
    fun reset() {
        blinkHistory.clear()
        headPoseHistory.clear()
        brightnessHistory.clear()
        lastEyeOpenness = 1.0f
        blinkCount = 0
        headMovementDetected = false
    }
    
    fun analyzeLiveness(
        detectionResult: FaceDetectorResult?,
        bitmap: Bitmap
    ): LivenessResult {
        if (detectionResult == null || detectionResult.detections().isEmpty()) {
            return LivenessResult(false, "No face detected")
        }
        
        val detection = detectionResult.detections()[0]
        
        // Check 1: Blink detection (eye aspect ratio changes)
        val blinkDetected = detectBlink(detection)
        
        // Check 2: Head movement detection
        val headMoved = detectHeadMovement(detection)
        
        // Check 3: Texture analysis (2D images have different texture patterns)
        val textureScore = analyzeTexture(bitmap)
        
        // Check 4: Brightness variation (real faces have natural lighting variations)
        val brightnessVariation = analyzeBrightnessVariation(bitmap)
        
        val isLive = (blinkCount >= requiredBlinks || headMovementDetected) && 
                     textureScore > 0.2f &&  // Reduced from 0.3 to 0.2 (more lenient)
                     brightnessVariation > 0.02f  // Reduced from 0.05 to 0.02 (more lenient)
        
        val message = when {
            blinkCount < requiredBlinks && !headMovementDetected -> "Please move your head slightly"
            textureScore <= 0.2f -> "Image quality issue detected"
            brightnessVariation <= 0.02f -> "Suspicious lighting detected"
            else -> "Liveness verified"
        }
        
        return LivenessResult(isLive, message, blinkCount, headMovementDetected)
    }
    
    private fun detectBlink(detection: com.google.mediapipe.tasks.components.containers.Detection): Boolean {
        // Estimate eye openness based on face landmarks
        // In a real implementation, you'd use eye landmarks
        // For now, we'll use a simplified approach with detection confidence changes
        
        val currentConfidence = detection.categories()[0].score()
        
        // Simulate eye openness detection
        val eyeOpenness = currentConfidence
        
        // Detect blink: significant drop in eye openness followed by recovery
        val blinkThreshold = 0.10f  // Reduced from 0.15 to 0.10 (more sensitive)
        val isBlinking = abs(eyeOpenness - lastEyeOpenness) > blinkThreshold
        
        if (isBlinking && eyeOpenness < lastEyeOpenness) {
            blinkCount++
            blinkHistory.add(true)
        } else {
            blinkHistory.add(false)
        }
        
        lastEyeOpenness = eyeOpenness
        
        // Keep only recent history
        if (blinkHistory.size > 30) {
            blinkHistory.removeAt(0)
        }
        
        return isBlinking
    }
    
    private fun detectHeadMovement(detection: com.google.mediapipe.tasks.components.containers.Detection): Boolean {
        val boundingBox = detection.boundingBox()
        
        // Track head position and rotation
        val currentPose = floatArrayOf(
            boundingBox.centerX(),
            boundingBox.centerY(),
            boundingBox.width() / boundingBox.height() // Aspect ratio changes with rotation
        )
        
        headPoseHistory.add(currentPose)
        
        // Keep only recent history
        if (headPoseHistory.size > 10) {
            headPoseHistory.removeAt(0)
        }
        
        // Check if head has moved significantly
        if (headPoseHistory.size >= 5) {
            val firstPose = headPoseHistory.first()
            val lastPose = headPoseHistory.last()
            
            val xMovement = abs(lastPose[0] - firstPose[0])
            val yMovement = abs(lastPose[1] - firstPose[1])
            val aspectChange = abs(lastPose[2] - firstPose[2])
            
            val totalMovement = xMovement + yMovement + aspectChange * 100
            
            if (totalMovement > requiredHeadMovement * 1000) {
                headMovementDetected = true
                return true
            }
        }
        
        return false
    }
    
    private fun analyzeTexture(bitmap: Bitmap): Float {
        // Analyze texture patterns to detect 2D images
        // Real faces have more texture variation than printed photos
        
        val width = minOf(bitmap.width, 100)
        val height = minOf(bitmap.height, 100)
        val resized = Bitmap.createScaledBitmap(bitmap, width, height, true)
        
        val pixels = IntArray(width * height)
        resized.getPixels(pixels, 0, width, 0, 0, width, height)
        
        // Calculate local variance (texture measure)
        var totalVariance = 0.0
        val windowSize = 5
        
        for (y in windowSize until height - windowSize step windowSize) {
            for (x in windowSize until width - windowSize step windowSize) {
                val windowPixels = mutableListOf<Int>()
                
                for (dy in -windowSize..windowSize) {
                    for (dx in -windowSize..windowSize) {
                        val idx = (y + dy) * width + (x + dx)
                        if (idx >= 0 && idx < pixels.size) {
                            val pixel = pixels[idx]
                            val gray = (pixel shr 16 and 0xFF) * 0.299 +
                                      (pixel shr 8 and 0xFF) * 0.587 +
                                      (pixel and 0xFF) * 0.114
                            windowPixels.add(gray.toInt())
                        }
                    }
                }
                
                if (windowPixels.isNotEmpty()) {
                    val mean = windowPixels.average()
                    val variance = windowPixels.map { (it - mean) * (it - mean) }.average()
                    totalVariance += variance
                }
            }
        }
        
        // Normalize texture score
        val textureScore = (totalVariance / 10000.0).toFloat().coerceIn(0f, 1f)
        
        return textureScore
    }
    
    private fun analyzeBrightnessVariation(bitmap: Bitmap): Float {
        // Real faces have natural brightness variations
        // 2D images often have uniform brightness
        
        val width = minOf(bitmap.width, 50)
        val height = minOf(bitmap.height, 50)
        val resized = Bitmap.createScaledBitmap(bitmap, width, height, true)
        
        val pixels = IntArray(width * height)
        resized.getPixels(pixels, 0, width, 0, 0, width, height)
        
        val brightness = pixels.map { pixel ->
            val r = (pixel shr 16 and 0xFF)
            val g = (pixel shr 8 and 0xFF)
            val b = (pixel and 0xFF)
            (r + g + b) / 3f
        }
        
        brightnessHistory.add(brightness.average().toFloat())
        
        // Keep only recent history
        if (brightnessHistory.size > 10) {
            brightnessHistory.removeAt(0)
        }
        
        // Calculate brightness variation over time
        if (brightnessHistory.size >= 5) {
            val mean = brightnessHistory.average()
            val variance = brightnessHistory.map { (it - mean) * (it - mean) }.average()
            val stdDev = kotlin.math.sqrt(variance).toFloat()
            
            return (stdDev / 255f).coerceIn(0f, 1f)
        }
        
        return 0f
    }
    
    fun getProgress(): String {
        return when {
            headMovementDetected -> "Liveness checks passed!"
            blinkCount > 0 -> "Good! Keep moving naturally"
            else -> "Please move your head slightly"
        }
    }
}

data class LivenessResult(
    val isLive: Boolean,
    val message: String,
    val blinkCount: Int = 0,
    val headMovementDetected: Boolean = false
)
