/**
 * Native WiFi Service
 * JavaScript interface for our custom Kotlin WiFi module
 */

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { WifiModule } = NativeModules;

class NativeWiFiService {
  constructor() {
    this.isAvailable = !!WifiModule;
    console.log('📶 Native WiFi Service initialized:', this.isAvailable ? 'Available' : 'Not Available');
  }

  /**
   * Check if the native WiFi module is available
   */
  isModuleAvailable() {
    return this.isAvailable;
  }

  /**
   * Initialize the native WiFi service
   */
  async initialize() {
    try {
      if (!this.isAvailable) {
        console.warn('⚠️ Native WiFi module not available');
        return false;
      }

      // Test the connection
      const testResult = await this.testConnection();
      console.log('📶 Native WiFi module test:', testResult.success ? '✅ Success' : '❌ Failed');
      
      return testResult.success;
    } catch (error) {
      console.error('❌ Failed to initialize native WiFi service:', error);
      return false;
    }
  }

  /**
   * Test connection to native module
   */
  async testConnection() {
    try {
      if (!this.isAvailable) {
        return { success: false, error: 'Module not available' };
      }

      const result = await WifiModule.testConnection();
      return result;
    } catch (error) {
      console.error('❌ Native module test failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current WiFi BSSID using native module
   */
  async getCurrentBSSID() {
    try {
      if (!this.isAvailable) {
        console.warn('⚠️ Native WiFi module not available, using fallback');
        return {
          success: false,
          error: 'Native WiFi module not available',
          code: 'MODULE_NOT_AVAILABLE'
        };
      }

      console.log('📶 Getting BSSID from native module...');
      const result = await WifiModule.getBSSID();
      
      console.log('📶 Native WiFi result:', result);
      
      return {
        success: true,
        bssid: result.bssid,
        ssid: result.ssid,
        rssi: result.rssi,
        linkSpeed: result.linkSpeed,
        frequency: result.frequency,
        macAddress: result.macAddress,
        networkId: result.networkId
      };
      
    } catch (error) {
      console.error('❌ Native WiFi error:', error);
      
      // Parse error details
      let errorCode = 'UNKNOWN_ERROR';
      let errorMessage = error.message;
      
      if (error.code) {
        errorCode = error.code;
      } else if (error.message) {
        // Try to extract error code from message
        if (error.message.includes('PERMISSION_DENIED')) {
          errorCode = 'PERMISSION_DENIED';
        } else if (error.message.includes('WIFI_DISABLED')) {
          errorCode = 'WIFI_DISABLED';
        } else if (error.message.includes('NO_BSSID')) {
          errorCode = 'NO_BSSID';
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        code: errorCode
      };
    }
  }

  /**
   * Get WiFi state information
   */
  async getWiFiState() {
    try {
      if (!this.isAvailable) {
        throw new Error('Native WiFi module not available');
      }

      const result = await WifiModule.getWifiState();
      console.log('📶 WiFi State:', result);
      
      return {
        success: true,
        ...result
      };
      
    } catch (error) {
      console.error('❌ WiFi state error:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check all permissions status
   */
  async checkPermissions() {
    try {
      if (!this.isAvailable) {
        throw new Error('Native WiFi module not available');
      }

      const result = await WifiModule.checkPermissions();
      console.log('🔐 Permission Status:', result);
      
      return {
        success: true,
        permissions: result
      };
      
    } catch (error) {
      console.error('❌ Permission check error:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Request location permissions (required for BSSID access)
   */
  async requestLocationPermissions() {
    try {
      if (Platform.OS !== 'android') {
        return { success: true, granted: true };
      }

      console.log('🔐 Requesting location permissions...');
      
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      const fineLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      const coarseLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      
      const isGranted = fineLocationGranted || coarseLocationGranted;
      
      console.log('🔐 Permission results:', {
        fineLocation: fineLocationGranted,
        coarseLocation: coarseLocationGranted,
        anyGranted: isGranted
      });

      return {
        success: true,
        granted: isGranted,
        fineLocation: fineLocationGranted,
        coarseLocation: coarseLocationGranted
      };
      
    } catch (error) {
      console.error('❌ Permission request error:', error);
      
      return {
        success: false,
        granted: false,
        error: error.message
      };
    }
  }

  /**
   * Complete WiFi validation with permission handling
   */
  async validateWiFiWithPermissions() {
    try {
      console.log('📶 Starting complete WiFi validation...');
      
      // Step 1: Check if module is available
      if (!this.isAvailable) {
        return {
          success: false,
          error: 'Native WiFi module not available',
          currentBSSID: 'Module not available',
          hasPermissions: false
        };
      }

      // Step 2: Check current permissions
      const permissionCheck = await this.checkPermissions();
      if (!permissionCheck.success) {
        return {
          success: false,
          error: 'Failed to check permissions',
          currentBSSID: 'Permission check failed',
          hasPermissions: false
        };
      }

      const hasLocationPermission = permissionCheck.permissions.ACCESS_FINE_LOCATION || 
                                   permissionCheck.permissions.ACCESS_COARSE_LOCATION;

      // Step 3: Request permissions if not granted
      if (!hasLocationPermission) {
        console.log('🔐 Location permission not granted, requesting...');
        const permissionRequest = await this.requestLocationPermissions();
        
        if (!permissionRequest.success || !permissionRequest.granted) {
          return {
            success: false,
            error: 'Location permission denied',
            currentBSSID: 'Permission denied',
            hasPermissions: false,
            permissionDetails: permissionRequest
          };
        }
      }

      // Step 4: Get WiFi state
      const wifiState = await this.getWiFiState();
      if (!wifiState.success) {
        return {
          success: false,
          error: 'Failed to get WiFi state',
          currentBSSID: 'WiFi state error',
          hasPermissions: true
        };
      }

      if (!wifiState.isWifiEnabled) {
        return {
          success: false,
          error: 'WiFi is disabled',
          currentBSSID: 'WiFi disabled',
          hasPermissions: true,
          wifiEnabled: false
        };
      }

      // Step 5: Get BSSID
      const bssidResult = await this.getCurrentBSSID();
      
      return {
        success: bssidResult.success,
        currentBSSID: bssidResult.success ? bssidResult.bssid : 'Not detected',
        ssid: bssidResult.ssid || 'Unknown',
        rssi: bssidResult.rssi || 0,
        hasPermissions: true,
        wifiEnabled: true,
        error: bssidResult.success ? null : bssidResult.error,
        fullResult: bssidResult
      };
      
    } catch (error) {
      console.error('❌ Complete WiFi validation error:', error);
      
      return {
        success: false,
        error: error.message,
        currentBSSID: 'Validation error',
        hasPermissions: false
      };
    }
  }
}

// Export singleton instance
export default new NativeWiFiService();