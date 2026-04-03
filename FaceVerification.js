// FaceVerification.js - React Native bridge for face verification
import { NativeModules, Platform } from 'react-native';

const { FaceVerificationModule } = NativeModules;

class FaceVerification {
  /**
   * Start face verification with stored embedding
   * @param {Array<number>} storedEmbedding - Face embedding array (192 floats)
   * @returns {Promise<Object>} Verification result
   */
  static async verifyFace(storedEmbedding) {
    if (Platform.OS !== 'android') {
      throw new Error('Face verification is only supported on Android');
    }

    if (!FaceVerificationModule) {
      throw new Error('FaceVerificationModule is not available. Make sure the native module is properly linked.');
    }

    if (!storedEmbedding || !Array.isArray(storedEmbedding)) {
      throw new Error('Invalid stored embedding. Must be an array of numbers.');
    }

    if (storedEmbedding.length !== 192) {
      throw new Error(`Invalid embedding size. Expected 192, got ${storedEmbedding.length}`);
    }

    try {
      console.log('🔐 Starting face verification...');
      const result = await FaceVerificationModule.startFaceVerification(storedEmbedding);
      
      console.log('✅ Face verification result:', {
        success: result.success,
        isMatch: result.isMatch,
        similarity: `${result.similarityPercentage}%`,
        message: result.message
      });

      return result;
    } catch (error) {
      console.error('❌ Face verification error:', error);
      throw error;
    }
  }

  /**
   * Check if face data is available
   * @returns {Promise<boolean>}
   */
  static async checkFaceDataAvailable() {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!FaceVerificationModule) {
      return false;
    }

    try {
      return await FaceVerificationModule.checkFaceDataAvailable();
    } catch (error) {
      console.error('Error checking face data availability:', error);
      return false;
    }
  }
}

export default FaceVerification;
