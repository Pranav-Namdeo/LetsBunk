import { NativeModules, PermissionsAndroid, Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NativeWiFiService from './NativeWiFiService';

// Use native Kotlin WiFi module instead of react-native-wifi-reborn
console.log('📶 Using native Kotlin WiFi module for BSSID detection');

/**
 * WiFi Manager for BSSID Detection and Validation
 * Handles WiFi connection monitoring for attendance tracking
 */

const WIFI_CACHE_KEY = '@wifi_cache';
const AUTHORIZED_BSSIDS_KEY = '@authorized_bssids';

class WiFiManager {
  constructor() {
    this.currentBSSID = null;
    this.isConnected = false;
    this.authorizedBSSIDs = [];
    this.listeners = [];
    this.checkInterval = null;
    this.graceTimer = null;
    this.isInGracePeriod = false;
  }

  /**
   * Initialize WiFi manager
   * Using native Kotlin WiFi module for reliable BSSID detection
   */
  async initialize() {
    try {
      console.log('📶 Initializing WiFi Manager (native Kotlin mode)...');

      // Check if native module is available
      if (!NativeWiFiService.isModuleAvailable()) {
        console.warn('⚠️ Native WiFi module not available');
        if (__DEV__) {
          console.log('📱 Development mode: Using fallback BSSID for testing');
        }
        return true; // Don't crash the app
      }

      // Initialize native WiFi service
      const nativeInitialized = await NativeWiFiService.initialize();

      if (!nativeInitialized) {
        console.warn('⚠️ Native WiFi service failed to initialize, using fallback mode');
        if (__DEV__) {
          console.log('📱 Development mode: WiFi validation will use fallback');
        }
        return true; // Don't crash the app
      }

      console.log('✅ Native WiFi service initialized');

      // Test native module connection
      const connectionTest = await NativeWiFiService.testConnection();
      console.log('🔗 Native module test:', connectionTest.success ? '✅ Passed' : '⚠️ Issues detected');

      // Check permissions
      const permissionCheck = await NativeWiFiService.checkPermissions();
      if (permissionCheck.success) {
        console.log('🔐 Permission status:', permissionCheck.permissions);
      }

      // Load cached authorized BSSIDs (non-blocking)
      try {
        await this.loadAuthorizedBSSIDs();
      } catch (loadError) {
        console.warn('⚠️ Failed to load BSSIDs, using defaults:', loadError);
      }

      // Start monitoring (non-blocking)
      try {
        this.startMonitoring();
      } catch (monitorError) {
        console.warn('⚠️ Failed to start monitoring, using fallback mode:', monitorError);
      }

      console.log('✅ WiFi Manager initialized (native Kotlin mode)');
      return true;
    } catch (error) {
      console.error('❌ WiFi Manager initialization failed, using fallback mode:', error);
      // Always return true to prevent app crashes
      return true;
    }
  }

  /**
   * Request necessary permissions for WiFi access
   * Enhanced version with better error handling and user prompts
   */
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        console.log('📱 Requesting WiFi permissions...');

        // Check current permission status first - using string constants to avoid null permission issue
        const FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION';
        const COARSE_LOCATION = 'android.permission.ACCESS_COARSE_LOCATION';
        const WIFI_STATE = 'android.permission.ACCESS_WIFI_STATE';

        const locationFineStatus = await PermissionsAndroid.check(FINE_LOCATION);
        const locationCoarseStatus = await PermissionsAndroid.check(COARSE_LOCATION);
        const wifiStateStatus = await PermissionsAndroid.check(WIFI_STATE);

        console.log('📱 Current permission status:');
        console.log('   ACCESS_FINE_LOCATION:', locationFineStatus ? '✅' : '❌');
        console.log('   ACCESS_COARSE_LOCATION:', locationCoarseStatus ? '✅' : '❌');
        console.log('   ACCESS_WIFI_STATE:', wifiStateStatus ? '✅' : '❌');

        // Request permissions if not granted
        if (!locationFineStatus || !locationCoarseStatus) {
          console.log('📱 Requesting location permissions for WiFi BSSID access...');

          const CHANGE_WIFI_STATE = 'android.permission.CHANGE_WIFI_STATE';

          const granted = await PermissionsAndroid.requestMultiple([
            FINE_LOCATION,
            COARSE_LOCATION,
            WIFI_STATE,
            CHANGE_WIFI_STATE,
          ]);

          console.log('📱 Permission request results:', granted);

          const locationGranted = granted[FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

          if (!locationGranted) {
            console.warn('⚠️ Location permission denied - BSSID detection will not work');
            console.warn('   User must manually grant location permission in device settings');
            return false;
          } else {
            console.log('✅ Location permissions granted - BSSID detection should work');
            return true;
          }
        } else {
          console.log('✅ All required permissions already granted');
          return true;
        }
      } catch (error) {
        console.error('❌ Permission request failed:', error);
        return false;
      }
    }
    return true; // iOS or other platforms
  }

  /**
   * Get current WiFi BSSID
   * Using native Kotlin WiFi module for reliable BSSID detection
   */
  async getCurrentBSSID() {
    try {
      console.log('📶 Getting BSSID using native Kotlin module...');

      // Check if native module is available
      if (!NativeWiFiService.isModuleAvailable()) {
        console.warn('⚠️ Native WiFi module not available, using fallback');
        return this.getFallbackBSSID();
      }

      // Use native WiFi service
      const result = await NativeWiFiService.getCurrentBSSID();

      if (result && result.success && result.bssid) {
        console.log(`✅ BSSID detected: ${result.bssid}`);
        console.log(`   SSID: ${result.ssid}`);
        console.log(`   Signal: ${result.rssi} dBm`);
        console.log(`   Link Speed: ${result.linkSpeed} Mbps`);
        console.log(`   Frequency: ${result.frequency} MHz`);
        return result.bssid.toLowerCase(); // Normalize to lowercase
      }

      if (result && !result.success) {
        console.warn(`⚠️ BSSID detection failed: ${result.code}`);
        console.warn(`   Error: ${result.error}`);

        // Provide user-friendly solutions
        if (result.code === 'PERMISSION_DENIED') {
          console.log('💡 Solution: Grant location permission in device settings');
        } else if (result.code === 'LOCATION_SERVICES_DISABLED') {
          console.log('💡 Solution: Enable Location Services (GPS) in system settings');
          // Show user-friendly alert for location services
          this.showLocationServicesAlert();
        } else if (result.code === 'WIFI_DISABLED') {
          console.log('💡 Solution: Enable WiFi on device');
        } else if (result.code === 'NO_BSSID') {
          console.log('💡 Solution: Connect to a WiFi network');
        } else if (result.code === 'MODULE_NOT_AVAILABLE') {
          console.log('💡 Solution: Native module not available, using fallback');
        }

        // Return fallback for development
        if (__DEV__) {
          console.log('📱 Development mode: Using fallback BSSID');
          return this.getFallbackBSSID();
        }

        return null;
      }

      console.log('📶 No BSSID available - using fallback for development');
      return this.getFallbackBSSID();

    } catch (error) {
      console.error('❌ Error getting BSSID from native module:', error);

      // In development, always return fallback
      if (__DEV__) {
        console.log('📱 Development mode: Using fallback BSSID due to error');
        return this.getFallbackBSSID();
      }

      return null;
    }
  }

  /**
   * Check if location permissions are granted
   */
  async checkLocationPermissions() {
    if (Platform.OS !== 'android') return true;

    try {
      const FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION';
      const COARSE_LOCATION = 'android.permission.ACCESS_COARSE_LOCATION';

      const fineLocation = await PermissionsAndroid.check(FINE_LOCATION);
      const coarseLocation = await PermissionsAndroid.check(COARSE_LOCATION);

      console.log(`📱 Fine location: ${fineLocation}`);
      console.log(`📱 Coarse location: ${coarseLocation}`);

      return fineLocation || coarseLocation;
    } catch (error) {
      console.error('❌ Error checking location permissions:', error);
      return false;
    }
  }

  /**
   * Aggressively request location permission with user explanation
   */
  async requestLocationPermissionAggressively() {
    if (Platform.OS !== 'android') return true;

    try {
      console.log('🔐 Requesting location permission with explanation...');

      // First, explain why we need the permission
      return new Promise((resolve) => {
        Alert.alert(
          '📍 Location Permission Required',
          'This app needs location permission to detect WiFi network details (BSSID) for attendance verification.\n\nThis is required by Android for security reasons.\n\nNo location data is collected or stored.',
          [
            {
              text: 'Cancel',
              onPress: () => resolve(false),
              style: 'cancel',
            },
            {
              text: 'Grant Permission',
              onPress: async () => {
                try {
                  const FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION';

                  const granted = await PermissionsAndroid.request(
                    FINE_LOCATION,
                    {
                      title: 'Location Permission for WiFi',
                      message: 'Required to detect classroom WiFi network for attendance tracking.',
                      buttonNeutral: 'Ask Me Later',
                      buttonNegative: 'Cancel',
                      buttonPositive: 'OK',
                    }
                  );

                  const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
                  console.log(`🔐 Location permission result: ${granted} (${isGranted})`);
                  resolve(isGranted);
                } catch (error) {
                  console.error('❌ Error requesting location permission:', error);
                  resolve(false);
                }
              },
            },
          ]
        );
      });
    } catch (error) {
      console.error('❌ Error in aggressive permission request:', error);
      return false;
    }
  }

  /**
   * Show user-friendly alert for location services
   */
  showLocationServicesAlert() {
    Alert.alert(
      '📍 Location Services Required',
      'Please enable Location Services (GPS) to allow WiFi scanning.\n\nThis is required by Android for security reasons to access WiFi network details.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: () => {
            // Try to open location settings
            if (Platform.OS === 'android') {
              try {
                Linking.openSettings();
              } catch (error) {
                console.error('❌ Error opening settings:', error);
              }
            }
          },
        },
      ]
    );
  }

  /**
   * Get fallback BSSID for development/testing
   */
  getFallbackBSSID() {
    if (__DEV__) {
      console.log('📶 Using development BSSID for testing');
      return 'b4:86:18:6f:fb:ec'; // Example BSSID for testing
    }
    return null; // Production should return null if no real BSSID
  }

  /**
   * Check if currently connected to WiFi
   */
  async isWiFiConnected() {
    try {
      const bssid = await this.getCurrentBSSID();
      return bssid !== null;
    } catch (error) {
      console.error('❌ Error checking WiFi connection:', error);
      return false;
    }
  }

  /**
   * Load authorized BSSIDs from server and cache locally
   * Includes automatic room-time matching based on timetable
   */
  async loadAuthorizedBSSIDs(serverUrl, studentData = null) {
    try {
      if (serverUrl) {
        console.log('📥 Fetching authorized BSSIDs from server...');

        // Get classrooms with BSSID data
        const classroomResponse = await fetch(`${serverUrl}/api/classrooms`);
        const classroomData = await classroomResponse.json();

        if (classroomData.success && classroomData.classrooms) {
          this.authorizedBSSIDs = classroomData.classrooms
            .filter(room => room.wifiBSSIDs && room.wifiBSSIDs.length > 0 && room.isActive)
            .flatMap(room => 
              room.wifiBSSIDs.map(bssid => ({
                bssid: bssid.toLowerCase(), // Normalize to lowercase
                roomNumber: room.roomNumber,
                building: room.building || 'Main Building',
                capacity: room.capacity || 60
              }))
            );

          // If student data available, get current lecture room
          if (studentData && studentData.semester && studentData.branch) {
            try {
              const timetableResponse = await fetch(
                `${serverUrl}/api/timetable/${studentData.semester}/${encodeURIComponent(studentData.branch)}`
              );
              const timetableData = await timetableResponse.json();

              if (timetableData.success) {
                const currentRoom = this.getCurrentLectureRoom(timetableData.timetable);
                if (currentRoom) {
                  console.log(`📚 Current lecture room: ${currentRoom}`);
                  // Mark current room as priority
                  this.authorizedBSSIDs = this.authorizedBSSIDs.map(room => ({
                    ...room,
                    isCurrentLecture: room.roomNumber === currentRoom
                  }));
                }
              }
            } catch (timetableError) {
              console.warn('⚠️ Could not fetch timetable for room matching:', timetableError);
            }
          }

          // Cache for offline use
          await AsyncStorage.setItem(AUTHORIZED_BSSIDS_KEY, JSON.stringify(this.authorizedBSSIDs));
          console.log(`✅ Loaded ${this.authorizedBSSIDs.length} authorized BSSIDs`);

          // Debug: Log all loaded BSSIDs
          console.log('📋 Authorized BSSIDs loaded:');
          this.authorizedBSSIDs.forEach((room, index) => {
            console.log(`   ${index + 1}. Room ${room.roomNumber}: ${room.bssid} (${room.building})`);
          });

          // Log current lecture room if found
          const currentLectureRoom = this.authorizedBSSIDs.find(room => room.isCurrentLecture);
          if (currentLectureRoom) {
            console.log(`🎯 Current lecture BSSID: ${currentLectureRoom.bssid} (${currentLectureRoom.roomNumber})`);
          }
        }
      } else {
        // Load from cache
        const cached = await AsyncStorage.getItem(AUTHORIZED_BSSIDS_KEY);
        if (cached) {
          this.authorizedBSSIDs = JSON.parse(cached);
          console.log(`📱 Loaded ${this.authorizedBSSIDs.length} cached BSSIDs`);
        }
      }
    } catch (error) {
      console.error('❌ Error loading authorized BSSIDs:', error);
    }
  }

  /**
   * Get current lecture room based on time and timetable
   */
  getCurrentLectureRoom(timetable) {
    try {
      const now = new Date();
      const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
      const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

      const daySchedule = timetable.schedule?.[currentDay];
      if (!daySchedule || !timetable.periods) return null;

      // Find current period
      for (let i = 0; i < daySchedule.length; i++) {
        const period = daySchedule[i];
        const periodInfo = timetable.periods[i];

        if (!periodInfo || period.isBreak) continue;

        const [startH, startM] = periodInfo.startTime.split(':').map(Number);
        const [endH, endM] = periodInfo.endTime.split(':').map(Number);

        const periodStart = startH * 60 + startM;
        const periodEnd = endH * 60 + endM;

        if (currentTime >= periodStart && currentTime <= periodEnd) {
          return period.room;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting current lecture room:', error);
      return null;
    }
  }

  /**
   * Check if current BSSID is authorized for given room
   */
  async isAuthorizedForRoom(roomNumber) {
    try {
      // Always try to find room's authorized BSSID first
      const roomBSSID = this.authorizedBSSIDs.find(
        item => item.roomNumber === roomNumber
      );

      console.log(`📶 Checking authorization for room ${roomNumber}:`);
      console.log(`   Available BSSIDs: ${this.authorizedBSSIDs.length}`);
      console.log(`   Room data found: ${roomBSSID ? 'YES' : 'NO'}`);

      if (!roomBSSID) {
        console.log(`⚠️ No BSSID configured for room ${roomNumber}`);
        console.log(`   Available rooms: ${this.authorizedBSSIDs.map(r => r.roomNumber).join(', ')}`);
        return {
          authorized: false,
          reason: 'room_not_configured',
          currentBSSID: 'Not detected',
          expectedBSSID: 'Not configured'
        };
      }

      // Now try to get current BSSID
      const currentBSSID = await this.getCurrentBSSID();

      console.log(`📶 BSSID Check for room ${roomNumber}:`);
      console.log(`   Current: ${currentBSSID || 'Not detected'}`);
      console.log(`   Expected: ${roomBSSID.bssid}`);

      if (!currentBSSID) {
        console.log('📶 No current WiFi BSSID detected');
        return {
          authorized: false,
          reason: 'no_wifi',
          currentBSSID: 'Not detected',
          expectedBSSID: roomBSSID.bssid,
          roomInfo: roomBSSID
        };
      }

      const isAuthorized = currentBSSID.toLowerCase() === roomBSSID.bssid.toLowerCase();
      console.log(`   Authorized: ${isAuthorized ? '✅' : '❌'}`);

      return {
        authorized: isAuthorized,
        currentBSSID,
        expectedBSSID: roomBSSID.bssid,
        roomInfo: roomBSSID,
        reason: isAuthorized ? 'authorized' : 'wrong_bssid'
      };
    } catch (error) {
      console.error('❌ Error checking BSSID authorization:', error);
      return {
        authorized: false,
        reason: 'error',
        error: error.message,
        currentBSSID: 'Error',
        expectedBSSID: 'Error'
      };
    }
  }

  /**
   * Start monitoring WiFi connection
   */
  startMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Check every 10 seconds
    this.checkInterval = setInterval(async () => {
      await this.checkConnection();
    }, 10000);

    // Initial check
    this.checkConnection();
  }

  /**
   * Stop monitoring WiFi connection
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  /**
   * Check current WiFi connection and notify listeners
   */
  async checkConnection() {
    try {
      const newBSSID = await this.getCurrentBSSID();
      const wasConnected = this.isConnected;
      const oldBSSID = this.currentBSSID;

      this.currentBSSID = newBSSID;
      this.isConnected = newBSSID !== null;

      // Detect connection changes
      if (wasConnected !== this.isConnected || oldBSSID !== newBSSID) {
        console.log(`📶 WiFi Status Changed:`);
        console.log(`   Connected: ${wasConnected} → ${this.isConnected}`);
        console.log(`   BSSID: ${oldBSSID} → ${newBSSID}`);

        // Handle disconnection with grace period
        if (wasConnected && !this.isConnected) {
          this.handleDisconnection();
        } else if (!wasConnected && this.isConnected) {
          this.handleConnection();
        } else if (this.isConnected && oldBSSID !== newBSSID) {
          this.handleBSSIDChange(oldBSSID, newBSSID);
        }
      }
    } catch (error) {
      console.error('❌ Error checking WiFi connection:', error);
    }
  }

  /**
   * Handle WiFi disconnection with grace period
   */
  handleDisconnection() {
    if (this.isInGracePeriod) return;

    console.log('📶 WiFi disconnected - starting 2-minute grace period');
    this.isInGracePeriod = true;

    // Notify listeners immediately
    this.notifyListeners({
      type: 'disconnected',
      bssid: null,
      gracePeriod: true,
      graceTimeRemaining: 120 // 2 minutes
    });

    // Start 2-minute grace timer
    this.graceTimer = setTimeout(() => {
      console.log('⏰ Grace period expired - pausing timer');
      this.isInGracePeriod = false;

      this.notifyListeners({
        type: 'grace_expired',
        bssid: null,
        gracePeriod: false
      });
    }, 120000); // 2 minutes
  }

  /**
   * Handle WiFi connection
   */
  handleConnection() {
    // Cancel grace period if active
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
      this.isInGracePeriod = false;
      console.log('✅ WiFi reconnected - grace period cancelled');
    }

    this.notifyListeners({
      type: 'connected',
      bssid: this.currentBSSID,
      gracePeriod: false
    });
  }

  /**
   * Handle BSSID change (different WiFi network)
   */
  handleBSSIDChange(oldBSSID, newBSSID) {
    console.log(`📶 BSSID changed: ${oldBSSID} → ${newBSSID}`);

    this.notifyListeners({
      type: 'bssid_changed',
      oldBSSID,
      newBSSID,
      gracePeriod: false
    });
  }

  /**
   * Add listener for WiFi events
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Notify all listeners of WiFi events
   */
  notifyListeners(event) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Error in WiFi listener:', error);
      }
    });
  }

  /**
   * Get current WiFi status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      currentBSSID: this.currentBSSID,
      isInGracePeriod: this.isInGracePeriod,
      authorizedBSSIDsCount: this.authorizedBSSIDs.length
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMonitoring();
    this.listeners = [];
  }
}

// Export singleton instance
export default new WiFiManager();