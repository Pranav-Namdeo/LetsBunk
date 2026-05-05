package com.countdowntimer.app

import android.content.Intent
import android.os.Build
import android.os.SystemClock
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class TimerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "TimerModule"

    /**
     * Start the foreground timer service (legacy — no BSSID validation).
     */
    @ReactMethod
    fun startTimer(subject: String, resumeFromSeconds: Double, promise: Promise) {
        startTimerWithBSSID(subject, resumeFromSeconds, "", promise)
    }

    /**
     * Start the foreground timer service with native BSSID validation.
     * Also receives studentId + serverUrl so the native service can sync
     * attendance to the server while the app is in the background.
     */
    @ReactMethod
    fun startTimerWithBSSID(subject: String, resumeFromSeconds: Double, authorizedBSSID: String, promise: Promise) {
        startTimerWithBSSIDAndSync(subject, resumeFromSeconds, authorizedBSSID, "", "", promise)
    }

    /**
     * Start the foreground timer service with native BSSID validation AND background sync.
     */
    @ReactMethod
    fun startTimerWithBSSIDAndSync(
        subject: String,
        resumeFromSeconds: Double,
        authorizedBSSID: String,
        studentId: String,
        serverUrl: String,
        promise: Promise
    ) {
        try {
            val intent = Intent(reactContext, TimerService::class.java).apply {
                action = TimerService.ACTION_START
                putExtra("subject", subject)
                putExtra("resumeFrom", resumeFromSeconds.toLong())
                putExtra("authorizedBSSID", authorizedBSSID)
                putExtra("studentId", studentId)
                putExtra("serverUrl", serverUrl)
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

    /** Stop the foreground timer service. */
    @ReactMethod
    fun stopTimer(promise: Promise) {
        try {
            reactContext.startService(Intent(reactContext, TimerService::class.java).apply {
                action = TimerService.ACTION_STOP
            })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Get elapsed seconds, WiFi validation state, and boot-relative time.
     *
     * Returns:
     *   seconds               — timer elapsed seconds (boot-anchored)
     *   isRunning             — whether native timer is running
     *   stoppedDueToWifiInvalid — true if native BSSID check stopped the timer
     *   bootElapsedMs         — SystemClock.elapsedRealtime() right now (ms since boot)
     *                           JS uses this as a spoof-proof monotonic clock
     */
    @ReactMethod
    fun getElapsedSeconds(promise: Promise) {
        val result = WritableNativeMap()
        result.putDouble("seconds", TimerService.elapsedSeconds.toDouble())
        result.putBoolean("isRunning", TimerService.isRunning)
        result.putBoolean("stoppedDueToWifiInvalid", TimerService.stoppedDueToWifiInvalid)
        // Always return current boot-elapsed so JS can use it even when timer is stopped
        result.putDouble("bootElapsedMs", SystemClock.elapsedRealtime().toDouble())
        promise.resolve(result)
    }

    /**
     * Get the current boot-elapsed time without any timer state.
     * JS calls this to anchor its own elapsed calculations to boot time.
     */
    @ReactMethod
    fun getBootElapsedMs(promise: Promise) {
        val result = WritableNativeMap()
        result.putDouble("bootElapsedMs", SystemClock.elapsedRealtime().toDouble())
        // Also return wall-clock so JS can compute the boot epoch:
        //   bootEpoch = System.currentTimeMillis() - elapsedRealtime()
        result.putDouble("wallClockMs", System.currentTimeMillis().toDouble())
        promise.resolve(result)
    }

    /** Reset the stoppedDueToWifiInvalid flag after JS has handled it. */
    @ReactMethod
    fun clearWifiInvalidFlag(promise: Promise) {
        TimerService.stoppedDueToWifiInvalid = false
        promise.resolve(true)
    }

    /**
     * Request battery optimization exemption so Android doesn't kill the timer service.
     * Should be called once when the student first starts the timer.
     */
    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
                if (!pm.isIgnoringBatteryOptimizations(reactContext.packageName)) {
                    val intent = android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = android.net.Uri.parse("package:${reactContext.packageName}")
                        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                    promise.resolve("requested")
                } else {
                    promise.resolve("already_exempt")
                }
            } else {
                promise.resolve("not_needed")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
