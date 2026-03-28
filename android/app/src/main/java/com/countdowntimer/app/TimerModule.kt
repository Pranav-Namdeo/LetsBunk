package com.countdowntimer.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class TimerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "TimerModule"

    /** Start the foreground timer service */
    @ReactMethod
    fun startTimer(subject: String, resumeFromSeconds: Double, promise: Promise) {
        try {
            val intent = Intent(reactContext, TimerService::class.java).apply {
                action = TimerService.ACTION_START
                putExtra("subject", subject)
                putExtra("resumeFrom", resumeFromSeconds.toLong())
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    /** Stop the foreground timer service */
    @ReactMethod
    fun stopTimer(promise: Promise) {
        try {
            val intent = Intent(reactContext, TimerService::class.java).apply {
                action = TimerService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /** Get current elapsed seconds directly from the service's shared state */
    @ReactMethod
    fun getElapsedSeconds(promise: Promise) {
        val result = WritableNativeMap()
        result.putDouble("seconds", TimerService.elapsedSeconds.toDouble())
        result.putBoolean("isRunning", TimerService.isRunning)
        promise.resolve(result)
    }
}
