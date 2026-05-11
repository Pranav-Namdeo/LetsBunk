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

      // Convert array to comma-separated string for storage
      const embeddingString = embedding.join(',');
      await AsyncStorage.setItem(KEYS.FACE_EMBEDDING, embeddingString);
      
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
      const embeddingString = await AsyncStorage.getItem(KEYS.FACE_EMBEDDING);
      
      if (!embeddingString) {
        return null;
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
      await AsyncStorage.setItem(KEYS.CACHED_SERVER_EMBEDDING, embeddingStr);
      await AsyncStorage.setItem(
        KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT,
        serverEnrolledAt || new Date().toISOString()
      );
      // Also keep FACE_EMBEDDING in sync so registerCheckIn (which reads
      // FACE_EMBEDDING) always has a valid embedding to send to the server.
      await AsyncStorage.setItem(KEYS.FACE_EMBEDDING, embeddingStr);
      console.log(`✅ Server embedding cached persistently (enrolledAt: ${serverEnrolledAt})`);
      return true;
    } catch (error) {
      console.error('❌ Error saving cached server embedding:', error);
      return false;
    }
  }

  /**
   * Load the persistent server-fetched embedding cache.
   * @returns {Promise<{embedding: Array<number>, enrolledAt: string}|null>}
   *   null if no cache exists.
   */
  static async getCachedServerEmbedding() {
    try {
      const embeddingStr = await AsyncStorage.getItem(KEYS.CACHED_SERVER_EMBEDDING);
      const enrolledAt   = await AsyncStorage.getItem(KEYS.CACHED_SERVER_EMBEDDING_ENROLLED_AT);
      if (!embeddingStr) return null;
      const embedding = embeddingStr.split(',').map(parseFloat);
      console.log(`📦 Persistent server embedding loaded (enrolledAt: ${enrolledAt})`);
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
}

export default SecureStorage;
