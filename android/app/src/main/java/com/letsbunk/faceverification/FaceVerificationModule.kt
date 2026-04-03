package com.letsbunk.faceverification

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class FaceVerificationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private var verificationPromise: Promise? = null
    
    companion object {
        const val FACE_VERIFICATION_REQUEST = 1001
        const val NAME = "FaceVerificationModule"
    }
    
    override fun getName(): String {
        return NAME
    }
    
    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == FACE_VERIFICATION_REQUEST) {
                if (resultCode == Activity.RESULT_OK && data != null) {
                    val isMatch = data.getBooleanExtra("isMatch", false)
                    val similarity = data.getFloatExtra("similarity", 0f)
                    val distance = data.getFloatExtra("distance", 0f)
                    val message = data.getStringExtra("message") ?: "Unknown result"
                    
                    val result = Arguments.createMap()
                    result.putBoolean("success", isMatch)
                    result.putBoolean("isMatch", isMatch)
                    result.putDouble("similarity", similarity.toDouble())
                    result.putDouble("distance", distance.toDouble())
                    result.putString("message", message)
                    result.putInt("similarityPercentage", (similarity * 100).toInt())
                    
                    verificationPromise?.resolve(result)
                } else {
                    verificationPromise?.reject("VERIFICATION_CANCELLED", "Face verification was cancelled")
                }
                verificationPromise = null
            }
        }
    }
    
    init {
        reactContext.addActivityEventListener(activityEventListener)
    }
    
    @ReactMethod
    fun startFaceVerification(storedEmbeddingArray: ReadableArray, promise: Promise) {
        val activity = currentActivity
        
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Activity doesn't exist")
            return
        }
        
        // Convert ReadableArray to FloatArray
        val storedEmbedding = FloatArray(storedEmbeddingArray.size())
        for (i in 0 until storedEmbeddingArray.size()) {
            storedEmbedding[i] = storedEmbeddingArray.getDouble(i).toFloat()
        }
        
        verificationPromise = promise
        
        try {
            val intent = Intent(activity, FaceVerificationActivity::class.java)
            intent.putExtra("storedEmbedding", storedEmbedding)
            activity.startActivityForResult(intent, FACE_VERIFICATION_REQUEST)
        } catch (e: Exception) {
            promise.reject("START_FAILED", "Failed to start face verification: ${e.message}")
            verificationPromise = null
        }
    }
    
    @ReactMethod
    fun checkFaceDataAvailable(promise: Promise) {
        // This will be called from React Native to check if face data exists
        promise.resolve(true)
    }
}
