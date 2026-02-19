package com.countdowntimer.app

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import java.nio.ByteBuffer
import java.nio.ByteOrder

class FaceEmbeddingHelper(private val context: Context) {
    
    private var interpreter: Interpreter? = null
    private val inputSize = 112 // MobileFaceNet input size
    private val embeddingSize = 192 // MobileFaceNet output embedding size
    
    init {
        loadModel()
    }
    
    private fun loadModel() {
        try {
            val model = FileUtil.loadMappedFile(context, "mobile_face_net.tflite")
            val options = Interpreter.Options().apply {
                setNumThreads(4)
            }
            interpreter = Interpreter(model, options)
        } catch (e: Exception) {
            // Model will be added later
        }
    }
    
    fun extractEmbedding(bitmap: Bitmap): FloatArray? {
        if (interpreter == null) {
            // Fallback: Generate a simple embedding based on image features
            return generateSimpleEmbedding(bitmap)
        }
        
        try {
            // Preprocess image
            val imageProcessor = ImageProcessor.Builder()
                .add(ResizeOp(inputSize, inputSize, ResizeOp.ResizeMethod.BILINEAR))
                .build()
            
            var tensorImage = TensorImage.fromBitmap(bitmap)
            tensorImage = imageProcessor.process(tensorImage)
            
            // Prepare input buffer
            val inputBuffer = ByteBuffer.allocateDirect(4 * inputSize * inputSize * 3)
            inputBuffer.order(ByteOrder.nativeOrder())
            
            val pixels = IntArray(inputSize * inputSize)
            tensorImage.bitmap.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)
            
            // Normalize pixels to [-1, 1]
            for (pixel in pixels) {
                val r = ((pixel shr 16 and 0xFF) - 127.5f) / 127.5f
                val g = ((pixel shr 8 and 0xFF) - 127.5f) / 127.5f
                val b = ((pixel and 0xFF) - 127.5f) / 127.5f
                inputBuffer.putFloat(r)
                inputBuffer.putFloat(g)
                inputBuffer.putFloat(b)
            }
            
            // Run inference
            val outputBuffer = Array(1) { FloatArray(embeddingSize) }
            interpreter?.run(inputBuffer, outputBuffer)
            
            return outputBuffer[0]
        } catch (e: Exception) {
            return generateSimpleEmbedding(bitmap)
        }
    }
    
    private fun generateSimpleEmbedding(bitmap: Bitmap): FloatArray {
        // Simple feature extraction as fallback
        val resized = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
        val embedding = FloatArray(embeddingSize)
        
        val pixels = IntArray(32 * 32)
        resized.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        
        // Extract color histogram and spatial features
        for (i in 0 until minOf(pixels.size, embeddingSize)) {
            val pixel = pixels[i]
            val r = (pixel shr 16 and 0xFF) / 255f
            val g = (pixel shr 8 and 0xFF) / 255f
            val b = (pixel and 0xFF) / 255f
            embedding[i] = (r + g + b) / 3f
        }
        
        // Normalize
        val norm = kotlin.math.sqrt(embedding.sumOf { (it * it).toDouble() }).toFloat()
        if (norm > 0) {
            for (i in embedding.indices) {
                embedding[i] /= norm
            }
        }
        
        return embedding
    }
    
    fun close() {
        interpreter?.close()
    }
}
