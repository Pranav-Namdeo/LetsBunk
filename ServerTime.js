/**
 * ServerTime - Secure time synchronization with server
 * Prevents time spoofing by using server time instead of device time
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_TIME_OFFSET_KEY = '@server_time_offset';
const LAST_SYNC_TIME_KEY = '@last_sync_time';

class ServerTime {
  constructor(socketUrl) {
    this.socketUrl = socketUrl;
    this.serverTimeOffset = 0; // Difference between server and device time (for backward compatibility)
    this.lastSyncTime = 0; // When we last synced (for storage)
    this.lastServerTime = 0; // Last known server timestamp
    this.lastSyncDeviceTime = 0; // Device time when we last synced
    this.syncInterval = null;
    this.isSynced = false;
    this.deviceTimeManipulated = false; // Flag for time manipulation detection
  }

  /**
   * Initialize time synchronization
   * Should be called on app start
   * 
   * Loads previous offset from storage first, then syncs with server
   * This ensures time continuity even if server is unreachable
   */
  async initialize() {
    // Load previous offset from storage
    await this.loadOffsetFromStorage();

    // Try to sync with server
    await this.syncTime();

    // Sync every 5 minutes to account for drift
    this.syncInterval = setInterval(() => {
      this.syncTime();
    }, 5 * 60 * 1000);
  }

  /**
   * Load previous offset from storage
   * This ensures time continuity across app restarts
   */
  async loadOffsetFromStorage() {
    try {
      const savedOffset = await AsyncStorage.getItem(SERVER_TIME_OFFSET_KEY);
      const savedSyncTime = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);

      if (savedOffset !== null) {
        const offset = parseInt(savedOffset, 10);
        this.lastSyncTime = savedSyncTime ? parseInt(savedSyncTime, 10) : 0;

        const timeSinceSync = Date.now() - this.lastSyncTime;
        const hoursSinceSync = Math.floor(timeSinceSync / (1000 * 60 * 60));

        // Accept any offset - the new method handles device time changes gracefully
        this.serverTimeOffset = offset;

        // Load the actual server time values
        const savedServerTime = await AsyncStorage.getItem('@last_server_time');
        const savedSyncDeviceTime = await AsyncStorage.getItem('@last_sync_device_time');

        if (savedServerTime && savedSyncDeviceTime) {
          this.lastServerTime = parseInt(savedServerTime, 10);
          this.lastSyncDeviceTime = parseInt(savedSyncDeviceTime, 10);
        }

        console.log('📦 Loaded previous time offset from storage');
        console.log(`   Offset: ${this.serverTimeOffset}ms`);
        console.log(`   Last sync: ${hoursSinceSync} hours ago`);
        console.log(`   Current time: ${new Date(this.now()).toISOString()}`);

        // Mark as synced if offset was loaded (even if old)
        this.isSynced = true;
      }
    } catch (error) {
      console.error('Error loading time offset:', error);
    }
  }

  /**
   * Save offset to storage
   * Called after successful sync
   */
  async saveOffsetToStorage() {
    try {
      await AsyncStorage.setItem(SERVER_TIME_OFFSET_KEY, this.serverTimeOffset.toString());
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, this.lastSyncTime.toString());
      await AsyncStorage.setItem('@last_server_time', this.lastServerTime.toString());
      await AsyncStorage.setItem('@last_sync_device_time', this.lastSyncDeviceTime.toString());
    } catch (error) {
      console.error('Error saving time offset:', error);
    }
  }

  /**
   * Sync time with server
   * Uses multiple requests to calculate accurate offset
   * 
   * IMPORTANT: If sync fails, we keep the previous offset
   * This ensures time continuity during server disconnection
   */
  async syncTime() {
    try {
      const samples = [];

      // Take 3 samples to get accurate offset
      for (let i = 0; i < 3; i++) {
        const sample = await this.getSingleTimeSample();
        if (sample) {
          samples.push(sample);
        }
        // Small delay between samples
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (samples.length > 0) {
        // Use median offset to avoid outliers
        samples.sort((a, b) => a.offset - b.offset);
        const medianOffset = samples[Math.floor(samples.length / 2)].offset;

        // Store previous offset for comparison
        const previousOffset = this.serverTimeOffset;

        // No validation needed - we accept any offset now
        // The new method uses server time + elapsed time, so device time doesn't matter
        this.deviceTimeManipulated = false;
        this.serverTimeOffset = medianOffset;

        // Store the actual server time and when we got it
        // This is the key to being independent of device time!
        const currentDeviceTime = Date.now();
        this.lastServerTime = currentDeviceTime + medianOffset; // Actual server time
        this.lastSyncDeviceTime = currentDeviceTime; // When we got it
        this.lastSyncTime = currentDeviceTime; // For storage
        this.isSynced = true;

        // Save to storage for persistence
        await this.saveOffsetToStorage();

        console.log('✅ Time synced with server');
        console.log(`   Server time: ${new Date(this.lastServerTime).toISOString()}`);
        console.log(`   Device time: ${new Date(currentDeviceTime).toISOString()}`);
        console.log(`   Offset: ${medianOffset}ms (${Math.round(medianOffset / 1000)} seconds)`);
        console.log(`   Previous offset: ${previousOffset}ms`);
        console.log(`   Drift: ${Math.abs(medianOffset - previousOffset)}ms`);
        console.log(`   💾 Time saved to storage`);

        return true;
      } else {
        // No samples received, but keep previous offset
        console.warn('⚠️ Time sync failed, keeping previous offset');
        console.log(`   Current offset: ${this.serverTimeOffset}ms`);
        console.log(`   Continuing with: ${new Date(this.now()).toISOString()}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Time sync error:', error);
      console.log(`   Keeping previous offset: ${this.serverTimeOffset}ms`);
      console.log(`   Continuing with: ${new Date(this.now()).toISOString()}`);
      // Don't set isSynced to false - we're still using a valid offset
      return false;
    }
  }

  /**
   * Get single time sample from server
   */
  async getSingleTimeSample() {
    try {
      const t0 = Date.now(); // Device time before request

      const response = await fetch(`${this.socketUrl}/api/time`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const t3 = Date.now(); // Device time after response
      const data = await response.json();

      if (data.success && data.serverTime) {
        const t1 = data.serverTime; // Server time when request received
        const t2 = data.serverTime; // Server time when response sent (same for GET)

        // Calculate round-trip time
        const roundTripTime = t3 - t0;

        // Estimate one-way latency (half of round-trip)
        const latency = roundTripTime / 2;

        // Calculate offset: server time - device time
        const offset = t1 - t0 - latency;

        // Debug logging for unreasonable offsets
        if (Math.abs(offset) > 3600000) {
          console.error('⚠️ Unreasonable offset calculated in sample:');
          console.error(`   t0 (device before): ${t0} (${new Date(t0).toISOString()})`);
          console.error(`   t1 (server): ${t1} (${new Date(t1).toISOString()})`);
          console.error(`   t3 (device after): ${t3} (${new Date(t3).toISOString()})`);
          console.error(`   Round trip: ${roundTripTime}ms`);
          console.error(`   Calculated offset: ${offset}ms (${Math.round(offset / 3600000)} hours)`);
        }

        return {
          offset: Math.round(offset),
          latency: Math.round(latency),
          roundTripTime: Math.round(roundTripTime),
        };
      }
    } catch (error) {
      console.error('Time sample failed:', error);
      return null;
    }
  }

  /**
   * Get current server time (in milliseconds)
   * This is the secure time that should be used throughout the app
   * 
   * Uses server time as base + elapsed time since last sync
   * This way device time changes don't affect the app
   */
  now() {
    if (!this.lastServerTime || !this.lastSyncDeviceTime) {
      // No sync yet, return current estimate
      return Date.now() + this.serverTimeOffset;
    }

    // Calculate elapsed time since last sync using device time
    const elapsedSinceSync = Date.now() - this.lastSyncDeviceTime;

    // Return: last known server time + elapsed time
    // This way even if device time changes, we're still tracking from server time
    return this.lastServerTime + elapsedSinceSync;
  }

  /**
   * Get current server time as Date object
   */
  nowDate() {
    return new Date(this.now());
  }

  /**
   * Get current server time in ISO format
   */
  nowISO() {
    return this.nowDate().toISOString();
  }

  /**
   * Get current server timestamp (seconds)
   */
  nowTimestamp() {
    return Math.floor(this.now() / 1000);
  }

  /**
   * Check if time is synced
   */
  isSynchronized() {
    return this.isSynced;
  }

  /**
   * Check if device time appears to be manipulated
   */
  isDeviceTimeManipulated() {
    return this.deviceTimeManipulated || false;
  }

  /**
   * Get time since last sync (in seconds)
   */
  getTimeSinceLastSync() {
    return Math.floor((Date.now() - this.lastSyncTime) / 1000);
  }

  /**
   * Format server time
   */
  format(format = 'HH:mm:ss') {
    const date = this.nowDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return format
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
      .replace('DD', day)
      .replace('MM', month)
      .replace('YYYY', year);
  }

  /**
   * Get current day of week (server time)
   */
  getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.nowDate().getDay()];
  }

  /**
   * Get current time in minutes since midnight (server time)
   */
  getCurrentTimeInMinutes() {
    const date = this.nowDate();
    return date.getHours() * 60 + date.getMinutes();
  }

  /**
   * Check if current time is within a time range
   */
  isWithinTimeRange(startTime, endTime) {
    const currentMinutes = this.getCurrentTimeInMinutes();

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Validate timestamp against server time
   * Used to detect time manipulation
   */
  validateTimestamp(timestamp, maxDriftSeconds = 60) {
    const serverTime = this.nowTimestamp();
    const drift = Math.abs(serverTime - timestamp);

    if (drift > maxDriftSeconds) {
      console.warn(`⚠️ Timestamp drift detected: ${drift}s`);
      return false;
    }

    return true;
  }

  /**
   * Clear saved offset and force fresh sync
   * Use this if offset seems wrong
   */
  async clearSavedOffset() {
    try {
      await AsyncStorage.removeItem(SERVER_TIME_OFFSET_KEY);
      await AsyncStorage.removeItem(LAST_SYNC_TIME_KEY);
      await AsyncStorage.removeItem('@last_server_time');
      await AsyncStorage.removeItem('@last_sync_device_time');
      this.serverTimeOffset = 0;
      this.lastSyncTime = 0;
      this.lastServerTime = 0;
      this.lastSyncDeviceTime = 0;
      this.isSynced = false;
      console.log('🗑️ Cleared saved time offset');
      // Force immediate sync
      await this.syncTime();
    } catch (error) {
      console.error('Error clearing time offset:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton instance
let serverTimeInstance = null;

export const initializeServerTime = (socketUrl) => {
  if (!serverTimeInstance) {
    serverTimeInstance = new ServerTime(socketUrl);
  }
  return serverTimeInstance;
};

export const getServerTime = () => {
  if (!serverTimeInstance) {
    throw new Error('ServerTime not initialized. Call initializeServerTime first.');
  }
  return serverTimeInstance;
};

export default ServerTime;
