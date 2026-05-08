package com.example.enrollmentapp

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import java.nio.ByteBuffer
import java.nio.ByteOrder

class FaceEmbeddingHelper(private val context: Context) {

    companion object {
        private const val TAG = "FaceEmbeddingHelper"
        private const val MODEL_FILE = "mobile_face_net.tflite"
        private const val INPUT_SIZE = 112   // MobileFaceNet input: 112×112
        private const val EMBEDDING_SIZE = 192 // MobileFaceNet output: 192D vector
    }

    private var interpreter: Interpreter? = null

    /** True only when the real TFLite model is loaded and ready */
    val isModelReady: Boolean get() = interpreter != null

    init {
        loadModel()
    }

    private fun loadModel() {
        try {
            val model = FileUtil.loadMappedFile(context, MODEL_FILE)
            val options = Interpreter.Options().apply { setNumThreads(4) }
            interpreter = Interpreter(model, options)
            Log.i(TAG, "MobileFaceNet model loaded successfully")
        } catch (e: Exception) {
            // Log clearly — callers must check isModelReady before proceeding
            Log.e(TAG, "Failed to load $MODEL_FILE: ${e.message}", e)
            interpreter = null
        }
    }

    /**
     * Extracts a 192D face embedding from [bitmap].
     * Returns null if the model is not loaded or inference fails.
     * Callers should check [isModelReady] before calling this and surface an
     * error to the user if the model is unavailable.
     */
    fun extractEmbedding(bitmap: Bitmap): FloatArray? {
        if (interpreter == null) {
            Log.e(TAG, "extractEmbedding called but model is not loaded")
            return null
        }

        return try {
            val imageProcessor = ImageProcessor.Builder()
                .add(ResizeOp(INPUT_SIZE, INPUT_SIZE, ResizeOp.ResizeMethod.BILINEAR))
                .build()

            var tensorImage = TensorImage.fromBitmap(bitmap)
            tensorImage = imageProcessor.process(tensorImage)

            // Prepare input buffer: 112 × 112 × 3 floats, normalized to [-1, 1]
            val inputBuffer = ByteBuffer
                .allocateDirect(4 * INPUT_SIZE * INPUT_SIZE * 3)
                .order(ByteOrder.nativeOrder())

            val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
            tensorImage.bitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

            for (pixel in pixels) {
                inputBuffer.putFloat(((pixel shr 16 and 0xFF) - 127.5f) / 127.5f) // R
                inputBuffer.putFloat(((pixel shr 8  and 0xFF) - 127.5f) / 127.5f) // G
                inputBuffer.putFloat(((pixel        and 0xFF) - 127.5f) / 127.5f) // B
            }

            val output = Array(1) { FloatArray(EMBEDDING_SIZE) }
            interpreter!!.run(inputBuffer, output)

            output[0]
        } catch (e: Exception) {
            Log.e(TAG, "Inference failed: ${e.message}", e)
            null
        }
    }

    fun close() {
        interpreter?.close()
        interpreter = null
    }
}
