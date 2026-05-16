/**
 * ServerTime - Secure time synchronization with server
 * Prevents time spoofing by using server time instead of device time.
 *
 * Anti-spoof strategy:
 *   1. On sync: record lastServerTime (from server) + lastSyncBootMs (SystemClock.elapsedRealtime via TimerModule)
 *   2. On now(): elapsed = currentBootMs - lastSyncBootMs  (boot-relative, cannot be spoofed)
 *               serverNow = lastServerTime + elapsed
 *   3. Falls back to Date.now() + offset only if native module unavailable
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

import { GET_TIME } from './constants/apiEndpoints';
const { TimerModule } = NativeModules;

const SERVER_TIME_OFFSET_KEY   = '@server_time_offset';
const LAST_SYNC_TIME_KEY       = '@last_sync_time';
const LAST_SERVER_TIME_KEY     = '@last_server_time';
const LAST_SYNC_DEVICE_KEY     = '@last_sync_device_time';
const LAST_SYNC_BOOT_MS_KEY    = '@last_sync_boot_ms';

class ServerTime {
  constructor(socketUrl) {
    this.socketUrl = socketUrl;
    this.serverTimeOffset = 0;
    this.lastSyncTime = 0;
    this.lastServerTime = 0;
    this.lastSyncDeviceTime = 0;
    this.lastSyncBootMs = 0;   // boot-relative ms at last sync — spoof-proof anchor
    this._cachedBootElapsedMs = 0; // updated every second via updateBootCache()
    this._cacheUpdatedAt = 0;      // wall-clock ms when cache was last refreshed
    this._nowCache = 0;            // cached result of now() — refreshed every 500ms
    this._nowCacheAt = 0;          // wall-clock ms when _nowCache was set
    this.syncInterval = null;
    this.bootCacheInterval = null;
    this.isSynced = false;
    this.deviceTimeManipulated = false;
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

    // Update boot-elapsed cache every second so now() stays accurate
    this.updateBootCache();
    this.bootCacheInterval = setInterval(() => {
      this.updateBootCache();
    }, 1000);
  }

  /**
   * Load previous offset from storage
   * This ensures time continuity across app restarts
   */
  async loadOffsetFromStorage() {
    try {
      const savedOffset      = await AsyncStorage.getItem(SERVER_TIME_OFFSET_KEY);
      const savedSyncTime    = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
      const savedServerTime  = await AsyncStorage.getItem(LAST_SERVER_TIME_KEY);
      const savedSyncDevice  = await AsyncStorage.getItem(LAST_SYNC_DEVICE_KEY);
      const savedSyncBootMs  = await AsyncStorage.getItem(LAST_SYNC_BOOT_MS_KEY);

      if (savedOffset !== null) {
        this.serverTimeOffset   = parseInt(savedOffset, 10);
        this.lastSyncTime       = savedSyncTime   ? parseInt(savedSyncTime, 10)   : 0;
        this.lastServerTime     = savedServerTime ? parseInt(savedServerTime, 10) : 0;
        this.lastSyncDeviceTime = savedSyncDevice ? parseInt(savedSyncDevice, 10) : 0;
        this.lastSyncBootMs     = savedSyncBootMs ? parseInt(savedSyncBootMs, 10) : 0;

        const hoursSinceSync = Math.floor((Date.now() - this.lastSyncTime) / 3600000);
        console.log('📦 Loaded previous time offset from storage');
        console.log(`   Offset: ${this.serverTimeOffset}ms, Last sync: ${hoursSinceSync}h ago`);
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
      await AsyncStorage.setItem(SERVER_TIME_OFFSET_KEY,  this.serverTimeOffset.toString());
      await AsyncStorage.setItem(LAST_SYNC_TIME_KEY,      this.lastSyncTime.toString());
      await AsyncStorage.setItem(LAST_SERVER_TIME_KEY,    this.lastServerTime.toString());
      await AsyncStorage.setItem(LAST_SYNC_DEVICE_KEY,    this.lastSyncDeviceTime.toString());
      await AsyncStorage.setItem(LAST_SYNC_BOOT_MS_KEY,   this.lastSyncBootMs.toString());
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
        samples.sort((a, b) => a.offset - b.offset);
        const medianOffset = samples[Math.floor(samples.length / 2)].offset;
        const previousOffset = this.serverTimeOffset;

        this.deviceTimeManipulated = false;
        this.serverTimeOffset = medianOffset;

        const currentDeviceTime = Date.now();
        this.lastServerTime     = currentDeviceTime + medianOffset; // actual server time
        this.lastSyncDeviceTime = currentDeviceTime;
        this.lastSyncTime       = currentDeviceTime;

        // ── Boot-relative anchor (spoof-proof) ────────────────────────────────
        // Ask native layer for current boot-elapsed ms.
        // If unavailable (e.g. iOS / web), fall back to device time (less secure).
        try {
          if (TimerModule && TimerModule.getBootElapsedMs) {
            const { bootElapsedMs } = await TimerModule.getBootElapsedMs();
            this.lastSyncBootMs = bootElapsedMs;
            console.log(`   Boot-elapsed at sync: ${bootElapsedMs}ms`);
          } else {
            this.lastSyncBootMs = 0; // fallback — will use device time in now()
          }
        } catch (_) {
          this.lastSyncBootMs = 0;
        }

        this.isSynced = true;
        await this.saveOffsetToStorage();

        console.log('✅ Time synced with server (boot-anchored)');
        console.log(`   Server time: ${new Date(this.lastServerTime).toISOString()}`);
        console.log(`   Offset: ${medianOffset}ms, Drift from prev: ${Math.abs(medianOffset - previousOffset)}ms`);
        return true;
      } else {
        console.warn('⚠️ Time sync failed, keeping previous offset');
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

      const response = await fetch(GET_TIME, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const t3 = Date.now(); // Device time after response
      const data = await response.json();

      if (data.success && data.serverTime) {
        const t1 = data.serverTime; // Server time when request received
        // Calculate round-trip time
        const roundTripTime = t3 - t0;

        // Estimate one-way latency (half of round-trip)
        const latency = roundTripTime / 2;

        // Calculate offset: server time - device time
        const offset = t1 - t0 - latency;

        // Reject samples with unreasonable offsets (>1 hour = likely network error)
        if (Math.abs(offset) > 3600000) {
          console.error('⚠️ Unreasonable offset calculated — rejecting sample:');
          console.error(`   t0=${t0}, t1=${t1}, t3=${t3}, rtt=${roundTripTime}ms, offset=${offset}ms`);
          return null;
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
   * Get current server time (in milliseconds).
   *
   * Priority:
   *   1. Boot-elapsed (spoof-proof): lastServerTime + (currentBootMs - lastSyncBootMs)
   *   2. Device-time fallback:       lastServerTime + (Date.now() - lastSyncDeviceTime)
   *   3. No sync yet:                Date.now() + serverTimeOffset
   */
  now() {
    // ── 500ms result cache — avoids recomputing on every timer tick ──────────
    const wallNow = Date.now();
    if (this._nowCache && (wallNow - this._nowCacheAt) < 500) {
      return this._nowCache;
    }

    let result;
    if (!this.lastServerTime) {
      if (this._cachedBootElapsedMs > 0) {
        result = this._cachedBootElapsedMs + this.serverTimeOffset;
      } else {
        result = wallNow + this.serverTimeOffset;
      }
    } else if (this.lastSyncBootMs > 0 && TimerModule && TimerModule.getBootElapsedMs) {
      try {
        if (this._cachedBootElapsedMs > 0 && (wallNow - this._cacheUpdatedAt) < 3000) {
          const elapsedSinceSync = this._cachedBootElapsedMs - this.lastSyncBootMs;
          result = this.lastServerTime + elapsedSinceSync;
        }
      } catch (_) {}
    }

    if (result === undefined) {
      const elapsedSinceSync = wallNow - this.lastSyncDeviceTime;
      result = this.lastServerTime + elapsedSinceSync;
    }

    this._nowCache = result;
    this._nowCacheAt = wallNow;
    return result;
  }

  /**
   * Update the cached boot-elapsed ms from native.
   * Call this periodically (e.g. every second) so now() stays accurate
   * without making async calls.
   */
  async updateBootCache() {
    try {
      if (TimerModule && TimerModule.getBootElapsedMs) {
        const { bootElapsedMs } = await TimerModule.getBootElapsedMs();
        this._cachedBootElapsedMs = bootElapsedMs;
        this._cacheUpdatedAt = Date.now();
      }
    } catch (_) {}
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
   * Get an IST shifted Date object. 
   * IMPORTANT: You MUST use getUTC* methods on this object, because it's shifted!
   */
  getISTDate() {
    return new Date(this.now() + 5.5 * 60 * 60 * 1000);
  }

  /**
   * Format server time (in IST)
   */
  format(format = 'HH:mm:ss') {
    const ist = this.getISTDate();
    const hours = String(ist.getUTCHours()).padStart(2, '0');
    const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
    const seconds = String(ist.getUTCSeconds()).padStart(2, '0');
    const day = String(ist.getUTCDate()).padStart(2, '0');
    const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const year = ist.getUTCFullYear();

    return format
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
      .replace('DD', day)
      .replace('MM', month)
      .replace('YYYY', year);
  }

  /**
   * Get current day of week (server time, IST)
   */
  getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.getISTDate().getUTCDay()];
  }

  /**
   * Get current time in minutes since midnight (server time, IST)
   */
  getCurrentTimeInMinutes() {
    const ist = this.getISTDate();
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
  }

  /**
   * Check if current time is within a time range
   */
  isWithinTimeRange(startTime, endTime) {
    const currentMinutes = this.getCurrentTimeInMinutes();

    if (typeof startTime !== 'string' || typeof endTime !== 'string') return false;
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
    if (this.bootCacheInterval) {
      clearInterval(this.bootCacheInterval);
      this.bootCacheInterval = null;
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
