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

    companion object {
        // Singleton instance for TimerService to access
        var secureStorage: SecureTimerStorage? = null
        
        fun saveTimerSecurely(timerSeconds: Long, studentId: String, lectureInfo: String, periodId: String, isRunning: Boolean) {
            secureStorage?.saveTimerValue(timerSeconds, studentId, lectureInfo, periodId, isRunning)
        }
        
        fun updateTimerSecurely(timerSeconds: Long, isRunning: Boolean) {
            secureStorage?.updateTimerValue(timerSeconds, isRunning)
        }
        
        fun getStoredTimer(): Pair<Long, Boolean>? {
            return secureStorage?.getTimerValue()
        }
        
        fun confirmSyncAndClear() {
            secureStorage?.markSyncConfirmed()
            secureStorage?.clearAllData()
        }
        
        fun hasPendingSync(): Boolean {
            return secureStorage?.hasPendingData() ?: false
        }
    }

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
        startTimerWithBSSIDAndSyncAndEnd(subject, resumeFromSeconds, authorizedBSSID, studentId, serverUrl, "", "", promise)
    }

    /**
     * Start the foreground timer service with BSSID validation, background sync, AND lecture end time.
     * lectureEndTime format: "HH:MM" (e.g. "04:54")
     */
    @ReactMethod
    fun startTimerWithBSSIDAndSyncAndEnd(
        subject: String,
        resumeFromSeconds: Double,
        authorizedBSSID: String,
        studentId: String,
        serverUrl: String,
        lectureEndTime: String,
        periodId: String,
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
                putExtra("lectureEndTime", lectureEndTime)
                putExtra("periodId", periodId)
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
    
    /**
     * Save timer value to secure storage (encrypted, survives app kill/restart)
     */
    @ReactMethod
    fun saveSecureTimer(timerSeconds: Double, studentId: String, lectureInfo: String, periodId: String, isRunning: Boolean, promise: Promise) {
        try {
            secureStorage?.saveTimerValue(
                timerSeconds.toLong(),
                studentId,
                lectureInfo,
                periodId,
                isRunning
            )
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message)
        }
    }
    
    /**
     * Update timer value in secure storage (frequent updates)
     */
    @ReactMethod
    fun updateSecureTimer(timerSeconds: Double, isRunning: Boolean, promise: Promise) {
        try {
            secureStorage?.updateTimerValue(timerSeconds.toLong(), isRunning)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_ERROR", e.message)
        }
    }
    
    /**
     * Get stored timer from secure storage
     */
    @ReactMethod
    fun getSecureTimer(promise: Promise) {
        try {
            val result = WritableNativeMap()
            val stored = secureStorage?.getTimerValue()
            if (stored != null) {
                result.putDouble("timerSeconds", stored.first.toDouble())
                result.putBoolean("isRunning", stored.second)
                result.putBoolean("hasData", true)
            } else {
                result.putBoolean("hasData", false)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_ERROR", e.message)
        }
    }
    
    /**
     * Check if there's pending data to sync
     */
    @ReactMethod
    fun hasPendingSecureData(promise: Promise) {
        promise.resolve(secureStorage?.hasPendingData() ?: false)
    }
    
    /**
     * Confirm sync and clear secure storage (called after server confirms MongoDB write)
     */
    @ReactMethod
    fun confirmSyncAndClear(promise: Promise) {
        try {
            secureStorage?.markSyncConfirmed()
            secureStorage?.clearAllData()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", e.message)
        }
    }
    
    /**
     * Get all secure timer data for debugging
     */
    @ReactMethod
    fun getSecureTimerData(promise: Promise) {
        try {
            val data = secureStorage?.getAllData()
            val result = WritableNativeMap()
            if (data != null) {
                result.putDouble("timerSeconds", (data["timerSeconds"] as? Long ?: 0).toDouble())
                result.putBoolean("isRunning", data["isRunning"] as? Boolean ?: false)
                result.putString("studentId", data["studentId"] as? String ?: "")
                result.putString("lectureInfo", data["lectureInfo"] as? String ?: "")
                result.putString("periodId", data["periodId"] as? String ?: "")
                result.putBoolean("syncConfirmed", data["syncConfirmed"] as? Boolean ?: false)
                result.putBoolean("hasPendingData", data["hasPendingData"] as? Boolean ?: false)
                result.putDouble("lastSyncTime", (data["lastSyncTime"] as? Long ?: 0).toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_DATA_ERROR", e.message)
        }
    }
    /**
     * Encrypt a string using Android Keystore
     */
    @ReactMethod
    fun encryptString(plainText: String, promise: Promise) {
        try {
            val encrypted = TimerModule.secureStorage?.encrypt(plainText)
            if (encrypted != null) {
                promise.resolve(android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP))
            } else {
                promise.reject("ENCRYPT_ERROR", "Encryption failed")
            }
        } catch (e: Exception) {
            promise.reject("ENCRYPT_ERROR", e.message)
        }
    }

    /**
     * Decrypt a string using Android Keystore
     */
    @ReactMethod
    fun decryptString(encryptedBase64: String, promise: Promise) {
        try {
            val encryptedData = android.util.Base64.decode(encryptedBase64, android.util.Base64.NO_WRAP)
            val decrypted = TimerModule.secureStorage?.decrypt(encryptedData)
            promise.resolve(decrypted)
        } catch (e: Exception) {
            promise.reject("DECRYPT_ERROR", e.message)
        }
    }
    /**
     * Save arbitrary redundancy data natively (survives AsyncStorage wipes)
     */
    @ReactMethod
    fun saveRedundancyData(key: String, value: String, promise: Promise) {
        try {
            TimerModule.secureStorage?.saveRedundancyData(key, value)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_REDUNDANCY_ERROR", e.message)
        }
    }

    /**
     * Get arbitrary redundancy data natively
     */
    @ReactMethod
    fun getRedundancyData(key: String, promise: Promise) {
        try {
            val value = TimerModule.secureStorage?.getRedundancyData(key)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("GET_REDUNDANCY_ERROR", e.message)
        }
    }

    /**
     * Clear specific redundancy data natively
     */
    @ReactMethod
    fun clearRedundancyData(key: String, promise: Promise) {
        try {
            TimerModule.secureStorage?.clearRedundancyData(key)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_REDUNDANCY_ERROR", e.message)
        }
    }
}
