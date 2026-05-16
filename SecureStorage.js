// SecureStorage.js - Secure storage for facial data in React Native
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  FACE_EMBEDDING: '@letsbunk_face_embedding',
  ENROLLMENT_NO: '@letsbunk_enrollment_no',
  FACE_ENROLLED_AT: '@letsbunk_face_enrolled_at',
  // Persistent server-fetched embedding cache (survives app restarts).
  // Invalidated on logout, app data clear, or when the server reports a newer enrolledAt.
  CACHED_SERVER_EMBEDDING:        '@letsbunk_cached_server_embedding',
  CACHED_SERVER_EMBEDDING_ENROLLED_AT: '@letsbunk_cached_server_embedding_enrolled_at',
  SYNC_QUEUE: '__pending_sync',
  TIMER_STATE_REDUNDANCY: '@letsbunk_timer_state_redundancy',
};

class SecureStorage {
  /**
   * Save face embedding to secure storage
   * @param {Array<number>} embedding - Face embedding array (192 floats)
   * @returns {Promise<boolean>} Success status
   */
  static async saveFaceEmbedding(embedding) {
    try {
      if (!embedding || !Array.isArray(embedding)) {
        console.warn('⚠️ Invalid face embedding provided');
        return false;
      }

      // Convert array to comma-separated string
      const embeddingString = embedding.join(',');
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      
      let dataToSave = embeddingString;
      
      if (TimerModule && TimerModule.encryptString) {
        try {
          const encrypted = await TimerModule.encryptString(embeddingString);
          dataToSave = `__ENCRYPTED__:${encrypted}`;
          console.log('🔒 Face embedding encrypted via Android Keystore');
        } catch (e) {
          console.warn('⚠️ Keystore encryption failed for face data:', e.message);
        }
      }

      await AsyncStorage.setItem(KEYS.FACE_EMBEDDING, dataToSave);
      
      // Save timestamp
      await AsyncStorage.setItem(KEYS.FACE_ENROLLED_AT, new Date().toISOString());
      
      console.log(`✅ Face embedding saved (${embedding.length} floats)`);
      return true;
    } catch (error) {
      console.error('❌ Error saving face embedding:', error);
      return false;
    }
  }

  /**
   * Get face embedding from secure storage
   * @returns {Promise<Array<number>|null>} Face embedding array or null
   */
  static async getFaceEmbedding() {
    try {
      const savedData = await AsyncStorage.getItem(KEYS.FACE_EMBEDDING);
      
      if (!savedData) {
        return null;
      }

      let embeddingString = savedData;
      
      if (savedData.startsWith('__ENCRYPTED__:')) {
        const encryptedBase64 = savedData.replace('__ENCRYPTED__:', '');
        const { NativeModules } = require('react-native');
        const { TimerModule } = NativeModules;
        
        if (TimerModule && TimerModule.decryptString) {
          try {
            embeddingString = await TimerModule.decryptString(encryptedBase64);
            console.log('🔓 Face embedding decrypted via Android Keystore');
          } catch (e) {
            console.error('❌ Keystore decryption failed for face data:', e.message);
            return null;
          }
        }
      }

      // Convert comma-separated string back to float array
      const embedding = embeddingString.split(',').map(parseFloat);
      
      console.log(`📥 Face embedding retrieved (${embedding.length} floats)`);
      return embedding;
    } catch (error) {
      console.error('❌ Error retrieving face embedding:', error);
      return null;
    }
  }

  /**
   * Save enrollment number
   * @param {string} enrollmentNo - Student enrollment number
   * @returns {Promise<boolean>} Success status
   */
  static async saveEnrollmentNumber(enrollmentNo) {
    try {
      await AsyncStorage.setItem(KEYS.ENROLLMENT_NO, enrollmentNo);
      console.log(`✅ Enrollment number saved: ${enrollmentNo}`);
      return true;
    } catch (error) {
      console.error('❌ Error saving enrollment number:', error);
      return false;
    }
  }

  /**
   * Get enrollment number
   * @returns {Promise<string|null>} Enrollment number or null
   */
  static async getEnrollmentNumber() {
    try {
      return await AsyncStorage.getItem(KEYS.ENROLLMENT_NO);
    } catch (error) {
      console.error('❌ Error retrieving enrollment number:', error);
      return null;
    }
  }

  /**
   * Check if face data is enrolled
   * @returns {Promise<boolean>} True if face data exists
   */
  static async hasFaceData() {
    try {
      const embedding = await this.getFaceEmbedding();
      const enrollmentNo = await this.getEnrollmentNumber();
      return !!(embedding && enrollmentNo);
    } catch (error) {
      console.error('❌ Error checking face data:', error);
      return false;
    }
  }

  /**
   * Get face enrollment timestamp
   * @returns {Promise<string|null>} ISO timestamp or null
   */
  static async getFaceEnrolledAt() {
    try {
      return await AsyncStorage.getItem(KEYS.FACE_ENROLLED_AT);
    } catch (error) {
      console.error('❌ Error retrieving enrollment timestamp:', error);
      return null;
    }
  }

  // ── Persistent server-fetched embedding cache ──────────────────────────────
  // This cache lives in AsyncStorage so it survives app restarts.
  // It is invalidated when:
  //   1. The student logs out (clearFaceData is called)
  //   2. The app data is cleared by the OS
  //   3. The enrollment app updates the face (server returns a newer enrolledAt)

  /**
   * Save the server-fetched face embedding to persistent storage.
   * Also writes to FACE_EMBEDDING so registerCheckIn can send it to the
   * server even when the enrollment app hasn't run on this device.
   * @param {Array<number>} embedding - 192-float embedding from server
   * @param {string} serverEnrolledAt - ISO timestamp returned by the server (faceEnrolledAt)
   * @returns {Promise<boolean>}
   */
  static async saveCachedServerEmbedding(embedding, serverEnrolledAt) {
    try {
      if (!embedding || !Array.isArray(embedding)) {
        console.warn('⚠️ Invalid embedding for cache');
        return false;
      }
      const embeddingStr = embedding.join(',');
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      
      let dataToSave = embeddingStr;
      
      if (TimerModule && TimerModule.encryptString) {
        try {
          const encrypted = await TimerModule.encryptString(embeddingStr);
          dataToSave = `__ENCRYPTED__:${encrypted}`;
          console.log('🔒 Server embedding cache encrypted via Keystore');
        } catch (e) {
          console.warn('⚠️ Keystore encryption failed for server cache:', e.message);
        }
      }

      await AsyncStorage.setItem(KEYS.CACHED_SERVER_EMBEDDING, dataToSave);
      await AsyncStorage.setItem(
        KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT,
        serverEnrolledAt || new Date().toISOString()
      );
      
      // Also keep FACE_EMBEDDING in sync (will also be encrypted by saveFaceEmbedding if called)
      await this.saveFaceEmbedding(embedding);
      
      console.log(`✅ Server embedding cached persistently (enrolledAt: ${serverEnrolledAt})`);
      return true;
    } catch (error) {
      console.error('❌ Error saving cached server embedding:', error);
      return false;
    }
  }

  /**
   * Load the persistent server-fetched embedding cache.
   */
  static async getCachedServerEmbedding() {
    try {
      const savedData = await AsyncStorage.getItem(KEYS.CACHED_SERVER_EMBEDDING);
      const enrolledAt = await AsyncStorage.getItem(KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT);
      if (!savedData) return null;
      
      let embeddingStr = savedData;
      
      if (savedData.startsWith('__ENCRYPTED__:')) {
        const encryptedBase64 = savedData.replace('__ENCRYPTED__:', '');
        const { NativeModules } = require('react-native');
        const { TimerModule } = NativeModules;
        
        if (TimerModule && TimerModule.decryptString) {
          try {
            embeddingStr = await TimerModule.decryptString(encryptedBase64);
            console.log('🔓 Server embedding cache decrypted via Keystore');
          } catch (e) {
            console.error('❌ Decryption failed for server cache:', e.message);
            return null;
          }
        }
      }
      
      const embedding = embeddingStr.split(',').map(parseFloat);
      return { embedding, enrolledAt: enrolledAt || null };
    } catch (error) {
      console.error('❌ Error loading cached server embedding:', error);
      return null;
    }
  }

  /**
   * Clear only the persistent server embedding cache.
   * Called when the enrollment app updates the face or on logout.
   * @returns {Promise<boolean>}
   */
  static async clearCachedServerEmbedding() {
    try {
      await AsyncStorage.multiRemove([
        KEYS.CACHED_SERVER_EMBEDDING,
        KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT,
      ]);
      console.log('🗑️ Persistent server embedding cache cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing cached server embedding:', error);
      return false;
    }
  }

  // ── End persistent server embedding cache ───────────────────────────────────

  /**
   * Clear all face data (logout)
   * @returns {Promise<boolean>} Success status
   */
  static async clearFaceData() {
    try {
      await AsyncStorage.multiRemove([
        KEYS.FACE_EMBEDDING,
        KEYS.ENROLLMENT_NO,
        KEYS.FACE_ENROLLED_AT,
        // Also wipe the persistent server embedding so the next login
        // always fetches a fresh copy from the server.
        KEYS.CACHED_SERVER_EMBEDDING,
        KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT,
      ]);
      console.log('🗑️ Face data cleared (including persistent server embedding cache)');
      return true;
    } catch (error) {
      console.error('❌ Error clearing face data:', error);
      return false;
    }
  }

  /**
   * Get face data info (for debugging)
   * @returns {Promise<object>} Face data information
   */
  static async getFaceDataInfo() {
    try {
      const embedding = await this.getFaceEmbedding();
      const enrollmentNo = await this.getEnrollmentNumber();
      const enrolledAt = await this.getFaceEnrolledAt();

      return {
        hasFaceData: !!(embedding && enrollmentNo),
        embeddingSize: embedding ? embedding.length : 0,
        enrollmentNo: enrollmentNo || 'Not set',
        enrolledAt: enrolledAt || 'Not set',
      };
    } catch (error) {
      console.error('❌ Error getting face data info:', error);
      return {
        hasFaceData: false,
        embeddingSize: 0,
        enrollmentNo: 'Error',
        enrolledAt: 'Error',
      };
    }
  }
  
  /**
   * Save the offline sync queue to storage (Encrypted via Android Keystore)
   * @param {Array<object>} queue - The sync queue to save
   * @returns {Promise<boolean>} Success status
   */
  static async saveSyncQueue(queue) {
    try {
      if (!queue || !Array.isArray(queue)) {
        return false;
      }
      
      const jsonString = JSON.stringify(queue);
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      
      let dataToSave = jsonString;
      
      // Attempt hardware encryption via Android Keystore
      if (TimerModule && TimerModule.encryptString) {
        try {
          const encrypted = await TimerModule.encryptString(jsonString);
          dataToSave = `__ENCRYPTED__:${encrypted}`;
          console.log('🔒 Sync queue encrypted via Android Keystore');
        } catch (encryptError) {
          console.warn('⚠️ Keystore encryption failed, falling back to plaintext:', encryptError.message);
        }
      }

      await AsyncStorage.setItem(KEYS.SYNC_QUEUE, dataToSave);
      return true;
    } catch (error) {
      console.error('❌ Error saving sync queue:', error);
      return false;
    }
  }

  /**
   * Load the offline sync queue from storage (Decrypts via Android Keystore if needed)
   * @returns {Promise<Array<object>>} The loaded sync queue or empty array
   */
  static async loadSyncQueue() {
    try {
      const savedData = await AsyncStorage.getItem(KEYS.SYNC_QUEUE);
      if (!savedData) return [];
      
      let jsonString = savedData;
      
      // Check if data is encrypted
      if (savedData.startsWith('__ENCRYPTED__:')) {
        const encryptedBase64 = savedData.replace('__ENCRYPTED__:', '');
        const { NativeModules } = require('react-native');
        const { TimerModule } = NativeModules;
        
        if (TimerModule && TimerModule.decryptString) {
          try {
            jsonString = await TimerModule.decryptString(encryptedBase64);
            console.log('🔓 Sync queue decrypted via Android Keystore');
          } catch (decryptError) {
            console.error('❌ Keystore decryption failed:', decryptError.message);
            // If decryption fails, we can't read the data. 
            // Return empty to avoid crash, but this is a data loss scenario.
            return [];
          }
        } else {
          console.warn('⚠️ Data is encrypted but TimerModule.decryptString is unavailable');
          return [];
        }
      }
      
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('❌ Error loading sync queue:', error);
      return [];
    }
  }

  /**
   * Save critical timer state with Keystore encryption for redundancy
   * @param {object} state - Minimal state (timerSeconds, periodId, date, isRunning)
   */
  static async saveTimerStateRedundancy(state) {
    try {
      if (!state) return false;
      const json = JSON.stringify(state);
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      
      if (TimerModule && TimerModule.saveRedundancyData) {
        try {
          await TimerModule.saveRedundancyData('timer_state_redundancy', json);
          console.log('🛡️ Timer state redundancy saved to Hardware-backed Secure Storage');
          return true;
        } catch (e) {
          console.warn('⚠️ Native timer redundancy failed:', e.message);
        }
      }
      
      // Fallback to AsyncStorage if native redundancy fails
      await AsyncStorage.setItem(KEYS.TIMER_STATE_REDUNDANCY, json);
      return true;
    } catch (error) {
      console.error('❌ Error saving timer redundancy:', error);
      return false;
    }
  }

  /**
   * Load timer state from Keystore-backed redundancy
   */
  static async loadTimerStateRedundancy() {
    try {
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      
      if (TimerModule && TimerModule.getRedundancyData) {
        try {
          const decrypted = await TimerModule.getRedundancyData('timer_state_redundancy');
          if (decrypted) {
            console.log('🛡️ Timer state recovered from Native Hardware Redundancy');
            return JSON.parse(decrypted);
          }
        } catch (e) {
          console.error('❌ Native timer redundancy recovery failed:', e.message);
        }
      }
      
      // Fallback to AsyncStorage
      const savedData = await AsyncStorage.getItem(KEYS.TIMER_STATE_REDUNDANCY);
      if (!savedData) return null;
      
      return JSON.parse(savedData);
    } catch (error) {
      console.error('❌ Error loading timer redundancy:', error);
      return null;
    }
  }

  /**
   * Clear timer state redundancy (e.g. on new day or logout)
   */
  static async clearTimerStateRedundancy() {
    try {
      await AsyncStorage.removeItem(KEYS.TIMER_STATE_REDUNDANCY);
      const { NativeModules } = require('react-native');
      const { TimerModule } = NativeModules;
      if (TimerModule && TimerModule.clearRedundancyData) {
        await TimerModule.clearRedundancyData('timer_state_redundancy');
      }
      console.log('🗑️ Timer redundancy cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing timer redundancy:', error);
      return false;
    }
  }
}

export default SecureStorage;
