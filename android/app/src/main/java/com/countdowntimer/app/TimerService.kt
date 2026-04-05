package com.countdowntimer.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class TimerService : Service() {

    companion object {
        const val TAG = "TimerService"
        const val CHANNEL_ID = "attendance_timer_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"

        // Shared state — readable from the module without binding
        @Volatile var elapsedSeconds: Long = 0L
        @Volatile var isRunning: Boolean = false
        @Volatile var lectureSubject: String = ""

        // WiFi validation state — JS reads this on foreground resume
        @Volatile var stoppedDueToWifiInvalid: Boolean = false
        @Volatile var authorizedBSSID: String = ""   // set by JS via startTimer
    }

    private val binder = LocalBinder()
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var startEpoch: Long = 0L
    private var baseSeconds: Long = 0L

    // BSSID check every 60 seconds
    private val BSSID_CHECK_INTERVAL_MS = 60_000L
    private var bssidCheckCounter = 0L

    inner class LocalBinder : Binder() {
        fun getService(): TimerService = this@TimerService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        when (intent?.action) {
            ACTION_START -> {
                val subject = intent.getStringExtra("subject") ?: ""
                val resumeFrom = intent.getLongExtra("resumeFrom", 0L)
                val bssid = intent.getStringExtra("authorizedBSSID") ?: ""
                startTimer(subject, resumeFrom, bssid)
            }
            ACTION_STOP -> stopTimer()
        }
        return START_NOT_STICKY
    }

    private fun startTimer(subject: String, resumeFrom: Long, bssid: String) {
        lectureSubject = subject
        baseSeconds = resumeFrom
        startEpoch = SystemClock.elapsedRealtime() // monotonic — immune to clock changes
        isRunning = true
        elapsedSeconds = resumeFrom
        authorizedBSSID = bssid
        stoppedDueToWifiInvalid = false
        bssidCheckCounter = 0L

        updateNotification()
        handler.post(tickRunnable)
        Log.d(TAG, "Timer started: subject=$subject resumeFrom=${resumeFrom}s authorizedBSSID=$bssid")
    }

    fun stopTimer() {
        isRunning = false
        handler.removeCallbacks(tickRunnable)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.d(TAG, "Timer stopped at ${elapsedSeconds}s")
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopTimer()
        Log.d(TAG, "onTaskRemoved — stopping timer")
        super.onTaskRemoved(rootIntent)
    }

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            // Monotonic elapsed — SystemClock.elapsedRealtime() cannot be changed by user
            elapsedSeconds = baseSeconds + (SystemClock.elapsedRealtime() - startEpoch) / 1000L
            updateNotification()

            // Periodic BSSID check every 60 seconds
            bssidCheckCounter += 1000L
            if (bssidCheckCounter >= BSSID_CHECK_INTERVAL_MS) {
                bssidCheckCounter = 0L
                checkBSSIDInBackground()
            }

            handler.postDelayed(this, 1000L)
        }
    }

    /**
     * Check WiFi BSSID directly from native layer.
     * This works reliably in a foreground service even when the screen is off,
     * unlike JS-side WiFi APIs which return null on OEM devices (MIUI, OneUI).
     *
     * If the authorized BSSID is set and the current BSSID doesn't match,
     * the timer is stopped and stoppedDueToWifiInvalid is set to true so JS
     * can handle it when the app comes back to foreground.
     */
    private fun checkBSSIDInBackground() {
        try {
            // If no authorized BSSID was configured, skip validation
            if (authorizedBSSID.isBlank()) {
                Log.d(TAG, "BSSID check skipped — no authorized BSSID configured")
                return
            }

            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

            if (!wifiManager.isWifiEnabled) {
                Log.w(TAG, "BSSID check: WiFi disabled — stopping timer")
                stoppedDueToWifiInvalid = true
                stopTimer()
                return
            }

            @Suppress("DEPRECATION")
            val wifiInfo = wifiManager.connectionInfo
            val currentBSSID = wifiInfo?.bssid

            Log.d(TAG, "BSSID check: current=$currentBSSID authorized=$authorizedBSSID")

            if (currentBSSID == null || currentBSSID == "02:00:00:00:00:00" || currentBSSID == "null") {
                // BSSID is null/fake — WiFi disconnected or screen-off API limitation.
                // On some OEMs (MIUI) BSSID returns 02:00:00:00:00:00 when screen is off.
                // We give benefit of the doubt here — only stop if we get a REAL different BSSID.
                Log.w(TAG, "BSSID check: null/fake BSSID detected — skipping (OEM screen-off limitation)")
                return
            }

            // Normalize both BSSIDs to lowercase for comparison
            val normalizedCurrent = currentBSSID.lowercase().trim()

            // authorizedBSSID may be a comma-separated list (multiple BSSIDs per room)
            val authorizedList = authorizedBSSID.lowercase().split(",").map { it.trim() }.filter { it.isNotBlank() }

            val isAuthorized = authorizedList.any { it == normalizedCurrent }

            if (!isAuthorized) {
                Log.w(TAG, "BSSID MISMATCH — student left classroom. current=$normalizedCurrent authorized=$authorizedList")
                stoppedDueToWifiInvalid = true
                stopTimer()
            } else {
                Log.d(TAG, "BSSID check passed ✅ current=$normalizedCurrent")
            }

        } catch (e: Exception) {
            // Never crash the service on a BSSID check failure
            Log.e(TAG, "BSSID check error (non-fatal): ${e.message}")
        }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LetsBunk::TimerWakeLock"
        ).also { it.acquire(4 * 60 * 60 * 1000L) }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Attendance Timer",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Shows attendance timer while class is in progress"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val formatted = formatSeconds(elapsedSeconds)
        val title = if (lectureSubject.isNotEmpty()) "Attending: $lectureSubject" else "Attendance Timer"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("Time: $formatted")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
    }

    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun formatSeconds(s: Long): String {
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, sec)
        else "%02d:%02d".format(m, sec)
    }

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(tickRunnable)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
