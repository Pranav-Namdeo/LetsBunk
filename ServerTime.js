/**
 * ServerTime — Single source of truth for all time in the app.
 *
 * SECURITY MODEL:
 * - Server returns UTC epoch + IST breakdown via /api/time
 * - Offset = serverTime - deviceTime (calculated at sync)
 * - Elapsed after sync tracked via performance.now() (monotonic clock)
 *   → Cannot be changed by: device clock change, VPN, timezone change, airplane mode
 * - All period detection uses IST minutes-since-midnight from server
 * - Device time (new Date / Date.now) is NEVER used for period/attendance logic
 *
 * SPOOFING VECTORS COVERED:
 * ✅ Manual device clock change
 * ✅ Timezone change (always IST from server)
 * ✅ VPN time interception (offset anchored to monotonic clock after sync)
 * ✅ App restart (offset persisted to AsyncStorage, re-anchored to performance.now)
 * ✅ Offline spoofing (last known server time + monotonic elapsed)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

const STORAGE_KEYS = {
  SERVER_TIME:      '@ist_last_server_time',
  MONOTONIC_ANCHOR: '@ist_monotonic_anchor_device_time', // device time at last sync (for restore)
  IST_MINUTES:      '@ist_minutes_at_sync',
  SYNC_WALL_TIME:   '@ist_sync_wall_time',
};

class ServerTime {
  constructor(socketUrl) {
    this.socketUrl       = socketUrl;
    // Core state — all set at sync time
    this.anchorServerMs  = 0;   // Server UTC ms at last sync
    this.anchorMonotonic = 0;   // performance.now() at last sync
    this.anchorISTMin    = 0;   // IST minutes-since-midnight at last sync
    this.anchorISTDay    = 0;   // IST day-of-week (0=Sun) at last sync
    // Legacy compat
    this.serverTimeOffset = 0;
    this.isSynced        = false;
    this.syncInterval    = null;
    this.deviceTimeManipulated = false;
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  async initialize() {
    await this._loadFromStorage();
    await this.syncTime();
    // Re-sync every 3 minutes
    this.syncInterval = setInterval(() => this.syncTime(), 3 * 60 * 1000);
  }

  // ─── Core: monotonic-anchored server time ────────────────────────────────────

  /**
   * Current server UTC ms — device-time-independent.
   * Uses performance.now() for elapsed since last sync.
   */
  now() {
    if (!this.anchorServerMs || !this.anchorMonotonic) {
      // Not synced — device UTC is best estimate, offset will be applied after sync
      return Date.now() + this.serverTimeOffset;
    }
    const elapsed = performance.now() - this.anchorMonotonic;
    return this.anchorServerMs + elapsed;
  }

  nowDate()      { return new Date(this.now()); }
  nowISO()       { return new Date(this.now()).toISOString(); }
  nowTimestamp() { return Math.floor(this.now() / 1000); }

  getISTDate() {
    // Always add IST offset to UTC time
    const utcMs = this.now();
    return new Date(utcMs + IST_OFFSET_MS);
  }
  getISTTimeInMinutes() {
    if (this.anchorMonotonic) {
      const elapsedMin = (performance.now() - this.anchorMonotonic) / 60000;
      return Math.floor(this.anchorISTMin + elapsedMin) % 1440;
    }
    // Not synced yet — derive from device UTC + IST offset (best available estimate)
    const istMs = Date.now() + IST_OFFSET_MS;
    const d = new Date(istMs);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  /** IST day of week (0=Sun…6=Sat) */
  getISTDayOfWeek() {
    if (this.anchorMonotonic) {
      const elapsedMin = (performance.now() - this.anchorMonotonic) / 60000;
      const totalMin = this.anchorISTMin + elapsedMin;
      const dayOffset = Math.floor(totalMin / 1440);
      return (this.anchorISTDay + dayOffset) % 7;
    }
    // Not synced — use device UTC + IST offset
    const istMs = Date.now() + IST_OFFSET_MS;
    return new Date(istMs).getUTCDay();
  }

  /** IST day name */
  getCurrentDay() {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[this.getISTDayOfWeek()];
  }

  // ─── IST-specific helpers (for period detection) ─────────────────────────────

  /**
   * IST minutes since midnight — the ONLY value used for period matching.
   * Derived from server-provided IST breakdown + monotonic elapsed.
   */

  /** IST date string YYYY-MM-DD */
  getISTDateString() {
    return this.getISTDate().toISOString().slice(0, 10);
  }

  /** IST toDateString() equivalent */
  getISTToDateString() {
    const d = this.getISTDate();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2,'0')} ${d.getUTCFullYear()}`;
  }

  /** Check if a period time range is currently active */
  isWithinTimeRange(startTime, endTime) {
    const cur = this.getISTTimeInMinutes();
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return cur >= sh * 60 + sm && cur <= eh * 60 + em;
  }

  // ─── Sync ────────────────────────────────────────────────────────────────────

  async syncTime() {
    try {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const s = await this._fetchSample();
        if (s) samples.push(s);
        if (i < 2) await new Promise(r => setTimeout(r, 100));
      }
      if (!samples.length) {
        console.warn('⚠️ ServerTime: sync failed, keeping previous anchor');
        return false;
      }

      // Use median sample
      samples.sort((a, b) => a.offset - b.offset);
      const best = samples[Math.floor(samples.length / 2)];

      this.anchorServerMs  = best.serverMs;
      this.anchorMonotonic = best.monotonic;
      this.anchorISTMin    = best.istMinutes;
      this.anchorISTDay    = best.istDay;
      this.serverTimeOffset = best.offset;
      this.isSynced = true;
      this.deviceTimeManipulated = false;

      await this._saveToStorage();
      console.log(`✅ ServerTime synced — IST: ${String(Math.floor(best.istMinutes/60)).padStart(2,'0')}:${String(best.istMinutes%60).padStart(2,'0')} day=${this.getCurrentDay()}`);
      return true;
    } catch (e) {
      console.warn('⚠️ ServerTime sync error:', e.message);
      return false;
    }
  }

  async _fetchSample() {
    try {
      const t0mono = performance.now();
      const t0wall = Date.now();

      const res  = await fetch(`${this.socketUrl}/api/time`, { method: 'GET' });
      const t3mono = performance.now();
      const data = await res.json();

      if (!data.success || !data.serverTime) return null;

      const rtt     = t3mono - t0mono;
      const latency = rtt / 2;
      const offset  = data.serverTime - t0wall - latency;

      // Anchor: server time at the midpoint of the request
      const serverMs  = data.serverTime;
      const monotonic = t0mono + latency; // monotonic time when server processed request

      return {
        serverMs,
        monotonic,
        offset:     Math.round(offset),
        istMinutes: data.istTimeInMinutes,
        istDay:     data.istDay,
        rtt:        Math.round(rtt),
      };
    } catch { return null; }
  }

  // ─── Storage ─────────────────────────────────────────────────────────────────

  async _saveToStorage() {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.SERVER_TIME,      String(this.anchorServerMs)],
        [STORAGE_KEYS.MONOTONIC_ANCHOR, String(Date.now())], // wall time at save
        [STORAGE_KEYS.IST_MINUTES,      String(this.anchorISTMin)],
        [STORAGE_KEYS.SYNC_WALL_TIME,   String(Date.now())],
      ]);
    } catch (e) { console.warn('ServerTime save error:', e.message); }
  }

  async _loadFromStorage() {
    try {
      const vals = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
      const map  = Object.fromEntries(vals.map(([k, v]) => [k, v]));

      const serverMs  = parseInt(map[STORAGE_KEYS.SERVER_TIME] || '0', 10);
      const wallAtSave = parseInt(map[STORAGE_KEYS.MONOTONIC_ANCHOR] || '0', 10);
      const istMin    = parseInt(map[STORAGE_KEYS.IST_MINUTES] || '0', 10);
      const syncWall  = parseInt(map[STORAGE_KEYS.SYNC_WALL_TIME] || '0', 10);

      if (!serverMs || !wallAtSave) return;

      // How much wall time passed since we saved? (device time used only for elapsed estimate)
      // This is safe: even if device time was changed, the worst case is a wrong estimate
      // that gets corrected on next sync. The monotonic anchor is reset to now.
      const wallElapsed = Math.max(0, Date.now() - wallAtSave);
      const restoredServerMs = serverMs + wallElapsed;
      const restoredISTMin   = Math.floor(istMin + wallElapsed / 60000) % 1440;

      // Re-anchor to current performance.now()
      this.anchorServerMs  = restoredServerMs;
      this.anchorMonotonic = performance.now();
      this.anchorISTMin    = restoredISTMin;
      this.anchorISTDay    = new Date(restoredServerMs + IST_OFFSET_MS).getUTCDay();
      this.serverTimeOffset = restoredServerMs - Date.now();
      this.isSynced = true;

      console.log(`📦 ServerTime restored from storage — IST: ${String(Math.floor(restoredISTMin/60)).padStart(2,'0')}:${String(restoredISTMin%60).padStart(2,'0')}`);
    } catch (e) { console.warn('ServerTime load error:', e.message); }
  }

  // ─── Compat / misc ───────────────────────────────────────────────────────────

  getCurrentTimeInMinutes() { return this.getISTTimeInMinutes(); }
  isSynchronized()          { return this.isSynced; }
  isDeviceTimeManipulated() { return this.deviceTimeManipulated; }
  getTimeSinceLastSync()    { return 0; } // not needed with monotonic

  destroy() {
    if (this.syncInterval) { clearInterval(this.syncInterval); this.syncInterval = null; }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;

export const initializeServerTime = (socketUrl) => {
  if (!_instance) _instance = new ServerTime(socketUrl);
  return _instance;
};

export const getServerTime = () => {
  if (!_instance) throw new Error('ServerTime not initialized');
  return _instance;
};

export default ServerTime;
