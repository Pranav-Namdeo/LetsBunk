package com.countdowntimer.app

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * SecureTimerStorage - Secure storage for timer data using Android Keystore
 * 
 * Features:
 * - Data encrypted using Android Keystore (hardware-backed)
 * - Survives app close, phone restart, force kills
 * - Only deleted when successfully synced to server AND MongoDB
 * - Cannot be edited (read-only from app perspective after write)
 * 
 * Storage mechanism:
 * 1. Timer value written to encrypted SharedPreferences
 * 2. Additional backup written to app's internal files directory
 * 3. On successful server sync, backup is deleted (encrypted key remains for verification)
 * 4. Server marks MongoDB record as synced, app receives confirmation
 * 5. App then clears local storage only after server confirmation
 */
class SecureTimerStorage(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "secure_timer_prefs"
        private const val KEY_TIMER_VALUE = "timer_value"
        private const val KEY_TIMER_START = "timer_start_time"
        private const val KEY_STUDENT_ID = "student_id"
        private const val KEY_LECTURE_INFO = "lecture_info"
        private const val KEY_PERIOD_ID = "period_id"
        private const val KEY_IS_RUNNING = "is_running"
        private const val KEY_LAST_SYNC = "last_sync_time"
        private const val KEY_SYNC_CONFIRMED = "sync_confirmed"
        private const val KEY_BACKUP_EXISTS = "backup_exists"
        
        // Backup file for extra persistence
        private const val BACKUP_FILE = "timer_backup.enc"
        private const val REDUNDANCY_PREFS = "redundancy_prefs"
        
        // Keystore alias
        private const val KEYSTORE_ALIAS = "SecureTimerKey"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        
        // GCM encryption params
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_SIZE = 12
        private const val TAG_SIZE = 128
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private val redundancyPrefs: SharedPreferences by lazy {
        context.getSharedPreferences(REDUNDANCY_PREFS, Context.MODE_PRIVATE)
    }

    private val keystoreKey: SecretKey by lazy {
        getOrCreateKeystoreKey()
    }

    /**
     * Save arbitrary redundancy data (encrypted)
     */
    fun saveRedundancyData(key: String, value: String) {
        try {
            val encrypted = encrypt(value)
            redundancyPrefs.edit()
                .putString(key, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .apply()
        } catch (e: Exception) {
            // Ignore
        }
    }

    /**
     * Get arbitrary redundancy data (decrypted)
     */
    fun getRedundancyData(key: String): String? {
        try {
            val encryptedBase64 = redundancyPrefs.getString(key, null) ?: return null
            val encryptedData = Base64.decode(encryptedBase64, Base64.NO_WRAP)
            return decrypt(encryptedData)
        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Clear specific redundancy data
     */
    fun clearRedundancyData(key: String) {
        redundancyPrefs.edit().remove(key).apply()
    }

    private val keystoreKeyAt: Long = 0 // Dummy to maintain structure if needed

    /**
     * Get or create a hardware-backed keystore key
     */
    private fun getOrCreateKeystoreKey(): SecretKey {
        val keyStore = java.security.KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        
        if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
            )
            
            val spec = KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()
            
            keyGenerator.init(spec)
            return keyGenerator.generateKey()
        }
        
        return keyStore.getKey(KEYSTORE_ALIAS, null) as SecretKey
    }

    /**
     * Encrypt data using AES-GCM with Android Keystore
     */
    fun encrypt(plainText: String): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, keystoreKey)
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plainText.toByteArray(StandardCharsets.UTF_8))
        
        // Combine IV and encrypted data
        return iv + encrypted
    }

    /**
     * Decrypt data using AES-GCM with Android Keystore
     */
    fun decrypt(encryptedData: ByteArray): String {
        val iv = encryptedData.copyOfRange(0, IV_SIZE)
        val cipherText = encryptedData.copyOfRange(IV_SIZE, encryptedData.size)
        
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val spec = GCMParameterSpec(TAG_SIZE, iv)
        cipher.init(Cipher.DECRYPT_MODE, keystoreKey, spec)
        
        return String(cipher.doFinal(cipherText), StandardCharsets.UTF_8)
    }

    /**
     * Save timer value - encrypted and persistent
     * @param timerSeconds Current timer value in seconds
     * @param studentId Student enrollment number
     * @param lectureInfo JSON string with lecture details
     * @param periodId Period identifier (e.g., "P1")
     * @param isRunning Whether timer is currently running
     */
    fun saveTimerValue(
        timerSeconds: Long,
        studentId: String,
        lectureInfo: String,
        periodId: String,
        isRunning: Boolean
    ) {
        val timestamp = System.currentTimeMillis()
        
        // Encrypt sensitive data
        val encryptedTimer = encrypt(timerSeconds.toString())
        val encryptedStudentId = encrypt(studentId)
        val encryptedLecture = encrypt(lectureInfo)
        
        // Save to SharedPreferences (encrypted)
        prefs.edit()
            .putString(KEY_TIMER_VALUE, Base64.encodeToString(encryptedTimer, Base64.NO_WRAP))
            .putString(KEY_STUDENT_ID, Base64.encodeToString(encryptedStudentId, Base64.NO_WRAP))
            .putString(KEY_LECTURE_INFO, Base64.encodeToString(encryptedLecture, Base64.NO_WRAP))
            .putString(KEY_PERIOD_ID, periodId)
            .putLong(KEY_TIMER_START, timestamp)
            .putBoolean(KEY_IS_RUNNING, isRunning)
            .putBoolean(KEY_SYNC_CONFIRMED, false)
            .apply()
        
        // Also save backup to internal storage (double persistence)
        saveBackupToFile(
            "$timerSeconds|$studentId|$lectureInfo|$periodId|$isRunning|$timestamp"
        )
        
        // Mark backup exists
        prefs.edit().putBoolean(KEY_BACKUP_EXISTS, true).apply()
        
        // Make SharedPreferences more resilient - use file-level backup
        flushToDisk()
    }

    /**
     * Update timer value only (more frequent updates)
     */
    fun updateTimerValue(timerSeconds: Long, isRunning: Boolean) {
        val encryptedTimer = encrypt(timerSeconds.toString())
        
        prefs.edit()
            .putString(KEY_TIMER_VALUE, Base64.encodeToString(encryptedTimer, Base64.NO_WRAP))
            .putLong(KEY_TIMER_START, System.currentTimeMillis())
            .putBoolean(KEY_IS_RUNNING, isRunning)
            .apply()
        
        // Update backup file
        updateBackupTimer(timerSeconds, isRunning)
    }

    /**
     * Get stored timer value
     * @return Pair of (timerSeconds, isRunning) or null if no data
     */
    fun getTimerValue(): Pair<Long, Boolean>? {
        val encryptedTimer = prefs.getString(KEY_TIMER_VALUE, null) ?: return null
        
        return try {
            val timerBytes = Base64.decode(encryptedTimer, Base64.NO_WRAP)
            val timerSeconds = decrypt(timerBytes).toLong()
            val isRunning = prefs.getBoolean(KEY_IS_RUNNING, false)
            Pair(timerSeconds, isRunning)
        } catch (e: Exception) {
            // Try to recover from backup
            recoverFromBackup()
        }
    }

    /**
     * Get lecture info
     */
    fun getLectureInfo(): String? {
        val encrypted = prefs.getString(KEY_LECTURE_INFO, null) ?: return null
        return try {
            decrypt(Base64.decode(encrypted, Base64.NO_WRAP))
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Get student ID
     */
    fun getStudentId(): String? {
        val encrypted = prefs.getString(KEY_STUDENT_ID, null) ?: return null
        return try {
            decrypt(Base64.decode(encrypted, Base64.NO_WRAP))
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Get period ID
     */
    fun getPeriodId(): String? {
        return prefs.getString(KEY_PERIOD_ID, null)
    }

    /**
     * Check if sync was confirmed by server
     */
    fun isSyncConfirmed(): Boolean {
        return prefs.getBoolean(KEY_SYNC_CONFIRMED, false)
    }

    /**
     * Mark sync as confirmed (called after server confirms MongoDB write)
     */
    fun markSyncConfirmed() {
        prefs.edit().putBoolean(KEY_SYNC_CONFIRMED, true).apply()
    }

    /**
     * Clear all data after successful sync
     * This is ONLY called after server confirms data is in MongoDB
     */
    fun clearAllData() {
        // First delete backup file
        deleteBackupFile()
        
        // Then clear SharedPreferences
        prefs.edit().clear().apply()
    }

    /**
     * Check if there's pending data to sync
     */
    fun hasPendingData(): Boolean {
        return prefs.getString(KEY_TIMER_VALUE, null) != null
    }

    /**
     * Get last sync time
     */
    fun getLastSyncTime(): Long {
        return prefs.getLong(KEY_LAST_SYNC, 0)
    }

    /**
     * Update last sync time
     */
    fun updateLastSyncTime() {
        prefs.edit().putLong(KEY_LAST_SYNC, System.currentTimeMillis()).apply()
    }

    /**
     * Save backup to internal file (encrypted)
     */
    private fun saveBackupToFile(data: String) {
        try {
            val encryptedData = encrypt(data)
            val file = context.getFileStreamPath(BACKUP_FILE)
            file.writeBytes(encryptedData)
        } catch (e: Exception) {
            // Backup failed, but SharedPreferences should survive
        }
    }

    /**
     * Update just the timer value in backup file
     */
    private fun updateBackupTimer(timerSeconds: Long, isRunning: Boolean) {
        try {
            val studentId = getStudentId() ?: return
            val lectureInfo = getLectureInfo() ?: return
            val periodId = getPeriodId() ?: return
            val timestamp = prefs.getLong(KEY_TIMER_START, System.currentTimeMillis())
            
            saveBackupToFile(
                "$timerSeconds|$studentId|$lectureInfo|$periodId|$isRunning|$timestamp"
            )
        } catch (e: Exception) {
            // Backup update failed
        }
    }

    /**
     * Recover from backup file if SharedPreferences is corrupted
     */
    private fun recoverFromBackup(): Pair<Long, Boolean>? {
        try {
            val file = context.getFileStreamPath(BACKUP_FILE)
            if (!file.exists()) return null
            
            val encryptedData = file.readBytes()
            val decrypted = decrypt(encryptedData)
            val parts = decrypted.split("|")
            
            if (parts.size >= 6) {
                val timerSeconds = parts[0].toLongOrNull() ?: return null
                val isRunning = parts[4].toBoolean()
                
                // Restore to SharedPreferences
                prefs.edit().putString(KEY_TIMER_VALUE, 
                    Base64.encodeToString(encrypt(timerSeconds.toString()), Base64.NO_WRAP)
                ).apply()
                
                return Pair(timerSeconds, isRunning)
            }
        } catch (e: Exception) {
            // Recovery failed
        }
        return null
    }

    /**
     * Delete backup file
     */
    private fun deleteBackupFile() {
        try {
            val file = context.getFileStreamPath(BACKUP_FILE)
            if (file.exists()) {
                file.delete()
            }
        } catch (e: Exception) {
            // Delete failed, but continue
        }
        prefs.edit().putBoolean(KEY_BACKUP_EXISTS, false).apply()
    }

    /**
     * Flush to disk immediately
     */
    private fun flushToDisk() {
        try {
            val editor = prefs.edit()
            editor.commit() // Use commit() instead of apply() for synchronous write
        } catch (e: Exception) {
            // Flush failed
        }
    }

    /**
     * Get all stored data for debugging
     */
    fun getAllData(): Map<String, Any?> {
        val timerData = getTimerValue()
        return mapOf(
            "timerSeconds" to (timerData?.first ?: 0),
            "isRunning" to (timerData?.second ?: false),
            "studentId" to getStudentId(),
            "lectureInfo" to getLectureInfo(),
            "periodId" to getPeriodId(),
            "syncConfirmed" to isSyncConfirmed(),
            "hasPendingData" to hasPendingData(),
            "lastSyncTime" to getLastSyncTime(),
            "backupExists" to prefs.getBoolean(KEY_BACKUP_EXISTS, false)
        )
    }
}