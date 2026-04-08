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
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

class TimerService : Service() {

    companion object {
        const val TAG = "TimerService"
        const val CHANNEL_ID = "attendance_timer_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"

        // ── Shared state (readable from TimerModule without binding) ──────────
        @Volatile var elapsedSeconds: Long = 0L
        @Volatile var isRunning: Boolean = false
        @Volatile var lectureSubject: String = ""

        // WiFi validation state
        @Volatile var stoppedDueToWifiInvalid: Boolean = false
        @Volatile var authorizedBSSID: String = ""

        /**
         * Boot-relative elapsed time in milliseconds.
         * SystemClock.elapsedRealtime() counts from device boot and CANNOT be
         * changed by the user adjusting the device clock or date/time settings.
         * Exposed so JS can use it as a spoof-proof time source.
         */
        @Volatile var bootElapsedMs: Long = 0L
    }

    private val binder = LocalBinder()
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null

    // Anchor: boot-relative ms when this timer run started
    private var startBootMs: Long = 0L
    // Accumulated seconds from previous runs (resume support)
    private var baseSeconds: Long = 0L

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
                val subject   = intent.getStringExtra("subject") ?: ""
                val resumeFrom = intent.getLongExtra("resumeFrom", 0L)
                val bssid     = intent.getStringExtra("authorizedBSSID") ?: ""
                startTimer(subject, resumeFrom, bssid)
            }
            ACTION_STOP -> stopTimer()
        }
        return START_NOT_STICKY
    }

    private fun startTimer(subject: String, resumeFrom: Long, bssid: String) {
        lectureSubject        = subject
        baseSeconds           = resumeFrom
        // ── KEY CHANGE: anchor to boot-relative clock, not wall clock ─────────
        startBootMs           = SystemClock.elapsedRealtime()
        isRunning             = true
        elapsedSeconds        = resumeFrom
        authorizedBSSID       = bssid
        stoppedDueToWifiInvalid = false
        bssidCheckCounter     = 0L

        updateNotification()
        handler.post(tickRunnable)
        Log.d(TAG, "Timer started (boot-anchored): subject=$subject resumeFrom=${resumeFrom}s")
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
        super.onTaskRemoved(rootIntent)
    }

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            // ── Boot-relative elapsed — immune to device clock changes ────────
            val bootNow = SystemClock.elapsedRealtime()
            elapsedSeconds = baseSeconds + (bootNow - startBootMs) / 1000L

            // Expose current boot-elapsed for JS to read
            bootElapsedMs = bootNow

            updateNotification()

            // Periodic BSSID check every 60 s
            bssidCheckCounter += 1000L
            if (bssidCheckCounter >= BSSID_CHECK_INTERVAL_MS) {
                bssidCheckCounter = 0L
                checkBSSIDInBackground()
            }

            handler.postDelayed(this, 1000L)
        }
    }

    private fun checkBSSIDInBackground() {
        try {
            if (authorizedBSSID.isBlank()) return

            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            if (!wm.isWifiEnabled) {
                Log.w(TAG, "BSSID check: WiFi disabled — stopping timer")
                stoppedDueToWifiInvalid = true
                stopTimer()
                return
            }

            @Suppress("DEPRECATION")
            val currentBSSID = wm.connectionInfo?.bssid

            // Null / OEM fake value when screen off — give benefit of the doubt
            if (currentBSSID == null ||
                currentBSSID == "02:00:00:00:00:00" ||
                currentBSSID == "null") {
                Log.w(TAG, "BSSID check: null/fake — skipping (OEM screen-off limitation)")
                return
            }

            val normalizedCurrent = currentBSSID.lowercase().trim()
            val authorizedList = authorizedBSSID.lowercase()
                .split(",").map { it.trim() }.filter { it.isNotBlank() }

            if (!authorizedList.any { it == normalizedCurrent }) {
                Log.w(TAG, "BSSID MISMATCH — student left classroom. current=$normalizedCurrent")
                stoppedDueToWifiInvalid = true
                stopTimer()
            }
        } catch (e: Exception) {
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
                CHANNEL_ID, "Attendance Timer", NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Shows attendance timer while class is in progress"
                setShowBadge(false); setSound(null, null); enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val title = if (lectureSubject.isNotEmpty()) "Attending: $lectureSubject" else "Attendance Timer"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("Time: ${formatSeconds(elapsedSeconds)}")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentIntent(pi)
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun formatSeconds(s: Long): String {
        val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%02d:%02d".format(m, sec)
    }

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(tickRunnable)
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
