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
import SecureStorage from './SecureStorage';
import { getServerTime } from './ServerTime';

import { GET_HEALTH, GET_STUDENT_FACE_DATA, POST_ATTENDANCE_CHECK_IN, POST_ATTENDANCE_OFFLINE_SYNC } from './constants/apiEndpoints';
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
    this.isManuallyMarked = false;
    
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

    // Face embedding cache — fetched once per day, re-fetched after 7 days or on change
    this._cachedFaceEmbedding = null;
    this._cachedFaceEmbeddingDate = null; // "YYYY-MM-DD" when embedding was cached
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
    
    // Sync retry tracking
    this.syncRetryCount = 0;
    this.RETRY_LIMIT = 5;
    this.needsUserIntervention = false;
    
    // Background timer tracking
    this.backgroundStartTime = null;
  }

  _getISTDateString() {
    let timestamp;
    try {
      const { getServerTime } = require('./ServerTime');
      timestamp = getServerTime().now();
    } catch (_) {
      timestamp = Date.now();
    }
    const ist = new Date(timestamp + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[0];
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

      // Initial connectivity check — run in background, don't block initialization
      this.checkInternetConnectivity().catch(() => {});

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

        // Under Shuttle Relay (Partner/Couple Relay), we allow starting the timer even if manually marked 
        // to let the student's physical tracking time catch up to the manual baseline and potentially exceed it!
        if (this.isManuallyMarked) {
          console.log('🏃 [SHUTTLE RELAY] Student manually marked present but starting/resuming countdown timer.');
        }

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
        const todayStr = this._getISTDateString();
        const isAlreadyVerifiedToday = this.verifiedToday && this.verifiedTodayDate === todayStr;

        // NEW RULES FOR PERIOD TRANSITION GATING:
        let periodTransitionRequiresFace = false;
        let transitionReason = '';
        if (isAlreadyVerifiedToday && !isSameLecture && this.lastVerifiedLecture) {
          const roomChanged = (this.lastVerifiedLecture.room || '').trim().toLowerCase() !== (lectureInfo.room || '').trim().toLowerCase();
          const hasGap = this.hasGapBetweenLectures(this.lastVerifiedLecture, lectureInfo);
          if (roomChanged) {
            periodTransitionRequiresFace = true;
            transitionReason = 'room_changed';
            console.log(`👤 Different classroom detected (${this.lastVerifiedLecture.room} -> ${lectureInfo.room}) — requiring face verification`);
          } else if (hasGap) {
            periodTransitionRequiresFace = true;
            transitionReason = 'gap_detected';
            console.log('👤 Break/Gap detected between periods — requiring face verification');
          }
        }

        // Face verify only needed for: first start of the day OR different room/gap transition OR new lecture when not verified today
        const needsFaceVerification = periodTransitionRequiresFace || 
          (!isAlreadyVerifiedToday && (!isSameLecture ||
            (!isWiFiResumeInSameLecture && !isManualRestartInSameLecture && !isSameLectureContinuation)));

        let faceVerificationResult = { success: true };

        if (!needsFaceVerification) {
          // Skip face verification — WiFi resume, manual restart, same lecture, or already verified today
          const reason = isAlreadyVerifiedToday ? 'already verified today (same room & continuous period transition)'
            : isWiFiResumeInSameLecture ? 'WiFi resume in same lecture'
            : isManualRestartInSameLecture ? 'manual restart in same lecture'
            : 'same lecture continuation';
          console.log(`🔄 Skipping face verification — ${reason}`);
          console.log('📚 Continuing from timer value:', this.timerSeconds);
          
          // Period transition: even though face verification is skipped, update lastVerifiedLecture so subsequent transitions verify against this new lecture room/schedule
          if (!isSameLecture) {
            this.lastVerifiedLecture = { ...lectureInfo };
          }
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
          this.verifiedTodayDate = this._getISTDateString();

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

        // Non-blocking background recovery:
        if (!isSameLecture || this.timerSeconds === 0) {
          const periodId = lectureInfo.period ? `P${lectureInfo.period}` : (lectureInfo.periodNumber ? `P${lectureInfo.periodNumber}` : 'P1');
          this._recoverAttendanceInBackground(lectureInfo, periodId).catch(() => {});
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

        // Step 4: Register check-in and sync — run in background, don't block success return.
        // Timer is already running at this point. Network calls should never delay the UI response.
        if (needsFaceVerification) {
          this.registerCheckIn(lectureInfo, bssidCheck.currentBSSID, faceVerificationResult).catch(() => {});
        }
        this.syncToServer().catch(() => {});

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
   * Recovers existing attendance from the server in the background without blocking startup.
   */
  async _recoverAttendanceInBackground(lectureInfo, periodId) {
    try {
      console.log(`📡 [BACKGROUND RECOVERY] Fetching existing attendance for ${periodId}...`);
      const todayStr = this._getISTDateString();
      const attController = new AbortController();
      const attTimeout = setTimeout(() => attController.abort(), 6000);
      const response = await fetch(`${this.serverUrl}/api/attendance/student/${this.studentId}/date/${todayStr}`, {
        signal: attController.signal
      });
      clearTimeout(attTimeout);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.record && data.record.lectures) {
          const existingLecture = data.record.lectures.find(l => l.period === periodId);
          if (existingLecture) {
            const recoveredSeconds = existingLecture.actualAttended != null
              ? existingLecture.actualAttended
              : (existingLecture.attended || 0);
            if (recoveredSeconds > this.timerSeconds) {
              console.log(`✅ [BACKGROUND RECOVERY] Recovered ${recoveredSeconds}s (current=${this.timerSeconds}s) from server for ${periodId}`);
              
              // Only update if the user hasn't switched to a different lecture in the meantime
              const currentPeriodId = this.currentLecture?.period ? `P${this.currentLecture.period}` : (this.currentLecture?.periodNumber ? `P${this.currentLecture.periodNumber}` : 'P1');
              if (this.currentLecture && currentPeriodId === periodId) {
                this.timerSeconds = recoveredSeconds;
                
                // Write the new state locally
                await this.saveState();
                
                // If the timer is still actively running, restart native/JS ticking at the recovered base value
                if (this.isRunning && !this.isPaused) {
                  console.log(`🔄 [BACKGROUND RECOVERY] Updating running timer to recovered value: ${recoveredSeconds}s`);
                  this.startCounting();
                }
                
                // Notify listeners of the tick update
                this.notifyListeners({
                  type: 'timer_tick',
                  timerSeconds: this.timerSeconds,
                  lecture: this.currentLecture
                });
              } else {
                console.log(`⚠️ [BACKGROUND RECOVERY] Found recovered seconds but lecture/period changed from ${periodId} to ${currentPeriodId}`);
              }
            } else {
              console.log(`ℹ️ [BACKGROUND RECOVERY] Server seconds (${recoveredSeconds}s) are not greater than local (${this.timerSeconds}s).`);
            }
          }
        }
      }
    } catch (err) {
      console.log('⚠️ [BACKGROUND RECOVERY] Failed to fetch existing attendance:', err.message);
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
   * Priority order:
   *   1. In-memory cache (fastest, valid for 7 days since last fetch)
   *   2. Persistent SecureStorage cache (survives app restarts — written at login & BSSID refresh)
   *   3. Live server fetch (requires internet)
   *   4. Stale in-memory cache (last resort if server unreachable)
   */
  async getStudentFaceData() {
    try {
      const todayStr = this._getISTDateString();

      // 1. Return in-memory cache if it's less than 7 days old
      if (this._cachedFaceEmbedding && this._cachedFaceEmbeddingDate) {
        const cachedDate = new Date(this._cachedFaceEmbeddingDate);
        const daysDiff = (Date.now() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff < 7) {
          console.log('📦 Using in-memory cached face embedding (cached on', this._cachedFaceEmbeddingDate, ')');
          return { success: true, embedding: this._cachedFaceEmbedding, enrolledAt: this._cachedFaceEmbeddingDate };
        }
      }

      // 2. Try persistent SecureStorage cache (written at login & BSSID schedule refresh)
      //    This is the key offline fallback — works even after app restart with no internet.
      try {
        const persistedCache = await SecureStorage.getCachedServerEmbedding();
        if (persistedCache && Array.isArray(persistedCache.embedding) && persistedCache.embedding.length > 0) {
          console.log('💾 Using persistent SecureStorage face embedding (offline fallback)');
          // Warm the in-memory cache so subsequent calls in this session are instant
          this._cachedFaceEmbedding = persistedCache.embedding;
          this._cachedFaceEmbeddingDate = persistedCache.enrolledAt || todayStr;
          return { success: true, embedding: persistedCache.embedding, enrolledAt: persistedCache.enrolledAt };
        }
      } catch (storageError) {
        console.warn('⚠️ SecureStorage read failed, proceeding to server fetch:', storageError.message);
      }

      // 3. Fetch from server (requires internet)
      console.log('📡 Fetching fresh face embedding from server...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(GET_STUDENT_FACE_DATA(this.studentId), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to get face data' };
      }

      if (!data.faceEmbedding || !Array.isArray(data.faceEmbedding)) {
        return { success: false, error: 'No face embedding found. Please enroll your face first.' };
      }

      // Cache in memory and persist to SecureStorage for future offline use
      this._cachedFaceEmbedding = data.faceEmbedding;
      this._cachedFaceEmbeddingDate = todayStr;
      SecureStorage.saveCachedServerEmbedding(data.faceEmbedding, data.enrolledAt || todayStr).catch(() => {});
      console.log('✅ Face embedding fetched from server and cached');

      return { success: true, embedding: data.faceEmbedding, enrolledAt: data.enrolledAt };

    } catch (error) {
      console.error('❌ Error fetching face data:', error);
      // 4. Last resort: stale in-memory cache
      if (this._cachedFaceEmbedding) {
        console.warn('⚠️ Using stale in-memory face embedding due to fetch error');
        return { success: true, embedding: this._cachedFaceEmbedding, enrolledAt: this._cachedFaceEmbeddingDate };
      }
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout — skip if offline
      const response = await fetch(POST_ATTENDANCE_CHECK_IN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          enrollmentNo: this.studentId,
          faceEmbedding: storedEmbedding,
          wifiBSSID: currentBSSID || '',
          timestamp,
        }),
      });
      clearTimeout(timeoutId);

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
      
      // Step 5: Save state and sync — sync is fire-and-forget (don't block reconnection return)
      await this.saveState();
      this.syncToServer().catch(() => {});
      
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
      const response = await fetch(POST_ATTENDANCE_OFFLINE_SYNC, {
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
      } else if (reason === 'manual_mark') {
        console.log('👨‍🏫 Manual mark stop detected - freezing timer');
        this.wasRunningBeforeDisconnect = false;
        this.pausedDueToWiFiLoss = false;
        this.disconnectionTime = null;
        this.previousLectureData = null;
        this.thresholdSeconds = null;
      } else if (reason === 'manual') {
        // Manual stop - track for potential same-lecture restart
        console.log('✋ Manual stop detected - tracking for potential same-lecture restart');
        this.wasManuallyStoppedInSameLecture = true;
        
        // DON'T clear lecture context for manual stops - preserve for same-lecture detection
        console.log('💾 Preserving lecture context for same-lecture restart detection');
        console.log('   Current timer seconds:', this.timerSeconds);
        console.log('   Current lecture:', this.currentLecture?.subject);
        
        this.previousLectureData = null;
        // this.wasManuallyStoppedInSameLecture remains true
        this.thresholdSeconds = null;  // reset threshold on any stop
        this.attendanceStatus = 'absent';
      } else if (reason === 'lecture_ended' || reason === 'period_change') {
        // Lecture ended or period changed - track that timer was running for auto-start next period
        console.log('⏰ Lecture period ended or changed - preparing for next period auto-start');
        this.wasRunningBeforeLectureEnd = true;  // Track for auto-start in next period
        this.wasManuallyStoppedInSameLecture = false;
        this.wasRunningBeforeDisconnect = false;
        this.disconnectionTime = null;
        this.pausedDueToWiFiLoss = false;
        this.previousLectureData = this.currentLecture ? { ...this.currentLecture } : null;
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

    const maxSeconds = this._getLectureDurationSeconds();
    if (this.timerSeconds > maxSeconds) {
      this.timerSeconds = maxSeconds;
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

  _getLectureDurationSeconds() {
    if (!this.currentLecture || !this.currentLecture.startTime || !this.currentLecture.endTime) {
      return 3600; // default 1 hour fallback
    }
    try {
      const parseTimeToMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const durationMins = parseTimeToMinutes(this.currentLecture.endTime) - parseTimeToMinutes(this.currentLecture.startTime);
      return durationMins * 60;
    } catch (e) {
      console.warn('⚠️ Error parsing lecture times inside OfflineTimerService:', e);
      return 3600;
    }
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
        // Full version: BSSID + sync + lecture end time + periodId (stops natively when period ends)
        const endTime = this.currentLecture?.endTime || '';
        let periodId = '';
        if (this.currentLecture?.period) {
          const rawPeriod = this.currentLecture.period.toString();
          periodId = rawPeriod.startsWith('P') ? rawPeriod : `P${rawPeriod}`;
        } else if (this.currentLecture?.periodNumber) {
          const rawPeriod = this.currentLecture.periodNumber.toString();
          periodId = rawPeriod.startsWith('P') ? rawPeriod : `P${rawPeriod}`;
        }
        TimerModule.startTimerWithBSSIDAndSyncAndEnd(
          subject,
          this.timerSeconds,
          bssidList,
          this.studentId || '',
          this.serverUrl || '',
          endTime,
          periodId
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

      // CAPPING LOGIC: Ensure timerSeconds NEVER exceeds the actual elapsed progress of the lecture
      let maxSeconds = this._getLectureDurationSeconds();
      if (this.isManuallyMarked) {
        // Bypass elapsed capping for manual overrides to preserve 75% marked present threshold
      } else if (this.currentLecture && this.currentLecture.startTime) {
        try {
          const now = new Date();
          const todayDateStr = now.toISOString().split('T')[0];
          const periodStart = new Date(`${todayDateStr}T${this.currentLecture.startTime}:00`);
          const periodEnd = this.currentLecture.endTime 
            ? new Date(`${todayDateStr}T${this.currentLecture.endTime}:00`)
            : new Date(periodStart.getTime() + maxSeconds * 1000);
          
          const currentTime = now.getTime();
          const elapsedMs = currentTime - periodStart.getTime();
          
          if (elapsedMs > 0) {
            const elapsedSec = Math.floor(elapsedMs / 1000);
            const durationSec = Math.floor((periodEnd.getTime() - periodStart.getTime()) / 1000);
            maxSeconds = Math.min(durationSec, elapsedSec);
          } else {
            maxSeconds = 0; // Class hasn't started yet!
          }
        } catch (_) {}
      }

      if (this.timerSeconds > maxSeconds) {
        console.log(`⏱️ Capping timerSeconds at actual elapsed progress of ${maxSeconds} seconds (was ${this.timerSeconds}s)`);
        this.timerSeconds = maxSeconds;
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
    
    if (typeof this.currentLecture?.endTime !== 'string') return false;
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
    if (!this.currentLecture || !newLecture) {
      console.log('🔍 isSameLecture: false (one or both lectures null)', {
        current: !!this.currentLecture,
        new: !!newLecture
      });
      return false;
    }

    // Primary: compare by period number (most reliable)
    const curPeriod = this.currentLecture.period ?? this.currentLecture.periodNumber;
    const newPeriod = newLecture.period ?? newLecture.periodNumber;
    
    let isSame = false;
    let method = '';

    if (curPeriod != null && newPeriod != null) {
      isSame = String(curPeriod) === String(newPeriod);
      method = 'period';
    } else if (this.currentLecture.startTime && newLecture.startTime) {
      // Fallback: compare by start+end time
      isSame = this.currentLecture.startTime === newLecture.startTime &&
               this.currentLecture.endTime   === newLecture.endTime;
      method = 'time';
    } else {
      // Last resort: subject + room
      isSame = (this.currentLecture.subject || '') === (newLecture.subject || '') &&
               (this.currentLecture.room    || '') === (newLecture.room    || '');
      method = 'subject+room';
    }

    console.log(`🔍 isSameLecture: ${isSame} (via ${method})`, {
      current: { 
        subject: this.currentLecture.subject, 
        period: curPeriod, 
        time: `${this.currentLecture.startTime}-${this.currentLecture.endTime}` 
      },
      new: { 
        subject: newLecture.subject, 
        period: newPeriod, 
        time: `${newLecture.startTime}-${newLecture.endTime}` 
      }
    });

    return isSame;
  }

  /**
   * Determine if there is a gap or break in time between two lectures
   */
  hasGapBetweenLectures(prevLecture, nextLecture) {
    if (!prevLecture || !nextLecture || !prevLecture.endTime || !nextLecture.startTime) {
      return true; // If missing info, assume a gap for safety
    }
    try {
      const [prevHour, prevMinute] = prevLecture.endTime.split(':').map(Number);
      const [nextHour, nextMinute] = nextLecture.startTime.split(':').map(Number);
      
      const prevTotal = prevHour * 60 + prevMinute;
      const nextTotal = nextHour * 60 + nextMinute;
      
      // If there is any positive gap in minutes, return true
      return nextTotal > prevTotal;
    } catch (err) {
      console.warn('⚠️ Error parsing lecture gap times:', err.message);
      return true; // Default to gap for safety
    }
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
   * Setup sync interval (every 30 seconds with random jitter)
   */
  setupSyncInterval() {
    if (this.syncInterval) {
      clearTimeout(this.syncInterval);
      this.syncInterval = null;
    }

    const tick = async () => {
      // 1. If timer is running, perform regular heartbeat sync
      if (this.isRunning) {
        await this.syncToServer();
      }
      
      // 2. If we have pending offline data and are online, attempt to flush the queue
      // This ensures data is synced even during breaks or after periods end.
      if (this.hasInternetConnection && this.syncQueue.length > 0 && !this.needsUserIntervention) {
        console.log('🔄 Periodically checking sync queue for non-active period sync...');
        await this.syncPendingData();
      }

      // Schedule next tick with 0 to 5 seconds jitter (30s base) to prevent thundering herd spikes at 300+ scale
      const jitter = Math.floor(Math.random() * 5000);
      this.syncInterval = setTimeout(tick, 30000 + jitter);
    };

    // Stagger initial check with a random initial delay so devices do not synchronize start loops
    const initialDelay = Math.floor(Math.random() * 5000);
    this.syncInterval = setTimeout(tick, initialDelay);
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
      console.log('🌙 Midnight — resetting verifiedToday and face embedding cache');
      this.verifiedToday = false;
      this.verifiedTodayDate = null;
      this._cachedFaceEmbedding = null;
      this._cachedFaceEmbeddingDate = null;
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
        
        const response = await fetch(GET_HEALTH, {
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
          pendingSyncs: this.pendingSyncCount,
          __pending_sync: this.pendingSyncCount
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

    // If retry limit reached, don't auto-sync unless user manually triggers it
    if (this.needsUserIntervention) {
      console.log('⚠️ Sync paused - awaiting user intervention (retry limit exceeded)');
      return;
    }

    console.log(`🔄 Syncing ${this.syncQueue.length} pending items... (Attempt ${this.syncRetryCount + 1}/${this.RETRY_LIMIT})`);

    // Try to sync current timer state first (if running)
    if (this.isRunning) {
      await this.syncToServer();
    }

    // Process ALL queued items — don't stop on failure, try each one
    const queueCopy = [...this.syncQueue];
    let successCount = 0;
    let failedCount = 0;

    for (const queueItem of queueCopy) {
      try {
        const queueController = new AbortController();
        const queueTimeoutId = setTimeout(() => queueController.abort(), 10000);
        const periodDisplay = queueItem.periodId || 'Unknown Period';
        console.log(`📤 [OFFLINE SYNC] Syncing ${periodDisplay}: ${queueItem.timerSeconds}s (${queueItem.attendedMinutes}m)`);
        let queueResponse;
        try {
          queueResponse = await fetch(POST_ATTENDANCE_OFFLINE_SYNC, {
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
            console.log(`✅ [OFFLINE SYNC] Success for ${queueItem.periodId}`);
            successCount++;
            this.syncQueue = this.syncQueue.filter(item => item.timestamp !== queueItem.timestamp);
          } else {
            console.warn(`⚠️ [OFFLINE SYNC] Server rejected item ${queueItem.periodId}:`, result.error || 'Unknown error');
            failedCount++;
          }
        } else {
          console.warn(`⚠️ [OFFLINE SYNC] Server error for ${queueItem.periodId}: Status ${queueResponse.status}`);
          failedCount++;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to sync queued item (timestamp=${queueItem.timestamp}):`, error.message);
        failedCount++;
      }
    }

    if (successCount > 0) {
      console.log(`✅ Successfully synced ${successCount}/${queueCopy.length} pending items`);
      await this.saveSyncQueue();
      this.pendingSyncCount = this.syncQueue.length;
      
      // Reset retry count on any success
      this.syncRetryCount = 0;
      this.needsUserIntervention = false;

      this.notifyListeners({
        type: 'pending_syncs_completed',
        syncedCount: successCount,
        remainingCount: this.pendingSyncCount,
        __pending_sync: this.pendingSyncCount
      });
    }

    if (failedCount > 0) {
      this.syncRetryCount++;
      console.log(`⚠️ Sync failed for ${failedCount} items. Retry count: ${this.syncRetryCount}/${this.RETRY_LIMIT}`);
      
      if (this.syncRetryCount >= this.RETRY_LIMIT) {
        this.needsUserIntervention = true;
        console.error('🚨 Sync retry limit exceeded! Prompting user for manual retry.');
        this.notifyListeners({
          type: 'sync_retry_limit_exceeded',
          pendingCount: this.syncQueue.length,
          __pending_sync: this.syncQueue.length
        });
      }
    }
  }

  /**
   * Manually retry syncing the batch of pending data (called by user prompt)
   */
  async retrySyncBatch() {
    console.log('🔄 User triggered manual sync retry...');
    this.syncRetryCount = 0;
    this.needsUserIntervention = false;
    
    // Check internet connectivity first
    await this.checkInternetConnectivity();
    
    if (this.hasInternetConnection) {
      return await this.syncPendingData();
    } else {
      return { success: false, error: 'Still no internet connection' };
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

    // Reset retry state on manual force sync to allow retrying stuck queues
    this.syncRetryCount = 0;
    this.needsUserIntervention = false;

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
        response = await fetch(POST_ATTENDANCE_OFFLINE_SYNC, {
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
      const periodId = this._finalSyncPeriodId || (this.currentLecture?.period 
            ? `P${this.currentLecture.period}` 
            : (this.currentLecture?.periodId || 'Unknown'));
      console.warn(`⚠️ Sync failed for ${periodId} (${this.timerSeconds}s), queuing for later:`, error.message);
      
      this.hasInternetConnection = false;
      this.isOnline = false;
      
      // Add to sync queue — capture full lecture context including period ID
      const existingIndex = this.syncQueue.findIndex(item => item.periodId === periodId);
      const queueItem = {
        timerSeconds: this.timerSeconds,
        lecture: this.currentLecture,
        periodId: periodId,
        timestamp: _getBootMs() || Date.now(),
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        attendedMinutes: Math.floor(this.timerSeconds / 60)
      };

      if (existingIndex !== -1) {
        // Update existing entry with latest timer value
        this.syncQueue[existingIndex] = queueItem;
      } else {
        // New period or first time syncing this period offline
        this.syncQueue.push(queueItem);
      }
      
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
        pendingSyncs: this.pendingSyncCount,
        __pending_sync: this.pendingSyncCount
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
        timerSeconds: this.timerSeconds,
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        currentLecture: this.currentLecture,
        lectureStartTime: this.lectureStartTime,
        authorizedBSSID: this.authorizedBSSID,
        lastSyncTime: this.lastSyncTime,
        attendanceStatus: this.attendanceStatus,
        thresholdSeconds: this.thresholdSeconds,
        wasRunningBeforeDisconnect: this.wasRunningBeforeDisconnect,
        wasManuallyStoppedInSameLecture: this.wasManuallyStoppedInSameLecture,
        disconnectionTime: this.disconnectionTime,
        pausedDueToWiFiLoss: this.pausedDueToWiFiLoss,
        previousLectureData: this.previousLectureData,
        isManuallyMarked: this.isManuallyMarked,
        lastVerifiedLecture: this.lastVerifiedLecture,
        lastFaceVerificationTime: this.lastFaceVerificationTime,
        verifiedToday: this.verifiedToday,
        verifiedTodayDate: this.verifiedTodayDate,
        timestamp: _getBootMs() || Date.now(),
        bootMs: _getBootMs(),  // spoof-proof anchor for age check on restore
        date: this._getISTDateString() // Add date to discard across midnight
      };
      
      await AsyncStorage.setItem(OFFLINE_TIMER_KEY, JSON.stringify(state));
      
      // REDUNDANCY: Save the ENTIRE state to Native Hardware-backed Secure Storage
      // This survives if AsyncStorage is wiped or corrupted, and provides hardware encryption.
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      if (TimerModule && TimerModule.saveRedundancyData) {
        await TimerModule.saveRedundancyData('timer_state_full', JSON.stringify(state))
          .catch(err => console.warn('⚠️ Native state redundancy failed:', err.message));
      }
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
      let savedState = await AsyncStorage.getItem(OFFLINE_TIMER_KEY);
      
      // REDUNDANCY: Try to recover from TRULY persistent Native Hardware Redundancy
      const { TimerModule } = NativeModules;
      if (TimerModule && TimerModule.getRedundancyData) {
        try {
          const nativeStateJson = await TimerModule.getRedundancyData('timer_state_full');
          if (nativeStateJson) {
            console.log('🛡️ Recovered FULL timer state from Native Hardware Redundancy (Keystore)');
            if (!savedState) {
              savedState = nativeStateJson;
            } else {
              // Optionally merge or prefer native if it's more recent? 
              // For now, if AsyncStorage has data, we trust it (it's faster), 
              // but if it's empty, we use native.
            }
          }
        } catch (e) {
          console.warn('⚠️ Native redundancy recovery failed:', e.message);
        }
      }
      
      if (savedState) {
        const state = JSON.parse(savedState);
        
        const todayStr = this._getISTDateString();
        // Discard cache completely if the date changed or if it's from an old version (no date field)
        if (!state.date || state.date !== todayStr) {
            console.log('🔄 Date changed or old cache detected. Discarding offline timer cache.');
            await AsyncStorage.removeItem(OFFLINE_TIMER_KEY);
            return;
        }
        
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
          this.wasManuallyStoppedInSameLecture = state.wasManuallyStoppedInSameLecture || false;
          this.disconnectionTime = state.disconnectionTime || null;
          this.pausedDueToWiFiLoss = state.pausedDueToWiFiLoss || false;
          this.previousLectureData = state.previousLectureData || null;
          this.attendanceStatus = state.attendanceStatus || 'absent';
          this.thresholdSeconds = state.thresholdSeconds || null;
          this.isManuallyMarked = state.isManuallyMarked || false;
          this.lastVerifiedLecture = state.lastVerifiedLecture || null;
          this.lastFaceVerificationTime = state.lastFaceVerificationTime || null;
          this.verifiedToday = state.verifiedToday || false;
          this.verifiedTodayDate = state.verifiedTodayDate || null;
          
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
      const success = await SecureStorage.saveSyncQueue(this.syncQueue);
      if (!success) {
        // Fallback to AsyncStorage if SecureStorage fails for some reason
        await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
      }
    } catch (error) {
      console.error('❌ Failed to save sync queue:', error);
    }
  }

  /**
   * Load sync queue from storage
   */
  async loadSyncQueue() {
    try {
      // Try SecureStorage first
      let queue = await SecureStorage.loadSyncQueue();
      
      // Fallback/Migration: If SecureStorage empty, try old AsyncStorage key
      if (!queue || queue.length === 0) {
        const savedQueue = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
        if (savedQueue) {
          queue = JSON.parse(savedQueue);
          // Migrate to SecureStorage
          await SecureStorage.saveSyncQueue(queue);
          await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
        }
      }
      
      this.syncQueue = queue || [];
      this.pendingSyncCount = this.syncQueue.length;
      console.log(`📦 Loaded ${this.syncQueue.length} queued syncs`);
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
      __pending_sync: this.pendingSyncCount,
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
      clearTimeout(this.syncInterval);
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
    
    this.listeners = [];
  }

  /**
   * Clear all user-specific timer state, stored cache, and native redundancy on logout
   */
  async clearUserData() {
    try {
      console.log('🧹 Clearing all OfflineTimerService user data...');
      
      // 1. Reset in-memory properties
      this.isRunning = false;
      this.isPaused = false;
      this.timerSeconds = 0;
      this.studentId = null;
      this.serverUrl = null;
      
      this.currentLecture = null;
      this.lectureStartTime = null;
      this.authorizedBSSID = null;
      
      this.wasRunningBeforeDisconnect = false;
      this.disconnectionTime = null;
      this.pausedDueToWiFiLoss = false;
      this.previousLectureData = null;
      this.isManuallyMarked = false;
      
      this.wasManuallyStoppedInSameLecture = false;
      this.wasRunningBeforeLectureEnd = false;
      this.lastVerifiedLecture = null;
      this.lastFaceVerificationTime = null;
      this.verifiedToday = false;
      this.verifiedTodayDate = null;
      this._cachedFaceEmbedding = null;
      this._cachedFaceEmbeddingDate = null;
      this.syncQueue = [];
      this.pendingSyncCount = 0;
      this.syncRetryCount = 0;
      this.needsUserIntervention = false;
      this.backgroundStartTime = null;

      // 2. Clear AsyncStorage entries
      const keysToClear = [
        OFFLINE_TIMER_KEY,   // '@offline_timer_state'
        SYNC_QUEUE_KEY,       // '@sync_queue'
        LECTURE_CONTEXT_KEY   // '@lecture_context'
      ];
      await AsyncStorage.multiRemove(keysToClear).catch(() => {});

      // 3. Clear SecureStorage redundancy
      await SecureStorage.clearTimerStateRedundancy().catch(() => {});

      // 4. Clear Native Hardware Redundancy for timer_state_full
      if (TimerModule && TimerModule.clearRedundancyData) {
        await TimerModule.clearRedundancyData('timer_state_full').catch(() => {});
      } else if (TimerModule && TimerModule.saveRedundancyData) {
        await TimerModule.saveRedundancyData('timer_state_full', '').catch(() => {});
      }

      console.log('✅ OfflineTimerService user data cleared successfully');
      return true;
    } catch (error) {
      console.error('❌ Error clearing OfflineTimerService user data:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new OfflineTimerService();