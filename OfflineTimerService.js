/**
 * Offline Timer Service for LetsBunk-offline-bssid
 * Manages timer operation when device is offline
 * Handles local timer counting, BSSID validation, and sync queue
 * Integrated with BSSIDStorage and WiFiManager from offline-bssid system
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules } from 'react-native';
import WiFiManager from './WiFiManager';
import BSSIDStorage from './BSSIDStorage';
import { getServerTime } from './ServerTime';

const KEEP_AWAKE_TAG = 'offline-timer';
const { TimerModule } = NativeModules;

const OFFLINE_TIMER_KEY = '@offline_timer_state';
const SYNC_QUEUE_KEY = '@sync_queue';
const LECTURE_CONTEXT_KEY = '@lecture_context';

/**
 * Module-level boot-elapsed cache.
 * Updated every second by the JS tick loop via TimerModule.getElapsedSeconds().
 * Used by _getBootMs() for synchronous spoof-proof time reads.
 * Value = SystemClock.elapsedRealtime() from Kotlin — time since device boot.
 */
let _bootMsCache = 0;
let _bootMsCacheUpdatedAt = 0; // Date.now() when cache was last set

/**
 * Update the boot-ms cache. Called every second from the tick loop.
 * Also called on initialize so the cache is warm before the timer starts.
 */
async function _refreshBootMsCache() {
  try {
    if (TimerModule && TimerModule.getBootElapsedMs) {
      const { bootElapsedMs } = await TimerModule.getBootElapsedMs();
      _bootMsCache = bootElapsedMs;
      _bootMsCacheUpdatedAt = Date.now();
    }
  } catch (_) {}
}

/**
 * Get a spoof-proof monotonic timestamp in milliseconds (time since device boot).
 * SystemClock.elapsedRealtime() CANNOT be changed by adjusting device date/time.
 *
 * If the cache is stale (>2s old) we extrapolate using Date.now() delta —
 * this is still safe because we only use it for short elapsed-time math,
 * not for absolute wall-clock comparisons.
 */
function _getBootMs() {
  if (_bootMsCache > 0) {
    // Extrapolate from last known boot-ms using device-time delta
    // Even if device time is spoofed, the delta since _bootMsCacheUpdatedAt
    // is bounded by the cache refresh interval (≤1s normally), so error is tiny.
    const deviceDelta = Date.now() - _bootMsCacheUpdatedAt;
    return _bootMsCache + Math.max(0, deviceDelta);
  }
  // Cache not yet populated — return 0 so callers fall back gracefully
  return 0;
}

class OfflineTimerService {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.timerSeconds = 0;
    this.timerInterval = null;
    this.syncInterval = null;
    this.bssidMonitorInterval = null;
    this.lectureEndCheckInterval = null;
    
    // Lecture context
    this.currentLecture = null;
    this.lectureStartTime = null;
    this.authorizedBSSID = null;
    
    // Disconnection state tracking
    this.wasRunningBeforeDisconnect = false;
    this.disconnectionTime = null;
    this.pausedDueToWiFiLoss = false;
    this.previousLectureData = null;
    
    // Manual stop/start tracking
    this.wasManuallyStoppedInSameLecture = false;
    this.wasRunningBeforeLectureEnd = false;  // true if timer was running when lecture ended
    this.lastVerifiedLecture = null;
    this.lastFaceVerificationTime = null;
    this.verifiedToday = false;          // true after first face-verify of the day
    this.verifiedTodayDate = null;       // date string "YYYY-MM-DD" of verification

    // Face embedding cache
    // In-memory: valid for the current app session (cleared when app is killed).
    // Persistent: stored in AsyncStorage via SecureStorage — survives restarts,
    //   cleared on logout or when the enrollment app updates the face (enrolledAt changes).
    this._cachedFaceEmbedding = null;
    this._cachedFaceEmbeddingEnrolledAt = null; // ISO string from server (faceEnrolledAt)
    this._midnightResetTimer = null;
    
    // Sync queue for offline updates
    this.syncQueue = [];
    
    // Listeners
    this.listeners = [];
    
    // App state
    this.appState = AppState.currentState;
    this.appStateSubscription = null;
    
    // Connection status
    this.isOnline = true;
    this.hasInternetConnection = true;
    this.isConnectedToAuthorizedWiFi = false;
    this.lastSyncTime = null;
    this.lastSyncAttempt = null;
    this.internetCheckInterval = null;
    this.pendingSyncCount = 0;
    
    // Background timer tracking
    this.backgroundStartTime = null;
  }

  /**
   * Initialize offline timer service
   */
  async initialize(studentId, serverUrl) {
    try {
      console.log('🔧 Initializing Offline Timer Service...');
      
      this.studentId = studentId;
      this.serverUrl = serverUrl;

      // Warm up the boot-ms cache immediately so _getBootMs() is accurate
      // before any timing operations happen
      await _refreshBootMsCache();
      
      // Initialize WiFiManager (already initialized in offline-bssid system)
      console.log('📶 WiFiManager already initialized in offline-bssid system');

      // Request battery optimization exemption so Android doesn't kill the timer service
      if (TimerModule && TimerModule.requestBatteryOptimizationExemption) {
        TimerModule.requestBatteryOptimizationExemption()
          .then(result => console.log('🔋 Battery optimization exemption:', result))
          .catch(() => {});
      }
      
      // Load saved state
      await this.loadState();
      
      // Load sync queue
      await this.loadSyncQueue();
      
      // Setup app state listener
      this.setupAppStateListener();
      
      // Setup BSSID monitoring
      this.setupBSSIDMonitoring();
      
      // Setup sync interval (every 2 minutes)
      this.setupSyncInterval();
      
      // Setup internet connectivity monitoring
      this.setupInternetMonitoring();
      
      // Setup lecture end time monitoring
      this.setupLectureEndMonitoring();

      // Setup midnight reset for verifiedToday flag
      this._scheduleMidnightReset();
      
      // Initial connectivity check and notification
      await this.checkInternetConnectivity();
      
      console.log('✅ Offline Timer Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Offline Timer Service:', error);
      return false;
    }
  }

  // Method to update student data and load authorized BSSIDs
  async updateStudentData(studentData) {
    try {
      console.log('👤 Updating student data for BSSID validation...');
      console.log('   Student:', studentData);
      
      // Load authorized BSSIDs from server with student context
      await WiFiManager.loadAuthorizedBSSIDs(this.serverUrl, {
        studentId: this.studentId,
        semester: studentData.semester,
        branch: studentData.branch
      });
      
      console.log('✅ Student data updated and BSSIDs loaded');
      return true;
    } catch (error) {
      console.error('❌ Failed to update student data:', error);
      return false;
    }
  }

  /**
   * Start timer with BSSID validation and face verification
   */
  async startTimer(lectureInfo) {
      try {
        console.log('▶️ Starting offline timer for lecture:', lectureInfo);
        console.log('🔍 Lecture info details:');
        console.log(`   Subject: ${lectureInfo.subject}`);
        console.log(`   Teacher: ${lectureInfo.teacher}`);
        console.log(`   Room: ${lectureInfo.room}`);
        console.log(`   Start time: ${lectureInfo.startTime}`);
        console.log(`   End time: ${lectureInfo.endTime}`);

        // Step 1: Validate BSSID using BSSIDStorage system
        console.log('📶 Step 1: Validating BSSID...');
        const bssidCheck = await this.validateBSSIDWithStorage(lectureInfo.room);

        if (!bssidCheck.authorized) {
          console.error('❌ BSSID validation failed:', bssidCheck.reason);
          return {
            success: false,
            error: 'Not in authorized classroom',
            reason: bssidCheck.reason,
            details: bssidCheck,
            step: 'bssid_validation'
          };
        }

        console.log('✅ BSSID validation passed');

        // Step 2: Determine if face verification is needed
        const isSameLecture = this.isSameLecture(lectureInfo);

        // WiFi reconnect in same lecture — never ask for face verify, just resume
        const isWiFiResumeInSameLecture = this.pausedDueToWiFiLoss && isSameLecture;

        // Manual stop+restart in same lecture — skip face verify
        const isManualRestartInSameLecture = this.wasManuallyStoppedInSameLecture && isSameLecture;

        // Same lecture continuation with existing timer (any re-entry) — skip face verify
        const isSameLectureContinuation = isSameLecture && this.timerSeconds > 0;

        // Already verified today (period transition) — skip face verify
        const todayStr = new Date().toISOString().split('T')[0];
        const isAlreadyVerifiedToday = this.verifiedToday && this.verifiedTodayDate === todayStr;

        // Face verify only needed for: new lecture OR first start of the day (no lastVerifiedLecture)
        const needsFaceVerification = !isAlreadyVerifiedToday && (!isSameLecture ||
          (!isWiFiResumeInSameLecture && !isManualRestartInSameLecture && !isSameLectureContinuation));

        let faceVerificationResult = { success: true };

        if (!needsFaceVerification) {
          // Skip face verification — WiFi resume, manual restart, same lecture, or already verified today
          const reason = isAlreadyVerifiedToday ? 'already verified today (period transition)'
            : isWiFiResumeInSameLecture ? 'WiFi resume in same lecture'
            : isManualRestartInSameLecture ? 'manual restart in same lecture'
            : 'same lecture continuation';
          console.log(`🔄 Skipping face verification — ${reason}`);
          console.log('📚 Continuing from timer value:', this.timerSeconds);
        } else {
          // Perform face verification: new lecture or first start of the day
          console.log('👤 Step 2: Starting face verification (new lecture or first start)...');
          faceVerificationResult = await this.performFaceVerification();

          if (!faceVerificationResult.success) {
            console.error('❌ Face verification failed:', faceVerificationResult.error);
            return {
              success: false,
              error: 'Face verification failed',
              reason: faceVerificationResult.reason,
              details: faceVerificationResult,
              step: 'face_verification'
            };
          }

          console.log('✅ Face verification passed');

          // Update face verification tracking
          this.lastFaceVerificationTime = _getBootMs() || Date.now();
          this.lastVerifiedLecture = { ...lectureInfo };
          this.verifiedToday = true;
          this.verifiedTodayDate = new Date().toISOString().split('T')[0];

          // Reset timer only for new lecture
          if (!isSameLecture) {
            console.log('📚 New lecture detected - resetting timer to 0');
            this.timerSeconds = 0;
          } else {
            console.log('📚 First start of day — continuing from:', this.timerSeconds);
          }
        }

        // For period transitions (already verified today, different lecture) — always reset timer to 0
        if (isAlreadyVerifiedToday && !isSameLecture) {
          console.log('📚 Period transition — resetting timer to 0 for new period');
          this.timerSeconds = 0;
          this.attendanceStatus = 'absent';
          this.thresholdSeconds = null;
        }

        // Step 3: Set lecture context and start timer
        this.currentLecture = lectureInfo;
        this.lectureStartTime = _getBootMs() || Date.now();
        this.authorizedBSSID = bssidCheck.expectedBSSID;

        // Only reset attendance tracking when switching to a NEW lecture.
        // For same-lecture re-starts (WiFi resume, manual, continuation), preserve accumulated state.
        if (!isSameLecture) {
          this.thresholdSeconds = null;
          this.attendanceStatus = 'absent';
        }

        // Start timer
        this.isRunning = true;
        this.isPaused = false;
        this.pausedDueToWiFiLoss = false;

        // Start counting
        this.startCounting();

        // Clear manual stop tracking AFTER successful start
        this.wasManuallyStoppedInSameLecture = false;

        // Save state
        await this.saveState();

        // Notify listeners
        this.notifyListeners({
          type: 'timer_started',
          timerSeconds: this.timerSeconds,
          lecture: this.currentLecture,
          faceVerified: faceVerificationResult.success,
          bssidAuthorized: true,
          skippedFaceVerification: !needsFaceVerification
        });

        // Step 4: Register check-in on server only when face verification actually ran
        if (needsFaceVerification) {
          await this.registerCheckIn(lectureInfo, bssidCheck.currentBSSID, faceVerificationResult);
        }

        // Try to sync with server
        await this.syncToServer();

        console.log('✅ Offline timer started successfully', !needsFaceVerification ? '(face verification skipped)' : '(with face verification)');
        return {
          success: true,
          timerSeconds: this.timerSeconds,
          isNewLecture: !isSameLecture,
          faceVerified: faceVerificationResult.success,
          bssidAuthorized: true,
          skippedFaceVerification: !needsFaceVerification
        };

      } catch (error) {
        console.error('❌ Failed to start offline timer:', error);
        return {
          success: false,
          error: error.message,
          step: 'unknown_error'
        };
      }
    }


  /**
   * Perform face verification using the FaceVerification module
   */
  async performFaceVerification() {
    try {
      // Import FaceVerification dynamically to avoid circular imports
      const FaceVerification = require('./FaceVerification').default;
      
      // Get student's stored face embedding from server
      console.log('📡 Fetching student face data from server...');
      const faceData = await this.getStudentFaceData();
      
      if (!faceData.success) {
        return {
          success: false,
          reason: 'no_face_enrolled',
          error: 'No face data enrolled. Please enroll your face first using the enrollment app.',
          details: faceData
        };
      }
      
      // Perform face verification
      console.log('🔐 Performing face verification...');
      const verificationResult = await FaceVerification.verifyFace(faceData.embedding);
      
      if (!verificationResult.success) {
        return {
          success: false,
          reason: 'verification_failed',
          error: 'Face verification failed. Please try again.',
          details: verificationResult
        };
      }
      
      if (!verificationResult.isMatch) {
        return {
          success: false,
          reason: 'face_not_matched',
          error: `Face verification failed. Similarity: ${verificationResult.similarityPercentage}%`,
          details: verificationResult
        };
      }
      
      console.log(`✅ Face verification successful! Similarity: ${verificationResult.similarityPercentage}%`);
      
      return {
        success: true,
        similarity: verificationResult.similarity,
        similarityPercentage: verificationResult.similarityPercentage,
        details: verificationResult
      };
      
    } catch (error) {
      console.error('❌ Face verification error:', error);
      return {
        success: false,
        reason: 'verification_error',
        error: `Face verification error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Get student's face embedding.
   *
   * Cache strategy (in priority order):
   *
   * 1. In-memory cache (_cachedFaceEmbedding) — valid for the current app session
   *    as long as the server-reported enrolledAt hasn't changed.
   *    Populated from AsyncStorage on first call, then kept in memory.
   *
   * 2. Persistent AsyncStorage cache (SecureStorage.getCachedServerEmbedding) —
   *    survives app restarts. Invalidated when:
   *      a) Student logs out  → clearFaceData() wipes it
   *      b) App data is cleared by OS → AsyncStorage is empty
   *      c) Enrollment app updates the face → server returns a newer enrolledAt
   *
   * 3. Fresh fetch from server — only when cache is missing or enrolledAt changed.
   *    After a successful fetch the new embedding is written to both AsyncStorage
   *    and the in-memory cache.
   *
   * Offline fallback: if the network is unavailable but a cache exists (even if
   * enrolledAt can't be verified), the cached embedding is used so the student
   * is never blocked from attending class due to a connectivity issue.
   */
  async getStudentFaceData() {
    try {
      const SecureStorage = require('./SecureStorage').default;

      // ── 1. Check in-memory cache first (fastest path, zero I/O) ───────────
      if (this._cachedFaceEmbedding) {
        console.log('📦 Using in-memory face embedding cache');
        return {
          success: true,
          embedding: this._cachedFaceEmbedding,
          enrolledAt: this._cachedFaceEmbeddingEnrolledAt,
        };
      }

      // ── 2. Load persistent AsyncStorage cache ─────────────────────────────
      //    This is the offline fallback. It is populated every time a server
      //    fetch succeeds (see step 3 below), so it is always up-to-date after
      //    the first online session.
      const persistedCache = await SecureStorage.getCachedServerEmbedding();

      // ── 3. Attempt a server fetch (short 3 s timeout) ─────────────────────
      //    Purpose: detect re-enrollment (enrolledAt changed) and keep the
      //    AsyncStorage cache fresh.
      //    If the network is unavailable the catch block runs immediately and
      //    we fall back to the persisted cache — student is never blocked.
      let serverData = null;
      try {
        console.log('📡 Fetching face embedding from server (checking for updates)...');
        const controller = new AbortController();
        // 3 second timeout — short enough that offline students aren't kept
        // waiting before the camera opens.
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(
          `${this.serverUrl}/api/students/${this.studentId}/face-data`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.faceEmbedding) && data.faceEmbedding.length > 0) {
            serverData = {
              embedding: data.faceEmbedding,
              enrolledAt: data.enrolledAt || null,
            };
          } else {
            // Server says face not enrolled — but if we have a local cache,
            // trust it (server may be returning stale data).
            if (persistedCache) {
              console.warn('⚠️ Server says no face enrolled but local cache exists — using cache');
              this._cachedFaceEmbedding = persistedCache.embedding;
              this._cachedFaceEmbeddingEnrolledAt = persistedCache.enrolledAt;
              return { success: true, embedding: persistedCache.embedding, enrolledAt: persistedCache.enrolledAt, fromOfflineCache: true };
            }
            return { success: false, error: data.error || 'No face embedding found. Please enroll your face first.' };
          }
        } else if (response.status === 404) {
          // Definitively not enrolled — but trust local cache if present
          if (persistedCache) {
            console.warn('⚠️ Server 404 but local cache exists — using cache');
            this._cachedFaceEmbedding = persistedCache.embedding;
            this._cachedFaceEmbeddingEnrolledAt = persistedCache.enrolledAt;
            return { success: true, embedding: persistedCache.embedding, enrolledAt: persistedCache.enrolledAt, fromOfflineCache: true };
          }
          return { success: false, error: 'Face not enrolled. Please enroll your face first using the enrollment app.' };
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (networkError) {
        // ── Offline fallback ─────────────────────────────────────────────────
        // Network unavailable (no internet, timeout, etc.)
        // Use the persisted AsyncStorage cache so the student is never blocked.
        if (persistedCache) {
          console.warn('⚠️ Network unavailable — using persisted face embedding cache (offline fallback)');
          this._cachedFaceEmbedding = persistedCache.embedding;
          this._cachedFaceEmbeddingEnrolledAt = persistedCache.enrolledAt;
          return {
            success: true,
            embedding: persistedCache.embedding,
            enrolledAt: persistedCache.enrolledAt,
            fromOfflineCache: true,
          };
        }
        // No cache at all — student must connect to internet at least once
        // so the embedding can be downloaded and saved.
        console.error('❌ Network unavailable and no cached embedding:', networkError.message);
        return {
          success: false,
          error: 'Face data not available offline. Please connect to the internet once to download your face data, then it will work offline.',
        };
      }

      // ── 4. Server fetch succeeded — always persist to AsyncStorage ─────────
      //    We save on EVERY successful fetch, not just when enrolledAt changed.
      //    This ensures the cache is populated after the very first online
      //    session so subsequent offline sessions always have a fallback.
      const serverEnrolledAt = serverData.enrolledAt;
      const cachedEnrolledAt = persistedCache?.enrolledAt;
      const enrolledAtChanged = !persistedCache || !cachedEnrolledAt || serverEnrolledAt !== cachedEnrolledAt;

      if (enrolledAtChanged) {
        if (persistedCache) {
          console.log(`🔄 Face embedding updated by enrollment app (was: ${cachedEnrolledAt}, now: ${serverEnrolledAt}) — refreshing cache`);
        } else {
          console.log('✅ Face embedding fetched from server — saving to persistent cache for offline use');
        }
      } else {
        console.log('✅ Face embedding cache is up-to-date — re-saving to keep AsyncStorage fresh');
      }

      // Always write to AsyncStorage so offline fallback is always available
      await SecureStorage.saveCachedServerEmbedding(serverData.embedding, serverEnrolledAt);

      // Warm in-memory cache
      this._cachedFaceEmbedding = serverData.embedding;
      this._cachedFaceEmbeddingEnrolledAt = serverEnrolledAt;

      return {
        success: true,
        embedding: serverData.embedding,
        enrolledAt: serverEnrolledAt,
      };

    } catch (error) {
      console.error('❌ Unexpected error in getStudentFaceData:', error);
      return { success: false, error: `Failed to fetch face data: ${error.message}` };
    }
  }

  /**
   * Register check-in on server — creates PeriodAttendance { verificationType: 'initial' }
   * Without this, offline-sync returns 403 "No verified check-in for today"
   */
  async registerCheckIn(lectureInfo, currentBSSID, faceVerificationResult) {
    try {
      console.log('📡 Registering check-in on server...');

      // Get stored face embedding to send to server
      const FaceVerification = require('./FaceVerification').default;
      const SecureStorage = require('./SecureStorage').default;
      const storedEmbedding = await SecureStorage.getFaceEmbedding();

      if (!storedEmbedding || storedEmbedding.length !== 192) {
        console.warn('⚠️ No stored face embedding — skipping server check-in');
        return { success: false, error: 'No face embedding available' };
      }

      let timestamp;
      try {
        const { getServerTime } = require('./ServerTime');
        timestamp = getServerTime().nowISO();
      } catch {
        timestamp = new Date(_getBootMs() || Date.now()).toISOString();
      }

      const response = await fetch(`${this.serverUrl}/api/attendance/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentNo: this.studentId,
          faceEmbedding: storedEmbedding,
          wifiBSSID: currentBSSID || '',
          timestamp,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('✅ Server check-in registered successfully');
        return { success: true };
      } else if (response.status === 409) {
        // Already checked in today — that's fine, sync will work
        console.log('ℹ️ Already checked in today — sync will proceed normally');
        return { success: true, alreadyCheckedIn: true };
      } else {
        console.warn(`⚠️ Server check-in failed (${response.status}): ${data.error || data.message}`);
        return { success: false, error: data.error || data.message };
      }
    } catch (error) {
      console.error('❌ Error registering check-in:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle WiFi reconnection with enhanced logic
   */
  async handleWiFiReconnection(newLectureInfo) {
    try {
      console.log('📶 WiFi reconnected - handling reconnection logic...');
      console.log('   New lecture info:', newLectureInfo);
      console.log('   Previous lecture:', this.currentLecture);
      console.log('   Was running before disconnect:', this.wasRunningBeforeDisconnect);
      console.log('   Timer seconds before disconnect:', this.timerSeconds);
      
      // Step 1: Validate BSSID for new connection
      console.log('📶 Step 1: Validating BSSID for reconnection...');
      const bssidCheck = await this.validateBSSIDWithStorage(newLectureInfo.room);
      
      if (!bssidCheck.authorized) {
        console.error('❌ BSSID validation failed on reconnection:', bssidCheck.reason);
        return {
          success: false,
          error: 'WiFi validation failed on reconnection',
          reason: bssidCheck.reason,
          step: 'bssid_validation'
        };
      }
      
      console.log('✅ BSSID validation passed on reconnection');
      
      // Step 2: Determine if this is the same lecture or different lecture
      const isSameLecture = this.isSameLecture(newLectureInfo);
      console.log('📚 Lecture comparison result:', isSameLecture ? 'SAME LECTURE' : 'DIFFERENT LECTURE');
      
      if (!isSameLecture && this.wasRunningBeforeDisconnect) {
        // Different lecture detected - sync previous lecture data first
        console.log('📊 Different lecture detected - syncing previous lecture data...');
        
        // Store previous lecture data for final sync
        this.previousLectureData = {
          lecture: this.currentLecture,
          timerSeconds: this.timerSeconds,
          disconnectionTime: this.disconnectionTime
        };
        
        // Perform final sync of previous lecture
        await this.syncPreviousLectureData();
        
        // Reset timer ONLY for lecture change — WiFi events never reset the timer
        console.log('🔄 Lecture changed — resetting timer to 0');
        this.timerSeconds = 0;
      }
      
      // Step 3: Resume or start timer — NO face verification on WiFi reconnect
      // Face verify is only required on: new lecture, day change, or random ring
      if (isSameLecture && this.wasRunningBeforeDisconnect) {
        // Same lecture — resume from where it was paused
        console.log('▶️ Same lecture - resuming timer from paused state');
        console.log(`   Resuming from: ${this.timerSeconds} seconds`);
        
        // Update lecture context
        this.currentLecture = newLectureInfo;
        this.authorizedBSSID = bssidCheck.expectedBSSID;
        
        // Resume timer
        this.isRunning = true;
        this.isPaused = false;
        this.pausedDueToWiFiLoss = false;
        this.wasRunningBeforeDisconnect = false;
        
        // Start counting from current value
        this.startCounting();
        
        // Notify listeners
        this.notifyListeners({
          type: 'timer_resumed_after_reconnection',
          timerSeconds: this.timerSeconds,
          lecture: this.currentLecture,
          scenario: 'same_lecture'
        });
        
      } else {
        // Different lecture or timer wasn't running before disconnect
        console.log('🆕 Different lecture or timer wasn\'t running - starting');
        
        // If it's a different lecture, reset timer (already done above if wasRunningBeforeDisconnect)
        // If it wasn't running before disconnect and it's a different lecture, reset now
        if (!isSameLecture) {
          console.log('🔄 Different lecture — resetting timer to 0');
          this.timerSeconds = 0;
        }
        // If same lecture but wasn't running — keep timer value, just resume
        
        // Set new lecture context
        this.currentLecture = newLectureInfo;
        this.lectureStartTime = _getBootMs() || Date.now();
        this.authorizedBSSID = bssidCheck.expectedBSSID;
        
        // Start timer
        this.isRunning = true;
        this.isPaused = false;
        this.pausedDueToWiFiLoss = false;
        this.wasRunningBeforeDisconnect = false;
        
        // Start counting from current value (0 if new lecture, preserved if same)
        this.startCounting();
        
        // Notify listeners
        this.notifyListeners({
          type: isSameLecture ? 'timer_resumed_after_reconnection' : 'timer_started_after_reconnection',
          timerSeconds: this.timerSeconds,
          lecture: this.currentLecture,
          scenario: isSameLecture ? 'same_lecture_not_running' : 'different_lecture'
        });
      }
      
      // Step 5: Save state and sync
      await this.saveState();
      await this.syncToServer();
      
      console.log('✅ WiFi reconnection handled successfully');
      return {
        success: true,
        scenario: isSameLecture ? 'same_lecture' : 'different_lecture',
        resumed: isSameLecture && this.wasRunningBeforeDisconnect,
        timerSeconds: this.timerSeconds
      };
      
    } catch (error) {
      console.error('❌ Error handling WiFi reconnection:', error);
      return {
        success: false,
        error: error.message,
        step: 'reconnection_error'
      };
    }
  }

  /**
   * Sync previous lecture data before starting new lecture
   */
  async syncPreviousLectureData() {
    if (!this.previousLectureData) {
      console.log('ℹ️ No previous lecture data to sync');
      return;
    }
    
    try {
      console.log('📊 Syncing previous lecture data...');
      console.log('   Previous lecture:', this.previousLectureData.lecture?.subject);
      console.log('   Timer seconds:', this.previousLectureData.timerSeconds);
      
      // Perform final sync with previous lecture data
      const response = await fetch(`${this.serverUrl}/api/attendance/offline-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: this.studentId,
          timerSeconds: this.previousLectureData.timerSeconds,
          lecture: this.previousLectureData.lecture,
          timestamp: this.previousLectureData.disconnectionTime || _getBootMs() || Date.now(),
          isRunning: false, // Mark as stopped since we're switching lectures
          isPaused: false,
          finalSync: true, // Flag to indicate this is a final sync
          reason: 'lecture_change'
        }),
        timeout: 10000
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('✅ Previous lecture data synced successfully');
          this.previousLectureData = null; // Clear after successful sync
        } else {
          console.error('❌ Previous lecture sync failed:', result.error);
        }
      } else {
        console.error('❌ Previous lecture sync request failed:', response.status);
      }
      
    } catch (error) {
      console.error('❌ Error syncing previous lecture data:', error);
      // Don't fail the reconnection process if sync fails
    }
  }

  /**
   * Enhanced stop timer with disconnection tracking
   */
  async stopTimer(reason = 'manual') {
    try {
      console.log('⏹️ Stopping offline timer, reason:', reason);
      
      // Track if this was due to WiFi disconnection
      if (reason === 'wifi_disconnected' || reason === 'bssid_changed') {
        console.log('📶 Timer stopped due to WiFi issue - tracking disconnection state');
        this.wasRunningBeforeDisconnect = this.isRunning;
        this.disconnectionTime = _getBootMs() || Date.now();
        this.pausedDueToWiFiLoss = true;
        
        // Don't reset lecture context on WiFi disconnection - keep for potential resume
        console.log('💾 Preserving lecture context for potential resume');
        console.log('   Current timer seconds:', this.timerSeconds);
        console.log('   Current lecture:', this.currentLecture?.subject);
      } else if (reason === 'manual') {
        // Manual stop - track for potential same-lecture restart
        console.log('✋ Manual stop detected - tracking for potential same-lecture restart');
        this.wasManuallyStoppedInSameLecture = true;
        
        // DON'T clear lecture context for manual stops - preserve for same-lecture detection
        console.log('💾 Preserving lecture context for same-lecture restart detection');
        console.log('   Current timer seconds:', this.timerSeconds);
        console.log('   Current lecture:', this.currentLecture?.subject);
        
        this.previousLectureData = null;
        this.wasManuallyStoppedInSameLecture = false;
        this.thresholdSeconds = null;  // reset threshold on any stop
        this.attendanceStatus = 'absent';
      } else if (reason === 'lecture_ended') {
        // Lecture ended - track that timer was running for auto-start next period
        console.log('⏰ Lecture period ended - preparing for next period auto-start');
        this.wasRunningBeforeLectureEnd = true;  // Track for auto-start in next period
        this.wasManuallyStoppedInSameLecture = false;
        this.wasRunningBeforeDisconnect = false;
        this.disconnectionTime = null;
        this.pausedDueToWiFiLoss = false;
        this.previousLectureData = null;
        this.thresholdSeconds = null;  // reset so next period gets fresh threshold
        this.attendanceStatus = 'absent';
      }
      
      // Save lecture context BEFORE clearing — needed for final sync
      const finalLecture    = this.currentLecture ? { ...this.currentLecture } : null;
      const finalSeconds    = this.timerSeconds;
      const finalPeriodId   = finalLecture?.period
          ? `P${finalLecture.period}`
          : (finalLecture?.periodId || null);

      // Stop counting
      this.stopCounting();
      
      // Reset running state BEFORE syncing
      this.isRunning = false;
      this.isPaused = false;
      
      // Clear lecture context for lecture_ended, preserve for manual/WiFi stops
      if (reason === 'lecture_ended') {
        this.currentLecture = null;
        this.lectureStartTime = null;
        this.authorizedBSSID = null;
      } else if (reason !== 'manual' && reason !== 'wifi_disconnected' && reason !== 'bssid_changed') {
        this.currentLecture = null;
        this.lectureStartTime = null;
        this.authorizedBSSID = null;
      }
      
      // Save state
      await this.saveState();
      
      // Final sync — use saved lecture/periodId so server can identify the right period
      // even if currentLecture was cleared above
      await this.syncToServerWithContext(finalLecture, finalSeconds, finalPeriodId);
      
      // Notify listeners
      this.notifyListeners({
        type: 'timer_stopped',
        reason: reason,
        finalSeconds: this.timerSeconds,
        canResume: this.pausedDueToWiFiLoss
      });
      
      console.log('✅ Offline timer stopped');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to stop offline timer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pause timer
   */
  async pauseTimer(reason) {
    if (!this.isRunning || this.isPaused) return;
    
    console.log('⏸️ Pausing offline timer, reason:', reason);
    
    this.isPaused = true;
    this.stopCounting();
    
    await this.saveState();
    
    this.notifyListeners({
      type: 'timer_paused',
      reason: reason,
      timerSeconds: this.timerSeconds
    });
  }

  /**
   * Resume timer
   * @param {string} reason - reason for resuming
   * @param {number} extraSeconds - extra seconds to add back (e.g. paused duration during random ring)
   */
  async resumeTimer(reason, extraSeconds = 0) {
    if (!this.isRunning || !this.isPaused) return;
    
    console.log('▶️ Resuming offline timer, reason:', reason, 'extraSeconds:', extraSeconds);
    
    if (extraSeconds > 0) {
      this.timerSeconds += Math.floor(extraSeconds);
    }
    
    this.isPaused = false;
    // Re-anchor timestamp so elapsed calculation starts fresh from current value
    this._countingStartedAt = _getBootMs() || Date.now();
    this._countingBaseSeconds = this.timerSeconds;
    this.startCounting();
    
    await this.saveState();
    
    this.notifyListeners({
      type: 'timer_resumed',
      reason: reason,
      timerSeconds: this.timerSeconds
    });
  }

  /**
   * Start counting via the native TimerService foreground service.
   * The native service holds a WakeLock and counts with a Handler — it keeps
   * running even when the screen is off or JS is throttled.
   * JS polls every second only to update the UI.
   */
  /**
   * (Removed — replaced by module-level _getBootMs() function above)
   */

  startCounting() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Start the native foreground service (WakeLock + Handler timer + native BSSID check)
    if (TimerModule) {
      const subject = this.currentLecture?.subject || '';
      // Pass authorized BSSIDs as comma-separated string so native layer can
      // validate WiFi every 60s even when screen is off
      const bssidList = Array.isArray(this.authorizedBSSID)
        ? this.authorizedBSSID.join(',')
        : (this.authorizedBSSID || '');

      if (TimerModule.startTimerWithBSSIDAndSyncAndEnd) {
        // Full version: BSSID + sync + lecture end time (stops natively when period ends)
        const endTime = this.currentLecture?.endTime || '';
        TimerModule.startTimerWithBSSIDAndSyncAndEnd(
          subject,
          this.timerSeconds,
          bssidList,
          this.studentId || '',
          this.serverUrl || '',
          endTime
        ).catch((e) => console.warn('⚠️ Native timer start failed:', e));
      } else if (TimerModule.startTimerWithBSSIDAndSync) {
        TimerModule.startTimerWithBSSIDAndSync(
          subject,
          this.timerSeconds,
          bssidList,
          this.studentId || '',
          this.serverUrl || ''
        ).catch((e) => console.warn('⚠️ Native timer start failed:', e));
      } else if (TimerModule.startTimerWithBSSID) {
        TimerModule.startTimerWithBSSID(subject, this.timerSeconds, bssidList).catch((e) =>
          console.warn('⚠️ Native timer start failed:', e)
        );
      } else {
        // Fallback to legacy method if module not updated yet
        TimerModule.startTimer(subject, this.timerSeconds).catch((e) =>
          console.warn('⚠️ Native timer start failed:', e)
        );
      }
    } else {
      console.warn('⚠️ TimerModule not available — falling back to JS timer');
      // Use boot-elapsed (spoof-proof). If cache not yet warm, will be 0
      // and we anchor on first tick once cache is populated.
      this._countingStartedAt = _getBootMs() || Date.now();
      this._countingBaseSeconds = this.timerSeconds;
    }

    // JS poll: sync timerSeconds from native every second (UI only)
    this.timerInterval = setInterval(async () => {
      if (!this.isRunning || this.isPaused) return;

      // Refresh boot-ms cache every tick so _getBootMs() stays accurate
      await _refreshBootMsCache();

      if (TimerModule) {
        try {
          const { seconds } = await TimerModule.getElapsedSeconds();
          this.timerSeconds = Math.floor(seconds);
        } catch (_) {
          // Native call failed — fall back to boot-elapsed
          const nowMs = _getBootMs();
          if (this._countingStartedAt && nowMs > 0) {
            this.timerSeconds = this._countingBaseSeconds +
              Math.floor((nowMs - this._countingStartedAt) / 1000);
          }
        }
      } else {
        // Pure JS fallback — use boot-elapsed
        const nowMs = _getBootMs();
        if (this._countingStartedAt && nowMs > 0) {
          this.timerSeconds = this._countingBaseSeconds +
            Math.floor((nowMs - this._countingStartedAt) / 1000);
        }
      }

      // Save state every 10 seconds
      if (this.timerSeconds % 10 === 0) {
        this.saveState();
      }

      this.notifyListeners({
        type: 'timer_tick',
        timerSeconds: this.timerSeconds
      });
    }, 1000);
  }

  /**
   * Stop counting — stops native service and JS poll.
   */
  stopCounting() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (TimerModule) {
      TimerModule.stopTimer().catch(() => {});
    }
    this._countingStartedAt = null;
    this._countingBaseSeconds = null;
  }

  /**
   * Validate BSSID using BSSIDStorage system (offline-bssid integration)
   */
  async validateBSSIDWithStorage(roomNumber) {
    try {
      console.log('📶 STRICT BSSID Validation using BSSIDStorage for room:', roomNumber);
      
      // Get current BSSID from WiFiManager
      const currentBSSID = await WiFiManager.getCurrentBSSID();
      
      if (!currentBSSID) {
        console.log('❌ No WiFi BSSID detected');
        return {
          authorized: false,
          reason: 'no_wifi',
          error: 'No WiFi connection detected. Please connect to the classroom WiFi network.',
          currentBSSID: 'Not detected',
          expectedBSSID: 'Unknown'
        };
      }
      
      // Validate using BSSIDStorage system
      const validation = await BSSIDStorage.validateCurrentBSSID(currentBSSID);
      
      console.log('📶 BSSIDStorage validation result:', validation);
      
      if (!validation.valid) {
        console.log('❌ BSSID validation FAILED - Timer will NOT start');
        
        let errorMessage = 'Timer cannot start - WiFi validation failed';
        
        switch (validation.reason) {
          case 'no_active_period':
            errorMessage = 'No active class period at this time. Timer can only run during scheduled lectures.';
            break;
          case 'bssid_not_configured':
            errorMessage = `Room ${roomNumber} WiFi is not configured. Please contact admin to configure classroom WiFi settings.`;
            break;
          case 'wrong_bssid':
            errorMessage = `You are connected to wrong WiFi network. Please connect to the authorized classroom WiFi for ${validation.period?.room || roomNumber}.`;
            break;
          case 'validation_error':
            errorMessage = `WiFi validation error. Please check your WiFi connection and try again.`;
            break;
          default:
            errorMessage = 'WiFi validation failed. Please ensure you are connected to the correct classroom WiFi.';
        }
        
        return {
          authorized: false,
          reason: validation.reason,
          error: errorMessage,
          currentBSSID: validation.current || 'Not detected',
          expectedBSSID: validation.expected || 'Not configured',
          period: validation.period
        };
      }
      
      // Validation passed - timer can start
      console.log('✅ BSSID validation PASSED - Timer authorized to start');
      console.log(`   Current period: ${validation.period?.subject} in ${validation.period?.room}`);
      
      return {
        authorized: true,
        reason: 'authorized',
        currentBSSID: validation.current,
        expectedBSSID: validation.expected,
        period: validation.period
      };
      
    } catch (error) {
      console.error('❌ BSSID validation error:', error);
      
      // STRICT: No bypasses on error - validation fails
      return {
        authorized: false,
        reason: 'validation_error',
        error: `WiFi validation failed: ${error.message}. Please check your connection and try again.`,
        currentBSSID: 'Error',
        expectedBSSID: 'Unknown'
      };
    }
  }

  /**
   * Check if current lecture has ended based on end time
   */
  isLectureEnded() {
    if (!this.currentLecture || !this.currentLecture.endTime) {
      console.log('🔍 Lecture end check: No lecture or endTime available');
      return false;
    }

    // Use server time (spoof-proof) — falls back to device time only if not synced
    let now;
    try {
      const { getServerTime } = require('./ServerTime');
      now = getServerTime().nowDate();
    } catch {
      now = new Date(_getBootMs() || Date.now());
    }

    const currentHour   = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    // Parse lecture end time (format: "HH:MM")
    const [endHour, endMinute] = this.currentLecture.endTime.split(':').map(Number);
    const endTimeInMinutes = endHour * 60 + endMinute;
    
    const isEnded = currentTimeInMinutes >= endTimeInMinutes;
    
    console.log('🔍 Lecture end check:');
    console.log(`   Current time: ${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')} (${currentTimeInMinutes} minutes)`);
    console.log(`   Lecture end: ${this.currentLecture.endTime} (${endTimeInMinutes} minutes)`);
    console.log(`   Is ended: ${isEnded}`);
    
    return isEnded;
  }

  /**
   * Setup lecture end time monitoring
   */
  setupLectureEndMonitoring() {
    console.log('🔧 Setting up lecture end time monitoring (10-second intervals)');
    
    // Check every 10 seconds if lecture has ended
    this.lectureEndCheckInterval = setInterval(async () => {
      console.log('⏰ Lecture end monitoring check...');
      console.log(`   Timer running: ${this.isRunning}`);
      console.log(`   Timer paused: ${this.isPaused}`);
      console.log(`   Current lecture: ${this.currentLecture?.subject || 'None'}`);
      console.log(`   Lecture end time: ${this.currentLecture?.endTime || 'Not set'}`);
      
      if (this.isRunning && !this.isPaused && this.currentLecture) {
        if (this.isLectureEnded()) {
          console.log('⏰ Lecture period has ended - automatically stopping timer');
          console.log(`   Lecture: ${this.currentLecture.subject}`);
          console.log(`   End time: ${this.currentLecture.endTime}`);
          console.log(`   Final timer seconds: ${this.timerSeconds}`);
          
          // Stop timer with 'lecture_ended' reason
          await this.stopTimer('lecture_ended');
          
          // Notify listeners
          this.notifyListeners({
            type: 'lecture_ended',
            lecture: this.currentLecture,
            finalSeconds: this.timerSeconds,
            attendedMinutes: Math.floor(this.timerSeconds / 60)
          });

          // Auto-continue: disabled - using App.js period change detection instead
          // This logic caused errors with undefined getLectureInfo function
          // App.js now handles period transitions via fetchOfflinePeriod
        }
      } else {
        console.log('⏰ Skipping lecture end check (timer not active or no lecture)');
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check if same lecture (same subject, teacher, room)
   */
  isSameLecture(newLecture) {
    if (!this.currentLecture || !newLecture) return false;

    // Primary: compare by period number (most reliable)
    const curPeriod = this.currentLecture.period ?? this.currentLecture.periodNumber;
    const newPeriod = newLecture.period ?? newLecture.periodNumber;
    if (curPeriod != null && newPeriod != null) {
      return String(curPeriod) === String(newPeriod);
    }

    // Fallback: compare by start+end time (period number not available)
    if (this.currentLecture.startTime && newLecture.startTime) {
      return this.currentLecture.startTime === newLecture.startTime &&
             this.currentLecture.endTime   === newLecture.endTime;
    }

    // Last resort: subject + room (old behaviour)
    return (this.currentLecture.subject || '') === (newLecture.subject || '') &&
           (this.currentLecture.room    || '') === (newLecture.room    || '');
  }

  /**
   * Setup BSSID monitoring using BSSIDStorage system with enhanced reconnection
   */
  setupBSSIDMonitoring() {
    // Monitor BSSID every 10 seconds
    this.bssidMonitorInterval = setInterval(async () => {
      if (this.isRunning && !this.isPaused && this.currentLecture) {
        // Use BSSIDStorage validation instead of WiFiManager
        const currentBSSID = await WiFiManager.getCurrentBSSID();
        
        if (currentBSSID) {
          try {
            const validation = await BSSIDStorage.validateCurrentBSSID(currentBSSID);
            if (!validation.valid) {
              console.warn('⚠️ BSSID validation failed during monitoring - stopping timer');
              await this.stopTimer('bssid_changed');
              this.notifyListeners({
                type: 'bssid_unauthorized',
                reason: validation.reason,
                details: validation
              });
            }
          } catch (validationErr) {
            console.error('❌ BSSID validation threw error:', validationErr);
            // Don't stop timer on validation error — treat as transient
          }
        } else {
          console.warn('⚠️ WiFi disconnected - stopping timer');
          await this.stopTimer('wifi_disconnected');
          
          this.notifyListeners({
            type: 'wifi_disconnected',
            reason: 'no_wifi'
          });
        }
      } else if (this.pausedDueToWiFiLoss) {
        // Check for WiFi reconnection when paused due to WiFi loss
        const currentBSSID = await WiFiManager.getCurrentBSSID();
        
        if (currentBSSID) {
          console.log('📶 WiFi reconnected while paused - checking for resumption...');
          
          // Get current lecture info from the app
          // This should be provided by the app when WiFi reconnects
          this.notifyListeners({
            type: 'wifi_reconnected',
            currentBSSID: currentBSSID,
            needsReconnectionHandling: true
          });
        }
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Setup sync interval (every 2 minutes)
   */
  setupSyncInterval() {
    this.syncInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.syncToServer();
      }
    }, 30000); // 30 seconds — responsive live updates
  }

  /**
   * Setup internet connectivity monitoring
   */
  setupInternetMonitoring() {
    // Check internet connectivity every 30 seconds
    this.internetCheckInterval = setInterval(async () => {
      await this.checkInternetConnectivity();
    }, 30000); // 30 seconds
    
    // Initial check
    this.checkInternetConnectivity();
  }

  /**
   * Schedule verifiedToday flag reset at midnight.
   * Uses a one-shot timeout that re-schedules itself each day.
   */
  _scheduleMidnightReset() {
    if (this._midnightResetTimer) {
      clearTimeout(this._midnightResetTimer);
      this._midnightResetTimer = null;
    }
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // next midnight
    const msUntilMidnight = midnight.getTime() - now.getTime();
    this._midnightResetTimer = setTimeout(() => {
      console.log('🌙 Midnight — resetting verifiedToday flag (face embedding cache is persistent, not time-based)');
      this.verifiedToday = false;
      this.verifiedTodayDate = null;
      // Do NOT clear the face embedding cache here — it is now persistent and
      // invalidated only on logout, app data clear, or enrollment update.
      // Re-schedule for the next midnight
      this._scheduleMidnightReset();
    }, msUntilMidnight);
  }

  /**
   * Check internet connectivity and WiFi authorization status
   */
  async checkInternetConnectivity() {
    try {
      // Check WiFi authorization first
      const currentBSSID = await WiFiManager.getCurrentBSSID();
      const wasConnectedToAuthorizedWiFi = this.isConnectedToAuthorizedWiFi;
      
      if (currentBSSID) {
        const validation = await BSSIDStorage.validateCurrentBSSID(currentBSSID);
        this.isConnectedToAuthorizedWiFi = validation.valid;
      } else {
        this.isConnectedToAuthorizedWiFi = false;
      }
      
      // Check internet connectivity
      const wasOnline = this.hasInternetConnection;
      
      try {
        // Try to reach the server with a quick ping
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${this.serverUrl}/api/health`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        clearTimeout(timeoutId);
        this.hasInternetConnection = response.ok;
      } catch (error) {
        this.hasInternetConnection = false;
      }
      
      // isOnline = has internet (any network). isConnectedToAuthorizedWiFi is separate.
      // Sync works on any internet — only the timer requires authorized WiFi.
      const wasOverallOnline = this.isOnline;
      this.isOnline = this.hasInternetConnection;
      
      // Update pending sync count
      this.pendingSyncCount = this.syncQueue.length;
      
      // Notify listeners of connectivity changes
      if (wasOverallOnline !== this.isOnline || wasOnline !== this.hasInternetConnection || wasConnectedToAuthorizedWiFi !== this.isConnectedToAuthorizedWiFi) {
        console.log('📶 Connectivity status changed:');
        console.log('   WiFi Authorized:', this.isConnectedToAuthorizedWiFi);
        console.log('   Internet:', this.hasInternetConnection);
        console.log('   Overall Online:', this.isOnline);
        console.log('   Pending Syncs:', this.pendingSyncCount);
        
        this.notifyListeners({
          type: 'connectivity_changed',
          isOnline: this.isOnline,
          hasInternet: this.hasInternetConnection,
          hasAuthorizedWiFi: this.isConnectedToAuthorizedWiFi,
          pendingSyncs: this.pendingSyncCount
        });
      }
      
      // Auto-sync when internet comes back online
      if (!wasOnline && this.hasInternetConnection && this.syncQueue.length > 0) {
        console.log('🔄 Internet restored - auto-syncing pending data');
        await this.syncPendingData();
      }
      
    } catch (error) {
      console.error('❌ Error checking connectivity:', error);
      this.hasInternetConnection = false;
      this.isOnline = false;
    }
  }

  /**
   * Sync all pending data when internet is restored
   */
  async syncPendingData() {
    if (!this.hasInternetConnection || this.syncQueue.length === 0) {
      return;
    }

    console.log(`🔄 Syncing ${this.syncQueue.length} pending items...`);

    // Try to sync current timer state first (if running)
    if (this.isRunning) {
      await this.syncToServer();
    }

    // Process ALL queued items — don't stop on failure, try each one
    const queueCopy = [...this.syncQueue];
    let successCount = 0;

    for (const queueItem of queueCopy) {
      try {
        const queueController = new AbortController();
        const queueTimeoutId = setTimeout(() => queueController.abort(), 10000);
        let queueResponse;
        try {
          queueResponse = await fetch(`${this.serverUrl}/api/attendance/offline-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...queueItem,
              studentId: this.studentId,
              isQueuedSync: true
            }),
            signal: queueController.signal
          });
        } finally {
          clearTimeout(queueTimeoutId);
        }

        if (queueResponse.ok) {
          const result = await queueResponse.json();
          if (result.success) {
            successCount++;
            this.syncQueue = this.syncQueue.filter(item => item.timestamp !== queueItem.timestamp);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to sync queued item (timestamp=${queueItem.timestamp}):`, error.message);
        // Continue processing remaining items — don't break
      }
    }

    if (successCount > 0) {
      console.log(`✅ Successfully synced ${successCount}/${queueCopy.length} pending items`);
      await this.saveSyncQueue();
      this.pendingSyncCount = this.syncQueue.length;

      this.notifyListeners({
        type: 'pending_syncs_completed',
        syncedCount: successCount,
        remainingCount: this.pendingSyncCount
      });
    }
  }

  /**
   * Force sync timer data (called by refresh button)
   */
  async forceSyncTimerData() {
    console.log('🔄 Force syncing timer data...');

    // Check internet connectivity (any network — WiFi or mobile data)
    await this.checkInternetConnectivity();

    if (!this.hasInternetConnection) {
      console.log('⚠️ No internet connection - cannot sync');
      return {
        success: false,
        error: 'No internet connection',
        isOffline: true,
        pendingSyncs: this.pendingSyncCount
      };
    }

    // NOTE: Sync works on any internet connection (WiFi, mobile data, etc.)
    // Only the TIMER requires authorized WiFi — sync is just an HTTP POST.

    // Sync current timer state
    const syncResult = await this.syncToServer();

    // Also sync any pending data
    if (this.syncQueue.length > 0) {
      await this.syncPendingData();
    }

    return {
      success: syncResult.success,
      error: syncResult.error,
      isOffline: false,
      pendingSyncs: this.pendingSyncCount,
      lastSyncTime: this.lastSyncTime
    };
  }

  /**
   * Sync with explicit lecture context — used for final sync after timer stops
   * so the server can identify the correct period even after currentLecture is cleared.
   */
  async syncToServerWithContext(lecture, timerSeconds, periodId) {
    // Temporarily override instance values for this sync call
    const savedLecture   = this.currentLecture;
    const savedSeconds   = this.timerSeconds;
    this.currentLecture  = lecture;
    this.timerSeconds    = timerSeconds;
    this._finalSyncPeriodId = periodId;  // picked up by syncToServer
    try {
      await this.syncToServer();
    } finally {
      this.currentLecture = savedLecture;
      this.timerSeconds   = savedSeconds;
      this._finalSyncPeriodId = null;
    }
  }

  /**
   * Sync timer data to server
   */
  async syncToServer() {
    try {
      this.lastSyncAttempt = _getBootMs() || Date.now();

      console.log('🔄 Syncing offline timer to server...');

      // Get current BSSID for validation
      const currentBSSID = await WiFiManager.getCurrentBSSID();

      // Use server-synced time for the timestamp sent to server (spoof-proof)
      let syncTimestamp;
      try { syncTimestamp = getServerTime().now(); } catch { syncTimestamp = _getBootMs() || Date.now(); }

      // Enforce a hard 10-second timeout so a slow/sleeping server never blocks the interval
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let response;
      try {
        response = await fetch(`${this.serverUrl}/api/attendance/offline-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: this.studentId,
            timerSeconds: this.timerSeconds,
            lecture: this.currentLecture,
            // Include periodId so server can update the right PeriodAttendance record
            // even after the period has ended (set by syncToServerWithContext for final syncs)
            periodId: this._finalSyncPeriodId || (this.currentLecture?.period
                ? `P${this.currentLecture.period}`
                : (this.currentLecture?.periodId || null)),
            timestamp: syncTimestamp,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            currentBSSID: currentBSSID,
            attendedMinutes: Math.floor(this.timerSeconds / 60),
            sessionStartTime: this.lectureStartTime
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        // 403 = no check-in yet, 404 = student not found — these are server-side errors,
        // NOT network failures. Don't mark as offline for these.
        const errData = await response.json().catch(() => ({}));
        const serverMsg = errData.error || errData.message || `HTTP ${response.status}`;

        if (response.status === 403 || response.status === 404 || response.status === 400) {
            // Server is reachable — keep online status, just log the error
            this.isOnline = true;
            this.hasInternetConnection = true;
            console.warn(`⚠️ Sync rejected by server (${response.status}): ${serverMsg}`);
            this.notifyListeners({
                type: 'sync_server_error',
                statusCode: response.status,
                message: serverMsg
            });
            return { success: false, serverError: true, message: serverMsg };
        }
        throw new Error(`Sync failed: ${response.status} - ${serverMsg}`);
      }

      const result = await response.json();
      
      if (result.success) {
        this.isOnline = true;
        this.hasInternetConnection = true;
        this.lastSyncTime = _getBootMs() || Date.now();
        
        // Store server-computed attendance status
        if (result.attendanceStatus) {
          this.attendanceStatus = result.attendanceStatus;
        }
        if (result.thresholdSeconds !== null && result.thresholdSeconds !== undefined) {
          this.thresholdSeconds = result.thresholdSeconds;
        }
        if (result.attendanceThreshold) {
          this.attendanceThreshold = result.attendanceThreshold;
        }
        
        // Check for missed random rings
        if (result.missedRandomRing) {
          console.log('🔔 Missed random ring detected!');
          this.notifyListeners({
            type: 'missed_random_ring',
            randomRing: result.missedRandomRing
          });
        }
        
        // Clear sync queue on successful sync — save empty queue first, then clear in memory
        await this.saveSyncQueue();
        this.syncQueue = [];
        await this.saveSyncQueue();
        this.pendingSyncCount = 0;
        
        console.log('✅ Sync successful - Duration updated in MongoDB');
        
        // Notify listeners of successful sync
        this.notifyListeners({
          type: 'sync_successful',
          timerSeconds: this.timerSeconds,
          lastSyncTime: this.lastSyncTime,
          attendanceStatus: this.attendanceStatus || 'absent',
          thresholdSeconds: this.thresholdSeconds || null,
          attendanceThreshold: this.attendanceThreshold || 75
        });
        
        // Also notify connectivity change to update UI
        this.notifyListeners({
          type: 'connectivity_changed',
          isOnline: this.isOnline,
          hasInternet: this.hasInternetConnection,
          hasAuthorizedWiFi: this.isConnectedToAuthorizedWiFi,
          pendingSyncs: this.pendingSyncCount
        });
        
        return { success: true };
      } else {
        throw new Error(result.error || 'Sync failed');
      }
      
    } catch (error) {
      console.warn('⚠️ Sync failed, queuing for later:', error.message);
      
      this.hasInternetConnection = false;
      this.isOnline = false;
      
      // Add to sync queue — capture full lecture context including period ID
      this.syncQueue.push({
        timerSeconds: this.timerSeconds,
        lecture: this.currentLecture,
        // Explicitly store period ID so server can update the right PeriodAttendance record
        // even after the period has ended and getCurrentLectureInfo() returns null
        periodId: this._finalSyncPeriodId || (this.currentLecture?.period
            ? `P${this.currentLecture.period}`
            : (this.currentLecture?.periodId || null)),
        timestamp: _getBootMs() || Date.now(),
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        attendedMinutes: Math.floor(this.timerSeconds / 60)
      });
      
      await this.saveSyncQueue();
      this.pendingSyncCount = this.syncQueue.length;
      
      // Notify listeners of sync failure
      this.notifyListeners({
        type: 'sync_failed',
        error: error.message,
        pendingSyncs: this.pendingSyncCount
      });
      
      // Also notify connectivity change to update UI
      this.notifyListeners({
        type: 'connectivity_changed',
        isOnline: this.isOnline,
        hasInternet: this.hasInternetConnection,
        hasAuthorizedWiFi: this.isConnectedToAuthorizedWiFi,
        pendingSyncs: this.pendingSyncCount
      });
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup app state listener for background handling
   */
  setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        console.log('📱 App resumed from background');

        if (this.isRunning || TimerService?.isRunning) {
          // Step 1: Check if native service stopped the timer due to WiFi mismatch
          if (TimerModule) {
            try {
              const { seconds, isRunning: nativeRunning, stoppedDueToWifiInvalid } =
                await TimerModule.getElapsedSeconds();

              if (stoppedDueToWifiInvalid) {
                // Native layer detected student left classroom while screen was off
                console.warn('🚨 Native BSSID check stopped timer — student left classroom');
                this.timerSeconds = Math.floor(seconds);
                this.isRunning = false;
                this.isPaused = false;
                await this.saveState();
                await this.syncToServer();
                // Clear the flag so it doesn't fire again
                TimerModule.clearWifiInvalidFlag().catch(() => {});
                this.notifyListeners({
                  type: 'timer_stopped',
                  reason: 'wifi_left_classroom_background',
                  finalSeconds: this.timerSeconds,
                  canResume: false
                });
                this.backgroundStartTime = null;
                this.appState = nextAppState;
                return;
              }

              // Step 2: Native timer still running — sync elapsed seconds
              this.timerSeconds = Math.floor(seconds);
              console.log(`⏱️ Synced from native timer: ${this.timerSeconds}s`);
            } catch (e) {
              console.warn('⚠️ Could not sync from native timer:', e);
            }
          }

          // Step 3: Re-validate WiFi now that screen is on (APIs reliable again)
          const currentBSSID = await WiFiManager.getCurrentBSSID();

          if (currentBSSID) {
            const validation = await BSSIDStorage.validateCurrentBSSID(currentBSSID);
            if (validation.valid) {
              console.log('✅ Still in authorized WiFi - timer continued in background');
              await this.syncToServer();
            } else {
              console.warn('⚠️ No longer in authorized WiFi - stopping timer');
              await this.stopTimer('wifi_disconnected_background');
            }
          } else {
            console.warn('⚠️ No WiFi connection on foreground - stopping timer');
            await this.stopTimer('wifi_disconnected_background');
          }
        } else if (!this.isRunning && this.timerSeconds > 0 && this.currentLecture) {
          // Timer was running before background but native service stopped it
          // (lecture ended, BSSID mismatch, etc.) — check if lecture ended normally
          console.log('📱 Foreground resume: timer stopped in background, checking if lecture ended');
          const lectureEnded = this.isLectureEnded();
          if (lectureEnded) {
            console.log('⏰ Lecture ended while in background — setting wasRunningBeforeLectureEnd for auto-start');
            // Sync the final timer value first
            await this.syncToServerWithContext(
              this.currentLecture ? { ...this.currentLecture } : null,
              this.timerSeconds,
              this.currentLecture?.period ? `P${this.currentLecture.period}` : null
            );
            // Mark that timer was running so next period auto-starts
            this.wasRunningBeforeLectureEnd = true;
            this.notifyListeners({
              type: 'lecture_ended',
              lecture: this.currentLecture,
              finalSeconds: this.timerSeconds,
              attendedMinutes: Math.floor(this.timerSeconds / 60)
            });
          }
        }

        this.backgroundStartTime = null;
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background / screen off
        console.log('📱 App going to background — native foreground service keeps timer alive with BSSID checks');

        if (this.isRunning) {
          // Native TimerService will check BSSID every 60s using Android WifiManager
          // which works reliably in a foreground service even with screen off.
          // JS-side WiFi APIs are unreliable when screen is off on OEM devices.
          this.backgroundStartTime = _getBootMs() || Date.now();
          console.log('✅ Timer running in native service — BSSID validated every 60s natively');
        }
      }

      this.appState = nextAppState;
    });
  }

  /**
   * Save timer state to storage with disconnection tracking
   */
  async saveState() {
    try {
      const state = {
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        timerSeconds: this.timerSeconds,
        currentLecture: this.currentLecture,
        lectureStartTime: this.lectureStartTime,
        authorizedBSSID: this.authorizedBSSID,
        lastSyncTime: this.lastSyncTime,
        attendanceStatus: this.attendanceStatus || 'absent',
        thresholdSeconds: this.thresholdSeconds || null,
        // Disconnection tracking
        wasRunningBeforeDisconnect: this.wasRunningBeforeDisconnect,
        disconnectionTime: this.disconnectionTime,
        pausedDueToWiFiLoss: this.pausedDueToWiFiLoss,
        previousLectureData: this.previousLectureData,
        timestamp: _getBootMs() || Date.now(),
        bootMs: _getBootMs()  // spoof-proof anchor for age check on restore
      };
      
      await AsyncStorage.setItem(OFFLINE_TIMER_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('❌ Failed to save timer state:', error);
    }
  }

  /**
   * Load timer state from storage with disconnection tracking.
   * On restore, fetches latest timerSeconds from server so the value
   * is accurate even if the app was killed while the native timer was running.
   */
  async loadState() {
    try {
      const savedState = await AsyncStorage.getItem(OFFLINE_TIMER_KEY);
      
      if (savedState) {
        const state = JSON.parse(savedState);
        
        // Check if state is recent (within 1 hour)
        let stateAge;
        if (state.bootMs && state.bootMs > 0) {
          stateAge = _getBootMs() - state.bootMs;
        } else {
          stateAge = Date.now() - state.timestamp;
        }
        if (stateAge < 3600000) { // 1 hour
          this.isRunning = state.isRunning;
          this.isPaused = state.isPaused;
          this.timerSeconds = state.timerSeconds;
          this.currentLecture = state.currentLecture;
          this.lectureStartTime = state.lectureStartTime;
          this.authorizedBSSID = state.authorizedBSSID;
          this.lastSyncTime = state.lastSyncTime;
          
          // Load disconnection tracking
          this.wasRunningBeforeDisconnect = state.wasRunningBeforeDisconnect || false;
          this.disconnectionTime = state.disconnectionTime || null;
          this.pausedDueToWiFiLoss = state.pausedDueToWiFiLoss || false;
          this.previousLectureData = state.previousLectureData || null;
          this.attendanceStatus = state.attendanceStatus || 'absent';
          this.thresholdSeconds = state.thresholdSeconds || null;
          
          console.log('📦 Loaded timer state from storage:', {
            timerSeconds: this.timerSeconds,
            isRunning: this.isRunning,
            pausedDueToWiFiLoss: this.pausedDueToWiFiLoss,
            lecture: this.currentLecture?.subject
          });

          // If was running, try to get the latest timerSeconds from the native module
          // (it may have kept counting while the app was killed)
          if (this.isRunning && !this.isPaused && !this.pausedDueToWiFiLoss) {
            if (TimerModule) {
              try {
                const { seconds } = await TimerModule.getElapsedSeconds();
                if (seconds > this.timerSeconds) {
                  console.log(`⏱️ Native timer ahead: ${seconds}s vs stored ${this.timerSeconds}s — using native`);
                  this.timerSeconds = Math.floor(seconds);
                }
              } catch (_) {
                // Native module unavailable — use stored value
              }
            }
            this.startCounting();
          }
        } else {
          console.log('⚠️ Saved state too old, ignoring');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load timer state:', error);
    }
  }

  /**
   * Save sync queue to storage
   */
  async saveSyncQueue() {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('❌ Failed to save sync queue:', error);
    }
  }

  /**
   * Load sync queue from storage
   */
  async loadSyncQueue() {
    try {
      const savedQueue = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      
      if (savedQueue) {
        this.syncQueue = JSON.parse(savedQueue);
        this.pendingSyncCount = this.syncQueue.length; // Update pending sync count
        console.log(`📦 Loaded ${this.syncQueue.length} queued syncs`);
      } else {
        this.syncQueue = [];
        this.pendingSyncCount = 0;
      }
    } catch (error) {
      console.error('❌ Failed to load sync queue:', error);
      this.syncQueue = [];
      this.pendingSyncCount = 0;
    }
  }

  /**
   * Get current timer state with disconnection info
   */
  getState() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      timerSeconds: this.timerSeconds,
      currentLecture: this.currentLecture,
      isOnline: this.isOnline,
      hasInternetConnection: this.hasInternetConnection,
      isConnectedToAuthorizedWiFi: this.isConnectedToAuthorizedWiFi,
      lastSyncTime: this.lastSyncTime,
      queuedSyncs: this.syncQueue.length,
      pendingSyncCount: this.pendingSyncCount,
      // Attendance status from server
      attendanceStatus: this.attendanceStatus || 'absent',
      thresholdSeconds: this.thresholdSeconds || null,
      attendanceThreshold: this.attendanceThreshold || 75,
      // Disconnection state
      pausedDueToWiFiLoss: this.pausedDueToWiFiLoss,
      wasRunningBeforeDisconnect: this.wasRunningBeforeDisconnect,
      canResumeAfterReconnection: this.pausedDueToWiFiLoss && this.wasRunningBeforeDisconnect
    };
  }

  /**
   * Add listener for timer events
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Error in timer listener:', error);
      }
    });
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopCounting();
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.bssidMonitorInterval) {
      clearInterval(this.bssidMonitorInterval);
      this.bssidMonitorInterval = null;
    }
    
    if (this.internetCheckInterval) {
      clearInterval(this.internetCheckInterval);
      this.internetCheckInterval = null;
    }
    
    if (this.lectureEndCheckInterval) {
      clearInterval(this.lectureEndCheckInterval);
      this.lectureEndCheckInterval = null;
    }
    
    if (this._midnightResetTimer) {
      clearTimeout(this._midnightResetTimer);
      this._midnightResetTimer = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // Clear in-memory face embedding cache on cleanup/logout.
    // The persistent AsyncStorage cache is cleared separately by
    // SecureStorage.clearFaceData() which is called in App.js handleLogout.
    this._cachedFaceEmbedding = null;
    this._cachedFaceEmbeddingEnrolledAt = null;
    
    this.listeners = [];
  }
}

// Export singleton instance
export default new OfflineTimerService();