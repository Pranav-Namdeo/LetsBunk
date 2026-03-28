package com.countdowntimer.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
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
    }

    private val binder = LocalBinder()
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var startEpoch: Long = 0L   // wall-clock ms when timer (re)started
    private var baseSeconds: Long = 0L  // accumulated seconds before this run

    inner class LocalBinder : Binder() {
        fun getService(): TimerService = this@TimerService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // WakeLock acquired here so it's held before startForeground
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Call startForeground immediately — Android requires this within 5s of
        // startForegroundService() or the system will ANR-kill the service.
        // Use a placeholder notification first, then update it in startTimer().
        startForeground(NOTIFICATION_ID, buildNotification())

        when (intent?.action) {
            ACTION_START -> {
                val subject = intent.getStringExtra("subject") ?: ""
                val resumeFrom = intent.getLongExtra("resumeFrom", 0L)
                startTimer(subject, resumeFrom)
            }
            ACTION_STOP -> stopTimer()
        }
        return START_STICKY
    }

    private fun startTimer(subject: String, resumeFrom: Long) {
        lectureSubject = subject
        baseSeconds = resumeFrom
        startEpoch = System.currentTimeMillis()
        isRunning = true
        elapsedSeconds = resumeFrom

        // Update notification with actual subject now that we have it
        updateNotification()
        handler.post(tickRunnable)
        Log.d(TAG, "Timer started for: $subject, resuming from $resumeFrom s")
    }

    fun stopTimer() {
        isRunning = false
        handler.removeCallbacks(tickRunnable)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.d(TAG, "Timer stopped at ${elapsedSeconds}s")
    }

    // Called when user swipes app from recents — restart the service so timer survives
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (isRunning) {
            val restartIntent = Intent(applicationContext, TimerService::class.java).apply {
                action = ACTION_START
                putExtra("subject", lectureSubject)
                putExtra("resumeFrom", elapsedSeconds)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(restartIntent)
            } else {
                applicationContext.startService(restartIntent)
            }
            Log.d(TAG, "onTaskRemoved — restarting service to preserve timer")
        }
        super.onTaskRemoved(rootIntent)
    }

    private val tickRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            // Timestamp-based: never drifts even if handler is delayed
            elapsedSeconds = baseSeconds + (System.currentTimeMillis() - startEpoch) / 1000L
            updateNotification()
            handler.postDelayed(this, 1000L)
        }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LetsBunk::TimerWakeLock"
        ).also { it.acquire(4 * 60 * 60 * 1000L) } // max 4 hours
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Attendance Timer",
                NotificationManager.IMPORTANCE_DEFAULT  // DEFAULT, not LOW — OEM battery managers
                                                        // suppress LOW importance foreground services
            ).apply {
                description = "Shows attendance timer while class is in progress"
                setShowBadge(false)
                setSound(null, null)  // Silent but not LOW importance
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
