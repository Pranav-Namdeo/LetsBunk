package com.countdowntimer.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

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
         */
        @Volatile var bootElapsedMs: Long = 0L
    }

    private val binder = LocalBinder()
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private val networkExecutor = Executors.newSingleThreadExecutor()

    // Anchor: boot-relative ms when this timer run started
    private var startBootMs: Long = 0L
    // Accumulated seconds from previous runs (resume support)
    private var baseSeconds: Long = 0L

    // Background sync state
    private var studentId: String = ""
    private var serverUrl: String = ""
    private var syncTickCounter: Int = 0
    private val SYNC_EVERY_N_TICKS = 30  // sync every 30 seconds

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
                val subject    = intent.getStringExtra("subject") ?: ""
                val resumeFrom = intent.getLongExtra("resumeFrom", 0L)
                val bssid      = intent.getStringExtra("authorizedBSSID") ?: ""
                val sid        = intent.getStringExtra("studentId") ?: ""
                val surl       = intent.getStringExtra("serverUrl") ?: ""
                startTimer(subject, resumeFrom, bssid, sid, surl)
            }
            ACTION_STOP -> stopTimer()
        }
        // START_STICKY: if Android kills the service, restart it automatically
        return START_STICKY
    }

    private fun startTimer(subject: String, resumeFrom: Long, bssid: String, sid: String, surl: String) {
        lectureSubject          = subject
        baseSeconds             = resumeFrom
        startBootMs             = SystemClock.elapsedRealtime()
        isRunning               = true
        elapsedSeconds          = resumeFrom
        authorizedBSSID         = bssid
        studentId               = sid
        serverUrl               = surl
        stoppedDueToWifiInvalid = false
        syncTickCounter         = 0

        updateNotification()
        handler.post(tickRunnable)
        Log.d(TAG, "Timer started: subject=$subject resumeFrom=${resumeFrom}s studentId=$sid")
    }

    fun stopTimer() {
        isRunning = false
        handler.removeCallbacks(tickRunnable)
        // Final sync before stopping
        if (studentId.isNotBlank() && serverUrl.isNotBlank()) {
            syncToServer(isFinalSync = true)
        }
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

            val bootNow = SystemClock.elapsedRealtime()
            elapsedSeconds = baseSeconds + (bootNow - startBootMs) / 1000L
            bootElapsedMs  = bootNow

            updateNotification()

            // BSSID + location check every tick
            checkBSSIDInBackground()

            // Background sync every SYNC_EVERY_N_TICKS seconds
            syncTickCounter++
            if (syncTickCounter >= SYNC_EVERY_N_TICKS) {
                syncTickCounter = 0
                if (studentId.isNotBlank() && serverUrl.isNotBlank()) {
                    syncToServer(isFinalSync = false)
                }
            }

            handler.postDelayed(this, 1000L)
        }
    }

    /**
     * POST attendance sync to server on a background thread.
     * Uses a single-thread executor so syncs never pile up.
     */
    private fun syncToServer(isFinalSync: Boolean) {
        val currentSeconds = elapsedSeconds
        val sid            = studentId
        val surl           = serverUrl
        val subject        = lectureSubject
        val timestamp      = System.currentTimeMillis()

        networkExecutor.execute {
            try {
                val url = URL("$surl/api/attendance/offline-sync")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 10000
                conn.readTimeout    = 10000

                val body = """{"studentId":"$sid","timerSeconds":$currentSeconds,"timestamp":$timestamp,"isRunning":${!isFinalSync},"isPaused":false,"lecture":{"subject":"$subject"},"attendedMinutes":${currentSeconds / 60}}"""

                OutputStreamWriter(conn.outputStream).use { it.write(body) }

                val code = conn.responseCode
                Log.d(TAG, "Background sync: HTTP $code, seconds=$currentSeconds, final=$isFinalSync")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Background sync failed (non-fatal): ${e.message}")
            }
        }
    }

    private fun checkBSSIDInBackground() {
        try {
            if (authorizedBSSID.isBlank()) return

            // ── 1. Check location permission ──────────────────────────────────
            val hasFineLocation = ContextCompat.checkSelfPermission(
                applicationContext,
                android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            val hasCoarseLocation = ContextCompat.checkSelfPermission(
                applicationContext,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFineLocation && !hasCoarseLocation) {
                Log.w(TAG, "BSSID check: location permission revoked — stopping timer")
                stoppedDueToWifiInvalid = true
                stopTimer()
                return
            }

            // ── 2. Check location services (GPS toggle) ───────────────────────
            val locationManager = applicationContext
                .getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val isLocationEnabled = try {
                locationManager.isLocationEnabled
            } catch (e: Exception) {
                Log.w(TAG, "BSSID check: could not read location state — ${e.message}")
                true
            }

            if (!isLocationEnabled) {
                Log.w(TAG, "BSSID check: location services disabled — stopping timer")
                stoppedDueToWifiInvalid = true
                stopTimer()
                return
            }

            // ── 3. Check WiFi enabled ─────────────────────────────────────────
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            if (!wm.isWifiEnabled) {
                Log.w(TAG, "BSSID check: WiFi disabled — stopping timer")
                stoppedDueToWifiInvalid = true
                stopTimer()
                return
            }

            // ── 4. Read current BSSID ─────────────────────────────────────────
            @Suppress("DEPRECATION")
            val currentBSSID = wm.connectionInfo?.bssid

            if (currentBSSID == null ||
                currentBSSID == "02:00:00:00:00:00" ||
                currentBSSID == "null") {
                Log.w(TAG, "BSSID check: null/fake — skipping (OEM screen-off limitation)")
                return
            }

            // ── 5. Compare against authorized list ────────────────────────────
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

        // Request battery optimization exemption so Android doesn't kill the service
        // This is the most important fix for OEM devices (MIUI, OneUI, etc.)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.w(TAG, "Could not request battery optimization exemption: ${e.message}")
                }
            }
        }

        // PARTIAL_WAKE_LOCK keeps CPU running even with screen off
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LetsBunk::TimerWakeLock"
        ).also {
            it.setReferenceCounted(false)
            it.acquire(6 * 60 * 60 * 1000L) // 6 hours max
        }
        Log.d(TAG, "WakeLock acquired")
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
        networkExecutor.shutdown()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
