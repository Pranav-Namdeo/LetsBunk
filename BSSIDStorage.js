// BSSIDStorage.js - Secure storage for daily BSSID schedule in React Native
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  BSSID_SCHEDULE: '@letsbunk_bssid_schedule',
  BSSID_DATE: '@letsbunk_bssid_date',
  BSSID_CACHED_AT: '@letsbunk_bssid_cached_at',
};

class BSSIDStorage {
  /**
   * Save daily BSSID schedule to secure storage
   * @param {Array<Object>} schedule - Array of {period, subject, room, bssid, startTime, endTime}
   * @returns {Promise<boolean>} Success status
   */
  static async saveDailySchedule(schedule) {
    try {
      if (!schedule || !Array.isArray(schedule)) {
        console.warn('⚠️ Invalid BSSID schedule provided');
        return false;
      }

      // Convert schedule to JSON string for storage
      const scheduleString = JSON.stringify(schedule);
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      await AsyncStorage.setItem(KEYS.BSSID_SCHEDULE, scheduleString);
      await AsyncStorage.setItem(KEYS.BSSID_DATE, today);
      await AsyncStorage.setItem(KEYS.BSSID_CACHED_AT, new Date().toISOString());
      
      console.log(`✅ BSSID schedule saved for ${today} (${schedule.length} periods)`);
      return true;
    } catch (error) {
      console.error('❌ Error saving BSSID schedule:', error);
      return false;
    }
  }

  /**
   * Get daily BSSID schedule from secure storage
   * @returns {Promise<Array<Object>|null>} Schedule array or null
   */
  static async getDailySchedule() {
    try {
      const scheduleString = await AsyncStorage.getItem(KEYS.BSSID_SCHEDULE);
      const savedDate = await AsyncStorage.getItem(KEYS.BSSID_DATE);
      const today = new Date().toISOString().split('T')[0];
      
      if (!scheduleString || !savedDate) {
        console.log('📭 No BSSID schedule found in storage');
        return null;
      }

      // Check if schedule is for today
      if (savedDate !== today) {
        console.log(`🗑️ BSSID schedule is outdated (${savedDate} vs ${today}), clearing...`);
        await this.clearSchedule();
        return null;
      }

      const schedule = JSON.parse(scheduleString);
      console.log(`📥 BSSID schedule retrieved (${schedule.length} periods for ${savedDate})`);
      return schedule;
    } catch (error) {
      console.error('❌ Error retrieving BSSID schedule:', error);
      return null;
    }
  }

  /**
   * Get BSSID for current time period
   * @returns {Promise<Object|null>} Current period info {period, subject, room, bssid} or null
   */
  static async getCurrentPeriodBSSID() {
    try {
      const schedule = await this.getDailySchedule();
      
      if (!schedule || schedule.length === 0) {
        return null;
      }

      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

      // Find current period
      for (const period of schedule) {
        const [startHour, startMin] = period.startTime.split(':').map(Number);
        const [endHour, endMin] = period.endTime.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (currentTime >= startMinutes && currentTime < endMinutes) {
          // Format BSSID for logging
          let bssidLog = 'Not configured';
          if (Array.isArray(period.bssid) && period.bssid.length > 0) {
            bssidLog = period.bssid.join(', ');
          } else if (period.bssid && typeof period.bssid === 'string') {
            bssidLog = period.bssid;
          }
          
          console.log(`📍 Current period: ${period.subject} in ${period.room} (BSSID: ${bssidLog})`);
          return period;
        }
      }

      console.log('⏰ No active period at current time');
      return null;
    } catch (error) {
      console.error('❌ Error getting current period BSSID:', error);
      return null;
    }
  }

  /**
   * Validate BSSID against current period
   * Supports both single BSSID and multiple BSSIDs per classroom
   * @param {string} currentBSSID - BSSID detected from device
   * @returns {Promise<Object>} Validation result {valid, expected, current, period}
   */
  static async validateCurrentBSSID(currentBSSID) {
    try {
      const currentPeriod = await this.getCurrentPeriodBSSID();

      if (!currentPeriod) {
        return {
          valid: false,
          reason: 'no_active_period',
          message: 'No active class period at this time',
          expected: null,
          current: currentBSSID,
          period: null,
        };
      }

      // Support both single BSSID (string) and multiple BSSIDs (array)
      // Check both 'bssids' and 'bssid' fields for compatibility
      let authorizedBSSIDs = [];
      
      // First check 'bssids' field (new format)
      if (currentPeriod.bssids && Array.isArray(currentPeriod.bssids) && currentPeriod.bssids.length > 0) {
        authorizedBSSIDs = currentPeriod.bssids.filter(b => b && b.trim() !== '');
      }
      // Then check 'bssid' field
      else if (Array.isArray(currentPeriod.bssid)) {
        // Multiple BSSIDs in 'bssid' field
        authorizedBSSIDs = currentPeriod.bssid.filter(b => b && b.trim() !== '');
      } else if (currentPeriod.bssid && typeof currentPeriod.bssid === 'string') {
        // Single BSSID string
        authorizedBSSIDs = [currentPeriod.bssid];
      }

      if (authorizedBSSIDs.length === 0) {
        return {
          valid: false,
          reason: 'bssid_not_configured',
          message: `BSSID not configured for ${currentPeriod.room}`,
          expected: null,
          current: currentBSSID,
          period: currentPeriod,
        };
      }

      // Normalize and check if current BSSID matches ANY of the authorized BSSIDs
      const normalizedCurrent = currentBSSID?.toLowerCase()?.trim();
      const isValid = authorizedBSSIDs.some(
        bssid => bssid.toLowerCase().trim() === normalizedCurrent
      );

      console.log(`🔍 BSSID Validation: Current="${normalizedCurrent}", Authorized=[${authorizedBSSIDs.join(', ')}], Valid=${isValid}`);

      return {
        valid: isValid,
        reason: isValid ? 'authorized' : 'wrong_bssid',
        message: isValid 
          ? `Authorized for ${currentPeriod.subject} in ${currentPeriod.room}`
          : `Wrong WiFi - Expected ${currentPeriod.room} WiFi`,
        expected: authorizedBSSIDs.length === 1 ? authorizedBSSIDs[0] : authorizedBSSIDs,
        current: currentBSSID,
        period: currentPeriod,
      };
    } catch (error) {
      console.error('❌ Error validating BSSID:', error);
      return {
        valid: false,
        reason: 'validation_error',
        message: 'Error validating WiFi',
        expected: null,
        current: currentBSSID,
        period: null,
      };
    }
  }

  /**
   * Check if schedule needs refresh (outdated or missing)
   * @returns {Promise<boolean>} True if refresh needed
   */
  static async needsRefresh() {
    try {
      const savedDate = await AsyncStorage.getItem(KEYS.BSSID_DATE);
      const today = new Date().toISOString().split('T')[0];
      
      if (!savedDate) {
        console.log('🔄 BSSID schedule needs refresh: No data');
        return true;
      }

      if (savedDate !== today) {
        console.log(`🔄 BSSID schedule needs refresh: Date mismatch (${savedDate} vs ${today})`);
        return true;
      }

      console.log('✅ BSSID schedule is up to date');
      return false;
    } catch (error) {
      console.error('❌ Error checking refresh status:', error);
      return true;
    }
  }

  /**
   * Clear BSSID schedule
   * @returns {Promise<boolean>} Success status
   */
  static async clearSchedule() {
    try {
      await AsyncStorage.multiRemove([
        KEYS.BSSID_SCHEDULE,
        KEYS.BSSID_DATE,
        KEYS.BSSID_CACHED_AT,
      ]);
      console.log('🗑️ BSSID schedule cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing BSSID schedule:', error);
      return false;
    }
  }

  /**
   * Get schedule info (for debugging)
   * @returns {Promise<object>} Schedule information
   */
  static async getScheduleInfo() {
    try {
      const schedule = await this.getDailySchedule();
      const savedDate = await AsyncStorage.getItem(KEYS.BSSID_DATE);
      const cachedAt = await AsyncStorage.getItem(KEYS.BSSID_CACHED_AT);
      const today = new Date().toISOString().split('T')[0];

      return {
        hasSchedule: !!schedule,
        periodCount: schedule ? schedule.length : 0,
        savedDate: savedDate || 'Not set',
        isToday: savedDate === today,
        cachedAt: cachedAt || 'Not set',
        needsRefresh: await this.needsRefresh(),
      };
    } catch (error) {
      console.error('❌ Error getting schedule info:', error);
      return {
        hasSchedule: false,
        periodCount: 0,
        savedDate: 'Error',
        isToday: false,
        cachedAt: 'Error',
        needsRefresh: true,
      };
    }
  }

  /**
   * Get full schedule for display
   * @returns {Promise<Array<Object>>} Full schedule with all periods
   */
  static async getFullSchedule() {
    try {
      const schedule = await this.getDailySchedule();
      return schedule || [];
    } catch (error) {
      console.error('❌ Error getting full schedule:', error);
      return [];
    }
  }
}

export default BSSIDStorage;
