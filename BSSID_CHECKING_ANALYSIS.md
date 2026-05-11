# BSSID Checking Analysis - How Many Ways BSSID is Validated

## Overview
The LetsBunk attendance system validates BSSID (WiFi MAC address) in **multiple layers** to ensure students are physically present in the correct classroom. Here's a comprehensive breakdown:

---

## Layer 1: Native WiFi Detection (NativeWiFiService.js)

### Method 1: Native Kotlin Module - getCurrentBSSID()
- **What it does**: Uses native Android Kotlin code to detect the WiFi BSSID
- **How it works**: Calls `WifiModule.getBSSID()` from native code
- **Data collected**:
  - BSSID (MAC address of WiFi router)
  - SSID (WiFi network name)
  - RSSI (signal strength in dBm)
  - Link Speed (connection speed in Mbps)
  - Frequency (WiFi frequency in MHz)
  - MAC Address (device's WiFi MAC)
  - Network ID (Android's internal network ID)

### Method 2: WiFi State Validation - getWiFiState()
- **What it does**: Checks if WiFi is enabled on the device
- **Returns**: WiFi enabled status and connection state

### Method 3: Permission Validation - checkPermissions()
- **What it does**: Verifies location permissions are granted
- **Why needed**: Android requires location permission to access BSSID
- **Permissions checked**:
  - ACCESS_FINE_LOCATION
  - ACCESS_COARSE_LOCATION

### Method 4: Complete WiFi Validation - validateWiFiWithPermissions()
- **What it does**: Orchestrates all checks in sequence
- **Flow**:
  1. Check if native module is available
  2. Check current permissions
  3. Request permissions if needed
  4. Verify WiFi is enabled
  5. Get BSSID
  6. Return complete validation result

---

## Layer 2: WiFiManager.js - BSSID Detection & Monitoring

### Method 5: getCurrentBSSID() with Fallback
- **What it does**: Gets BSSID using native service with fallback for development
- **Fallback mechanism**: Uses `getFallbackBSSID()` if native module unavailable
- **Normalization**: Converts BSSID to lowercase for consistent comparison

### Method 6: WiFi Connection Monitoring - startMonitoring()
- **What it does**: Continuously monitors WiFi connection changes
- **Detects**:
  - WiFi disconnection events
  - WiFi reconnection events
  - BSSID changes (switching between WiFi networks)
- **Triggers**: Calls listeners when connection state changes

### Method 7: BSSID Change Detection - handleBSSIDChange()
- **What it does**: Detects when student switches to a different WiFi network
- **Compares**: Old BSSID vs New BSSID
- **Action**: Notifies listeners of BSSID change event

### Method 8: Connection Status Tracking - getStatus()
- **What it does**: Returns current WiFi connection status
- **Returns**: Current BSSID, connection state, and connection details

---

## Layer 3: BSSIDStorage.js - Schedule-Based Validation

### Method 9: getCurrentPeriodBSSID()
- **What it does**: Gets the authorized BSSID for the current time period
- **How it works**:
  1. Retrieves daily schedule from storage
  2. Gets current time (using spoof-proof boot-elapsed time)
  3. Finds which period is currently active
  4. Returns authorized BSSID(s) for that period
- **Time sources** (in priority order):
  1. Server time (synced, spoof-proof)
  2. Boot-elapsed time (monotonic, spoof-proof)
  3. Device time (fallback, spoofable)

### Method 10: validateCurrentBSSID()
- **What it does**: Validates detected BSSID against authorized BSSIDs for current period
- **Supports**:
  - Single BSSID per classroom
  - Multiple BSSIDs per classroom (for redundancy)
- **Checks**:
  1. Is there an active period at current time?
  2. Is BSSID configured for this period?
  3. Does detected BSSID match ANY authorized BSSID?
- **Returns**: Validation result with reason (authorized, wrong_bssid, no_active_period, etc.)

### Method 11: Schedule Freshness Check - needsRefresh()
- **What it does**: Verifies schedule is current (not outdated)
- **Checks**:
  1. Is schedule data present?
  2. Is schedule for today (not yesterday)?
- **Action**: Clears outdated schedule if needed

---

## Layer 4: OfflineTimerService.js - Timer-Level Validation

### Method 12: validateBSSIDWithStorage()
- **What it does**: Main BSSID validation before timer starts
- **Flow**:
  1. Gets current BSSID from WiFiManager
  2. Validates using BSSIDStorage system
  3. Checks if BSSID matches current period's authorized BSSID
  4. Returns detailed validation result
- **Failure reasons**:
  - No WiFi connection
  - No active period at current time
  - BSSID not configured for room
  - Wrong WiFi network (BSSID mismatch)
  - Validation error

### Method 13: BSSID Monitoring During Timer - setupBSSIDMonitoring()
- **What it does**: Monitors BSSID changes while timer is running
- **Detects**: If student switches to different WiFi network
- **Action**: Pauses timer if BSSID changes (student left classroom)

---

## Layer 5: WiFi Event Handling

### Method 14: handleDisconnection()
- **What it does**: Handles WiFi disconnection events
- **Action**: Pauses timer (doesn't reset it)

### Method 15: handleConnection()
- **What it does**: Handles WiFi reconnection events
- **Action**: Resumes timer if in same lecture

### Method 16: handleBSSIDChange()
- **What it does**: Handles switching to different WiFi network
- **Action**: Pauses timer if BSSID changes

---

## Summary: Total BSSID Checking Methods

| Layer | Method | Purpose |
|-------|--------|---------|
| **Native** | 1. Native Kotlin BSSID detection | Detect WiFi MAC address |
| | 2. WiFi state validation | Check if WiFi enabled |
| | 3. Permission validation | Verify location permission |
| | 4. Complete WiFi validation | Orchestrate all checks |
| **WiFiManager** | 5. getCurrentBSSID() with fallback | Get BSSID with fallback |
| | 6. WiFi monitoring | Monitor connection changes |
| | 7. BSSID change detection | Detect network switches |
| | 8. Connection status tracking | Track current status |
| **BSSIDStorage** | 9. getCurrentPeriodBSSID() | Get authorized BSSID for period |
| | 10. validateCurrentBSSID() | Validate against authorized BSSID |
| | 11. Schedule freshness check | Verify schedule is current |
| **OfflineTimerService** | 12. validateBSSIDWithStorage() | Main timer-level validation |
| | 13. BSSID monitoring during timer | Monitor changes while running |
| **WiFi Events** | 14. Disconnection handling | Handle WiFi loss |
| | 15. Reconnection handling | Handle WiFi restore |
| | 16. BSSID change handling | Handle network switch |

---

## Key Validation Points

### Before Timer Starts
1. ✅ Native BSSID detection (with permissions)
2. ✅ WiFi connection check
3. ✅ Schedule-based BSSID validation
4. ✅ Authorized BSSID matching

### During Timer Running
1. ✅ Continuous BSSID monitoring
2. ✅ WiFi connection monitoring
3. ✅ BSSID change detection
4. ✅ Automatic pause on WiFi loss or BSSID change

### On WiFi Reconnection
1. ✅ Verify same BSSID (same classroom)
2. ✅ Verify same lecture (same period)
3. ✅ Resume timer (don't reset)
4. ✅ Skip face verification (already verified)

---

## Spoof-Proof Time Mechanisms

To prevent time-based cheating, the system uses:

1. **Boot-Elapsed Time** (Primary)
   - Monotonic clock that can't be spoofed
   - Starts from device boot
   - Used for schedule validation

2. **Server Time** (Secondary)
   - Synced from server
   - Used when available
   - Prevents device time manipulation

3. **Device Time** (Fallback)
   - Used only as last resort
   - Can be spoofed but better than nothing

---

## Attendance Data Validation Example (ad123)

For student ad123 on Apr 5:
- **BSSID Check**: ✅ Verified (correct classroom WiFi)
- **Schedule Check**: ✅ Verified (during lecture time)
- **Face Verification**: ✅ Verified (face matched)
- **Result**: 407 seconds recorded (44% attendance)

For student ad123 on Apr 6:
- **BSSID Check**: ✅ Verified (correct classroom WiFi)
- **Schedule Check**: ✅ Verified (during lecture time)
- **Face Verification**: ✅ Initial verification passed
- **Manual Marking**: ✅ Admin manually added 7 more periods
- **Result**: Mixed auto + manual attendance

---

## Conclusion

The system validates BSSID in **16 different ways** across 5 layers:
- **Native layer**: Hardware-level WiFi detection
- **WiFiManager layer**: Connection monitoring and status tracking
- **BSSIDStorage layer**: Schedule-based authorization
- **OfflineTimerService layer**: Timer-level validation
- **Event handling layer**: Real-time connection monitoring

This multi-layered approach ensures:
1. Students are in the correct classroom (BSSID match)
2. They're there during the correct time (schedule validation)
3. They're actually present (face verification)
4. They don't cheat by spoofing time or WiFi
