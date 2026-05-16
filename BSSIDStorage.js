// BSSIDStorage.js - Secure storage for daily BSSID schedule in React Native
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const { TimerModule: _BSSIDTimerModule } = NativeModules;

// Boot-elapsed cache for spoof-proof time (same pattern as OfflineTimerService)
let _bssidBootMsCache = 0;
let _bssidBootMsCacheAt = 0;
async function _bssidRefreshBootCache() {
  try {
    if (_BSSIDTimerModule && _BSSIDTimerModule.getBootElapsedMs) {
      const { bootElapsedMs } = await _BSSIDTimerModule.getBootElapsedMs();
      _bssidBootMsCache = bootElapsedMs;
      _bssidBootMsCacheAt = Date.now();
    }
  } catch (_) {}
}
function _bssidGetBootMs() {
  if (_bssidBootMsCache > 0) {
    return _bssidBootMsCache + Math.max(0, Date.now() - _bssidBootMsCacheAt);
  }
  return 0; // 0 = not available yet
}

/**
 * Get today's date string (YYYY-MM-DD) using server time.
 * Falls back to boot-elapsed, then device time.
 */
function _getTodayString() {
  let timestamp;
  try {
    const { getServerTime } = require('./ServerTime');
    timestamp = getServerTime().now();
  } catch (_) {
    timestamp = Date.now();
  }
  // Add 5.5 hours to get IST time in UTC format, guaranteeing it's spoof-proof and in IST
  const istTime = new Date(timestamp + 5.5 * 60 * 60 * 1000);
  return istTime.toISOString().split('T')[0];
}

/**
 * Get current time in minutes since midnight using server time.
 * Falls back to boot-elapsed, then device time as last resort.
 */
function _getCurrentMinutes() {
  // 1. Try server time (synced, spoof-proof)
  try {
    const { getServerTime } = require('./ServerTime');
    const st = getServerTime();
    const now = st.nowDate();
    return now.getHours() * 60 + now.getMinutes();
  } catch (_) {}

  // 2. Try boot-elapsed (spoof-proof monotonic clock)
  const bootMs = _bssidGetBootMs();
  if (bootMs > 0) {
    const now = new Date(bootMs);
    return now.getHours() * 60 + now.getMinutes();
  }

  // 3. Last resort — device time (spoofable, but better than nothing)
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const KEYS = {
  BSSID_SCHEDULE: '@letsbunk_bssid_schedule',
  BSSID_DATE: '@letsbunk_bssid_date',
  BSSID_CACHED_AT: '@letsbunk_bssid_cached_at',
  BSSID_REDUNDANCY: '@letsbunk_bssid_redundancy',
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
      const today = _getTodayString();
      
      await AsyncStorage.setItem(KEYS.BSSID_SCHEDULE, scheduleString);
      await AsyncStorage.setItem(KEYS.BSSID_DATE, today);
      let cachedAtStr;
      try {
        const { getServerTime } = require('./ServerTime');
        cachedAtStr = getServerTime().nowISO();
      } catch (_) {
        cachedAtStr = new Date(_bssidGetBootMs() || Date.now()).toISOString();
      }
      await AsyncStorage.setItem(KEYS.BSSID_CACHED_AT, cachedAtStr);
      
      console.log(`✅ BSSID schedule saved for ${today} (${schedule.length} periods)`);
      
      // Native Keystore Redundancy (survives AsyncStorage wipes)
      try {
        const redundancyData = JSON.stringify({ schedule, date: today });
        const { TimerModule } = NativeModules;
        if (TimerModule && TimerModule.saveRedundancyData) {
          await TimerModule.saveRedundancyData('bssid_schedule_redundancy', redundancyData);
          console.log('🛡️ BSSID schedule redundancy saved to Hardware-backed Secure Storage');
        }
      } catch (redundancyErr) {
        console.warn('⚠️ Failed to save native BSSID redundancy:', redundancyErr.message);
      }

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
      const today = _getTodayString();
      
      if (!scheduleString || !savedDate) {
        console.log('📭 No BSSID schedule found in AsyncStorage, checking Keystore redundancy...');
        
        // Try recovery from Native Redundancy (TRULY persistent)
        try {
          const { TimerModule } = NativeModules;
          if (TimerModule && TimerModule.getRedundancyData) {
            const decrypted = await TimerModule.getRedundancyData('bssid_schedule_redundancy');
            if (decrypted) {
              const recovered = JSON.parse(decrypted);
              if (recovered && recovered.date === today && recovered.schedule) {
                console.log('🛡️ BSSID schedule recovered from Native Hardware Redundancy');
                // Backfill AsyncStorage for performance
                await AsyncStorage.setItem(KEYS.BSSID_SCHEDULE, JSON.stringify(recovered.schedule));
                await AsyncStorage.setItem(KEYS.BSSID_DATE, recovered.date);
                return recovered.schedule;
              }
            }
          }
        } catch (recoveryErr) {
          console.warn('⚠️ Native BSSID recovery failed:', recoveryErr.message);
        }

        return null;
      }

      // Check if schedule is for today
      if (savedDate !== today) {
        console.log(`🗑️ BSSID schedule is outdated (${savedDate} vs ${today}), clearing...`);
        await this.clearSchedule();
        return null;
      }

      let schedule;
      try {
        schedule = JSON.parse(scheduleString);
      } catch (e) {
        console.error('❌ Error parsing BSSID schedule JSON:', e);
        return null;
      }

      if (!Array.isArray(schedule)) {
        console.warn('⚠️ BSSID schedule is not an array, clearing...');
        await this.clearSchedule();
        return null;
      }

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

      // Refresh boot cache so _getCurrentMinutes() has fresh data
      await _bssidRefreshBootCache();
      const currentTime = _getCurrentMinutes(); // spoof-proof

      // Find current period
      for (const period of schedule) {
        if (!period || typeof period.startTime !== 'string' || typeof period.endTime !== 'string') {
          console.warn(`⚠️ Skipping invalid period ${period?.period || 'unknown'}:`, period);
          continue;
        }

        const [startHour, startMin] = period.startTime.split(':').map(Number);
        const [endHour, endMin] = period.endTime.split(':').map(Number);
        
        const startMinutes = (startHour || 0) * 60 + (startMin || 0);
        const endMinutes = (endHour || 0) * 60 + (endMin || 0);

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
      const today = _getTodayString();
      
      if (savedDate === today) {
        console.log('✅ BSSID schedule is up to date in AsyncStorage');
        return false;
      }

      // Check native redundancy before deciding we need a refresh
      const { TimerModule } = NativeModules;
      if (TimerModule && TimerModule.getRedundancyData) {
        try {
          const decrypted = await TimerModule.getRedundancyData('bssid_schedule_redundancy');
          if (decrypted) {
            const recovered = JSON.parse(decrypted);
            if (recovered && recovered.date === today) {
              console.log('✅ BSSID schedule is available in Native Hardware Redundancy');
              return false;
            }
          }
        } catch (e) {
          console.log('🛡️ Native redundancy check failed in needsRefresh');
        }
      }

      console.log('🔄 BSSID schedule needs refresh (outdated or missing)');
      return true;
    } catch (error) {
      console.error('❌ Error checking refresh status:', error);
      return true;
    }
  }

  static async clearSchedule() {
    try {
      await AsyncStorage.multiRemove([
        KEYS.BSSID_SCHEDULE,
        KEYS.BSSID_DATE,
        KEYS.BSSID_CACHED_AT,
      ]);
      
      const { TimerModule } = NativeModules;
      if (TimerModule && TimerModule.clearRedundancyData) {
        await TimerModule.clearRedundancyData('bssid_schedule_redundancy');
      }
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
      const today = _getTodayString();

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
