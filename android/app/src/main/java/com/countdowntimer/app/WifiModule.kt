package com.countdowntimer.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.reflect.Method

class WifiModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val context: Context = reactContext
    private val wifiManager: WifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val connectivityManager: ConnectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val locationManager: LocationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val TAG = "WifiModule"

    override fun getName(): String {
        return "WifiModule"
    }

    @ReactMethod
    fun getBSSID(promise: Promise) {
        try {
            Log.d(TAG, "getBSSID called - Device: ${Build.MANUFACTURER} ${Build.MODEL}")
            
            // Check if WiFi is enabled
            if (!wifiManager.isWifiEnabled) {
                val error = WritableNativeMap()
                error.putString("code", "WIFI_DISABLED")
                error.putString("message", "WiFi is disabled on device")
                error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                promise.reject("WIFI_DISABLED", "WiFi is disabled", error)
                return
            }

            // Enhanced permission check for Redmi/MIUI devices and Android 13+
            if (!hasEnhancedLocationPermission()) {
                val error = WritableNativeMap()
                error.putString("code", "PERMISSION_DENIED")
                
                val message = when {
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> {
                        "Android 13+ requires NEARBY_WIFI_DEVICES and location permissions for BSSID access. Please grant all WiFi and location permissions."
                    }
                    isRedmiDevice() -> {
                        "Redmi device detected. Enable 'Precise Location' permission and ensure all WiFi permissions are granted."
                    }
                    else -> {
                        "Location and WiFi permissions required for BSSID access. Please grant ACCESS_FINE_LOCATION and ACCESS_WIFI_STATE permissions."
                    }
                }
                
                error.putString("message", message)
                error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                error.putBoolean("isRedmi", isRedmiDevice())
                error.putInt("androidVersion", Build.VERSION.SDK_INT)
                error.putBoolean("requiresNearbyWifiDevices", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                promise.reject("PERMISSION_DENIED", "Required permissions not granted", error)
                return
            }

            // Check if Location Services (GPS) is enabled - CRITICAL for Android 10+
            if (!isLocationEnabled()) {
                val error = WritableNativeMap()
                error.putString("code", "LOCATION_SERVICES_DISABLED")
                error.putString("message", "Location Services (GPS) must be enabled to access WiFi BSSID. Please enable Location Services in system settings.")
                error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                error.putBoolean("isRedmi", isRedmiDevice())
                error.putInt("androidVersion", Build.VERSION.SDK_INT)
                error.putString("solution", "Go to Settings > Location and turn on Location Services")
                promise.reject("LOCATION_SERVICES_DISABLED", "Location Services disabled", error)
                return
            }

            // Multiple attempts to get WiFi info (Redmi devices sometimes need retry)
            var wifiInfo: WifiInfo? = null
            var attempts = 0
            val maxAttempts = 5 // Increased attempts for better reliability
            
            while (wifiInfo == null && attempts < maxAttempts) {
                attempts++
                Log.d(TAG, "Attempt $attempts to get WiFi info")
                
                try {
                    // Try different approaches based on attempt number
                    wifiInfo = when (attempts) {
                        1 -> wifiManager.connectionInfo
                        2 -> {
                            // Force refresh WiFi state
                            if (wifiManager.isWifiEnabled) {
                                Thread.sleep(100)
                                wifiManager.connectionInfo
                            } else null
                        }
                        3 -> getWifiInfoAlternative()
                        4 -> {
                            // Try getting info after a longer delay
                            Thread.sleep(1000)
                            wifiManager.connectionInfo
                        }
                        else -> {
                            // Last attempt with system service refresh
                            val freshWifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                            freshWifiManager.connectionInfo
                        }
                    }
                    
                    if (wifiInfo == null) {
                        Thread.sleep(300) // Wait before retry
                    } else {
                        Log.d(TAG, "WiFi info obtained on attempt $attempts")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Attempt $attempts failed: ${e.message}")
                    if (attempts == maxAttempts) throw e
                    Thread.sleep(300)
                }
            }
            
            if (wifiInfo == null) {
                val error = WritableNativeMap()
                error.putString("code", "NO_WIFI_INFO")
                error.putString("message", "Unable to get WiFi connection info after $maxAttempts attempts")
                error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                error.putBoolean("isRedmi", isRedmiDevice())
                promise.reject("NO_WIFI_INFO", "No WiFi info available", error)
                return
            }

            // Enhanced BSSID extraction with multiple fallback methods
            var bssid = getBSSIDWithFallback(wifiInfo)
            
            Log.d(TAG, "BSSID result: $bssid")
            
            // More aggressive BSSID validation - try to get any non-null value
            if (bssid == null || bssid.isEmpty() || bssid == "null") {
                // Last attempt - try to get raw BSSID value
                val rawBssid = wifiInfo.bssid
                Log.d(TAG, "Final attempt - raw BSSID: $rawBssid")
                
                if (rawBssid != null && rawBssid.isNotEmpty() && rawBssid != "null") {
                    bssid = rawBssid
                    Log.d(TAG, "Using raw BSSID: $bssid")
                } else {
                    val error = WritableNativeMap()
                    error.putString("code", "NO_BSSID")
                    error.putString("message", if (isRedmiDevice()) {
                        "BSSID not available on Redmi device. Try: 1) Enable precise location 2) Disable WiFi scanning optimization 3) Grant all location permissions 4) Restart WiFi"
                    } else {
                        "No BSSID available - not connected to WiFi or permission denied. Raw BSSID: $rawBssid"
                    })
                    error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
                    error.putBoolean("isRedmi", isRedmiDevice())
                    error.putString("wifiState", getWifiStateInfo())
                    error.putString("rawBssid", rawBssid ?: "null")
                    error.putString("ssid", cleanSSID(wifiInfo.ssid))
                    error.putInt("networkId", wifiInfo.networkId)
                    promise.reject("NO_BSSID", "BSSID not available", error)
                    return
                }
            }

            // Create enhanced result object
            val result = WritableNativeMap()
            result.putString("bssid", bssid)
            result.putString("ssid", cleanSSID(wifiInfo.ssid))
            result.putInt("rssi", wifiInfo.rssi)
            result.putInt("linkSpeed", wifiInfo.linkSpeed)
            result.putInt("frequency", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) wifiInfo.frequency else -1)
            result.putString("macAddress", wifiInfo.macAddress ?: "Unknown")
            result.putInt("networkId", wifiInfo.networkId)
            result.putBoolean("success", true)
            result.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            result.putBoolean("isRedmi", isRedmiDevice())
            result.putString("method", "enhanced")
            result.putInt("attempts", attempts)

            Log.d(TAG, "BSSID successfully retrieved: $bssid")
            promise.resolve(result)

        } catch (e: Exception) {
            Log.e(TAG, "getBSSID error: ${e.message}", e)
            val error = WritableNativeMap()
            error.putString("code", "UNKNOWN_ERROR")
            error.putString("message", e.message ?: "Unknown error occurred")
            error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            error.putBoolean("isRedmi", isRedmiDevice())
            promise.reject("UNKNOWN_ERROR", e.message, error)
        }
    }

    @ReactMethod
    fun getWifiState(promise: Promise) {
        try {
            Log.d(TAG, "getWifiState called")
            
            val result = WritableNativeMap()
            result.putBoolean("isWifiEnabled", wifiManager.isWifiEnabled)
            result.putBoolean("hasLocationPermission", hasLocationPermission())
            result.putBoolean("hasEnhancedLocationPermission", hasEnhancedLocationPermission())
            result.putBoolean("isLocationServicesEnabled", isLocationEnabled())
            
            // Check if connected to WiFi
            var isConnectedToWifi = false
            var networkType = "UNKNOWN"
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = connectivityManager.activeNetwork
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                isConnectedToWifi = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
                
                if (capabilities != null) {
                    networkType = when {
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
                        else -> "OTHER"
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                val networkInfo = connectivityManager.activeNetworkInfo
                isConnectedToWifi = networkInfo?.type == ConnectivityManager.TYPE_WIFI && networkInfo.isConnected
                networkType = when (networkInfo?.type) {
                    ConnectivityManager.TYPE_WIFI -> "WIFI"
                    ConnectivityManager.TYPE_MOBILE -> "CELLULAR"
                    else -> "OTHER"
                }
            }
            
            result.putBoolean("isConnectedToWifi", isConnectedToWifi)
            result.putString("networkType", networkType)
            result.putString("wifiState", getWifiStateInfo())
            result.putBoolean("success", true)
            
            // Device-specific information
            result.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            result.putBoolean("isRedmi", isRedmiDevice())
            result.putInt("androidVersion", Build.VERSION.SDK_INT)
            
            // Additional diagnostics for Redmi devices
            if (isRedmiDevice()) {
                result.putString("miuiAdvice", "For Redmi devices: Enable 'Precise Location', disable 'WiFi scanning optimization' in Developer Options")
                
                // Check location services
                val locationMode = try {
                    Settings.Secure.getInt(context.contentResolver, Settings.Secure.LOCATION_MODE)
                } catch (e: Exception) {
                    -1
                }
                result.putInt("locationMode", locationMode)
                result.putBoolean("locationServicesEnabled", locationMode != Settings.Secure.LOCATION_MODE_OFF)
            }
            
            Log.d(TAG, "WiFi state retrieved successfully")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "getWifiState error: ${e.message}", e)
            val error = WritableNativeMap()
            error.putString("code", "WIFI_STATE_ERROR")
            error.putString("message", e.message ?: "Failed to get WiFi state")
            error.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            promise.reject("WIFI_STATE_ERROR", e.message, error)
        }
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val result = WritableNativeMap()
            
            // Basic WiFi and location permissions
            result.putBoolean("ACCESS_FINE_LOCATION", hasPermission(Manifest.permission.ACCESS_FINE_LOCATION))
            result.putBoolean("ACCESS_COARSE_LOCATION", hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION))
            result.putBoolean("ACCESS_WIFI_STATE", hasPermission(Manifest.permission.ACCESS_WIFI_STATE))
            result.putBoolean("CHANGE_WIFI_STATE", hasPermission(Manifest.permission.CHANGE_WIFI_STATE))
            result.putBoolean("ACCESS_NETWORK_STATE", hasPermission(Manifest.permission.ACCESS_NETWORK_STATE))
            
            // Android 13+ (API 33) specific permission
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                result.putBoolean("NEARBY_WIFI_DEVICES", hasPermission("android.permission.NEARBY_WIFI_DEVICES"))
            } else {
                result.putBoolean("NEARBY_WIFI_DEVICES", true) // Not required for older versions
            }
            
            // Background location (Android 10 and below)
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
                result.putBoolean("ACCESS_BACKGROUND_LOCATION", hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            } else {
                result.putBoolean("ACCESS_BACKGROUND_LOCATION", true) // Not applicable for newer versions
            }
            
            // Additional diagnostic info
            result.putInt("androidVersion", Build.VERSION.SDK_INT)
            result.putString("androidRelease", Build.VERSION.RELEASE)
            result.putBoolean("isRedmi", isRedmiDevice())
            
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "checkPermissions error: ${e.message}", e)
            promise.reject("PERMISSION_CHECK_ERROR", e.message)
        }
    }

    @ReactMethod
    fun testConnection(promise: Promise) {
        try {
            val result = WritableNativeMap()
            result.putString("module", "WifiModule")
            result.putString("version", "2.0.0-redmi-enhanced")
            result.putBoolean("success", true)
            result.putString("message", "Native WiFi module is working correctly")
            result.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            result.putBoolean("isRedmi", isRedmiDevice())
            
            promise.resolve(result)
            
        } catch (e: Exception) {
            promise.reject("TEST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun debugBSSID(promise: Promise) {
        try {
            Log.d(TAG, "=== DEBUG BSSID DETAILED ANALYSIS ===")
            
            val result = WritableNativeMap()
            result.putString("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            result.putBoolean("isRedmi", isRedmiDevice())
            result.putInt("androidVersion", Build.VERSION.SDK_INT)
            
            // Check WiFi state
            result.putBoolean("wifiEnabled", wifiManager.isWifiEnabled)
            
            // Check permissions
            val permissions = WritableNativeMap()
            permissions.putBoolean("ACCESS_FINE_LOCATION", hasPermission(Manifest.permission.ACCESS_FINE_LOCATION))
            permissions.putBoolean("ACCESS_COARSE_LOCATION", hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION))
            permissions.putBoolean("ACCESS_WIFI_STATE", hasPermission(Manifest.permission.ACCESS_WIFI_STATE))
            permissions.putBoolean("ACCESS_NETWORK_STATE", hasPermission(Manifest.permission.ACCESS_NETWORK_STATE))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.putBoolean("NEARBY_WIFI_DEVICES", hasPermission("android.permission.NEARBY_WIFI_DEVICES"))
            }
            result.putMap("permissions", permissions)
            
            // Try to get WiFi info
            val wifiInfo = wifiManager.connectionInfo
            if (wifiInfo != null) {
                val wifiDetails = WritableNativeMap()
                wifiDetails.putString("ssid", wifiInfo.ssid ?: "null")
                wifiDetails.putString("bssid", wifiInfo.bssid ?: "null")
                wifiDetails.putInt("networkId", wifiInfo.networkId)
                wifiDetails.putInt("rssi", wifiInfo.rssi)
                wifiDetails.putInt("linkSpeed", wifiInfo.linkSpeed)
                wifiDetails.putString("macAddress", wifiInfo.macAddress ?: "null")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    wifiDetails.putInt("frequency", wifiInfo.frequency)
                }
                result.putMap("wifiInfo", wifiDetails)
                
                // Try all reflection methods
                val reflectionResults = WritableNativeArray()
                
                // Check all fields
                val fields = wifiInfo.javaClass.declaredFields
                for (field in fields) {
                    try {
                        field.isAccessible = true
                        val value = field.get(wifiInfo)
                        val fieldResult = WritableNativeMap()
                        fieldResult.putString("fieldName", field.name)
                        fieldResult.putString("fieldType", field.type.simpleName)
                        fieldResult.putString("value", value?.toString() ?: "null")
                        reflectionResults.pushMap(fieldResult)
                        
                        Log.d(TAG, "Field ${field.name} (${field.type.simpleName}): $value")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to access field ${field.name}: ${e.message}")
                    }
                }
                result.putArray("reflectionFields", reflectionResults)
                
                // For testing: Generate a fake BSSID based on network info
                val fakeBssid = generateTestBSSID(wifiInfo)
                result.putString("generatedTestBssid", fakeBssid)
                result.putString("note", "If real BSSID is unavailable, you can use the generated test BSSID for development")
                
            } else {
                result.putString("error", "Unable to get WiFi connection info")
            }
            
            Log.d(TAG, "=== END DEBUG BSSID ANALYSIS ===")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "debugBSSID error: ${e.message}", e)
            promise.reject("DEBUG_ERROR", e.message)
        }
    }

    // Generate a test BSSID for development when real BSSID is unavailable
    private fun generateTestBSSID(wifiInfo: WifiInfo): String {
        // Create a deterministic fake BSSID based on network info
        val ssid = wifiInfo.ssid?.replace("\"", "") ?: "unknown"
        val networkId = wifiInfo.networkId
        
        // Generate a MAC-like address based on SSID and network ID
        val hash = (ssid + networkId.toString()).hashCode()
        val bytes = ByteArray(6)
        bytes[0] = ((hash shr 24) and 0xFF).toByte()
        bytes[1] = ((hash shr 16) and 0xFF).toByte()
        bytes[2] = ((hash shr 8) and 0xFF).toByte()
        bytes[3] = (hash and 0xFF).toByte()
        bytes[4] = ((networkId shr 8) and 0xFF).toByte()
        bytes[5] = (networkId and 0xFF).toByte()
        
        // Ensure it's a valid unicast MAC (clear multicast bit)
        bytes[0] = (bytes[0].toInt() and 0xFE).toByte()
        
        return bytes.joinToString(":") { "%02x".format(it) }
    }

    @ReactMethod
    fun getRedmiDiagnostics(promise: Promise) {
        try {
            val result = WritableNativeMap()
            
            // Device information
            result.putString("manufacturer", Build.MANUFACTURER)
            result.putString("brand", Build.BRAND)
            result.putString("model", Build.MODEL)
            result.putString("device", Build.DEVICE)
            result.putBoolean("isRedmi", isRedmiDevice())
            result.putInt("androidVersion", Build.VERSION.SDK_INT)
            result.putString("androidRelease", Build.VERSION.RELEASE)
            
            // Permission diagnostics
            val permissions = WritableNativeMap()
            permissions.putBoolean("ACCESS_FINE_LOCATION", hasPermission(Manifest.permission.ACCESS_FINE_LOCATION))
            permissions.putBoolean("ACCESS_COARSE_LOCATION", hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION))
            permissions.putBoolean("ACCESS_WIFI_STATE", hasPermission(Manifest.permission.ACCESS_WIFI_STATE))
            permissions.putBoolean("CHANGE_WIFI_STATE", hasPermission(Manifest.permission.CHANGE_WIFI_STATE))
            result.putMap("permissions", permissions)
            
            // WiFi state diagnostics
            result.putBoolean("wifiEnabled", wifiManager.isWifiEnabled)
            result.putString("wifiState", getWifiStateInfo())
            
            // Location services check
            val locationMode = try {
                Settings.Secure.getInt(context.contentResolver, Settings.Secure.LOCATION_MODE)
            } catch (e: Exception) {
                -1
            }
            result.putInt("locationMode", locationMode)
            result.putBoolean("locationServicesEnabled", locationMode != Settings.Secure.LOCATION_MODE_OFF)
            
            // Network connectivity
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            result.putBoolean("hasActiveNetwork", network != null)
            result.putBoolean("hasWifiTransport", capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true)
            
            // WiFi connection info (if available)
            try {
                val wifiInfo = wifiManager.connectionInfo
                if (wifiInfo != null) {
                    val wifiDetails = WritableNativeMap()
                    wifiDetails.putString("ssid", cleanSSID(wifiInfo.ssid))
                    wifiDetails.putString("bssid", wifiInfo.bssid ?: "null")
                    wifiDetails.putInt("rssi", wifiInfo.rssi)
                    wifiDetails.putInt("networkId", wifiInfo.networkId)
                    wifiDetails.putInt("linkSpeed", wifiInfo.linkSpeed)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        wifiDetails.putInt("frequency", wifiInfo.frequency)
                    }
                    result.putMap("wifiInfo", wifiDetails)
                }
            } catch (e: Exception) {
                result.putString("wifiInfoError", e.message)
            }
            
            // Device-specific recommendations
            val recommendations = WritableNativeArray()
            
            // Android 13+ specific recommendations
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                recommendations.pushString("Android 13+: Grant 'Nearby devices' permission for WiFi access")
                recommendations.pushString("Android 13+: Enable 'Precise Location' permission")
                recommendations.pushString("Android 13+: Ensure all WiFi permissions are granted")
            }
            
            // Redmi-specific recommendations
            if (isRedmiDevice()) {
                recommendations.pushString("Redmi: Enable 'Precise Location' in app permissions")
                recommendations.pushString("Redmi: Disable 'WiFi scanning optimization' in Developer Options")
                recommendations.pushString("Redmi: Enable 'Location Services' in system settings")
                recommendations.pushString("Redmi: Grant all location permissions to the app")
                recommendations.pushString("Redmi: Disable battery optimization for this app")
            }
            
            // General recommendations
            recommendations.pushString("Ensure WiFi is connected and stable")
            recommendations.pushString("Enable Location Services in system settings")
            recommendations.pushString("Try restarting WiFi if BSSID detection fails")
            recommendations.pushString("Check that app has all required permissions")
            
            result.putArray("recommendations", recommendations)
            
            result.putBoolean("success", true)
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "getRedmiDiagnostics error: ${e.message}", e)
            promise.reject("DIAGNOSTICS_ERROR", e.message)
        }
    }

    private fun hasLocationPermission(): Boolean {
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || 
               hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    /**
     * Check if Location Services (GPS) is enabled
     * This is CRITICAL for Android 10+ BSSID access
     */
    private fun isLocationEnabled(): Boolean {
        return try {
            // Checks if the GPS/Network location provider is actually on
            locationManager.isLocationEnabled
        } catch (e: Exception) {
            Log.w(TAG, "Error checking location services: ${e.message}")
            false
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    // Enhanced permission check for Redmi/MIUI devices and Android 13+
    private fun hasEnhancedLocationPermission(): Boolean {
        val hasFineLocation = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        val hasCoarseLocation = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        val hasWifiState = hasPermission(Manifest.permission.ACCESS_WIFI_STATE)
        val hasNetworkState = hasPermission(Manifest.permission.ACCESS_NETWORK_STATE)
        
        // Android 13+ (API 33) requires NEARBY_WIFI_DEVICES permission
        val hasNearbyWifiDevices = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasPermission("android.permission.NEARBY_WIFI_DEVICES")
        } else {
            true // Not required for older versions
        }
        
        Log.d(TAG, "Permission check - Fine: $hasFineLocation, Coarse: $hasCoarseLocation, WiFi: $hasWifiState, Network: $hasNetworkState, NearbyWiFi: $hasNearbyWifiDevices")
        
        // Basic required permissions
        val hasBasicPermissions = hasWifiState && hasNetworkState
        
        // Location permissions (required for BSSID access)
        val hasLocationPermissions = if (isRedmiDevice()) {
            // For Redmi devices, prefer fine location permission
            hasFineLocation
        } else {
            hasFineLocation || hasCoarseLocation
        }
        
        // Android 13+ specific check
        val hasAndroid13Permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasNearbyWifiDevices
        } else {
            true
        }
        
        return hasBasicPermissions && hasLocationPermissions && hasAndroid13Permissions
    }

    // Check if device is Redmi/Xiaomi
    private fun isRedmiDevice(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()
        val model = Build.MODEL.lowercase()
        
        return manufacturer.contains("xiaomi") || 
               brand.contains("redmi") || 
               brand.contains("xiaomi") ||
               model.contains("redmi")
    }

    // Alternative method to get WiFi info for problematic devices
    private fun getWifiInfoAlternative(): WifiInfo? {
        return try {
            // Try using reflection for MIUI devices
            val method: Method = wifiManager.javaClass.getDeclaredMethod("getConnectionInfo")
            method.isAccessible = true
            method.invoke(wifiManager) as? WifiInfo
        } catch (e: Exception) {
            Log.w(TAG, "Alternative WiFi info method failed: ${e.message}")
            null
        }
    }

    // Enhanced BSSID extraction with multiple fallback methods
    private fun getBSSIDWithFallback(wifiInfo: WifiInfo): String? {
        Log.d(TAG, "Starting BSSID detection with multiple methods")
        
        // Method 1: Standard BSSID access
        var bssid = wifiInfo.bssid
        Log.d(TAG, "Method 1 BSSID (standard): $bssid")
        
        if (isValidBSSID(bssid)) {
            Log.d(TAG, "Method 1 successful: $bssid")
            return bssid
        }

        // Method 2: Try reflection to access private fields
        try {
            val field = wifiInfo.javaClass.getDeclaredField("mBSSID")
            field.isAccessible = true
            bssid = field.get(wifiInfo) as? String
            Log.d(TAG, "Method 2 BSSID (reflection mBSSID): $bssid")
            
            if (isValidBSSID(bssid)) {
                Log.d(TAG, "Method 2 successful: $bssid")
                return bssid
            }
        } catch (e: Exception) {
            Log.w(TAG, "Method 2 reflection failed: ${e.message}")
        }

        // Method 3: Try alternative reflection fields
        try {
            val fields = wifiInfo.javaClass.declaredFields
            for (field in fields) {
                if (field.name.contains("bssid", ignoreCase = true) || field.name.contains("BSSID")) {
                    field.isAccessible = true
                    val value = field.get(wifiInfo) as? String
                    Log.d(TAG, "Method 3 BSSID (field ${field.name}): $value")
                    if (isValidBSSID(value)) {
                        Log.d(TAG, "Method 3 successful with field ${field.name}: $value")
                        return value
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Method 3 field scanning failed: ${e.message}")
        }

        // Method 4: Try getting fresh WiFi info
        try {
            val freshWifiInfo = wifiManager.connectionInfo
            if (freshWifiInfo != null && freshWifiInfo != wifiInfo) {
                bssid = freshWifiInfo.bssid
                Log.d(TAG, "Method 4 BSSID (fresh info): $bssid")
                if (isValidBSSID(bssid)) {
                    Log.d(TAG, "Method 4 successful: $bssid")
                    return bssid
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Method 4 fresh info failed: ${e.message}")
        }

        // Method 5: Try using WifiManager methods directly
        try {
            val method = wifiManager.javaClass.getDeclaredMethod("getConnectionInfo")
            method.isAccessible = true
            val altWifiInfo = method.invoke(wifiManager) as? WifiInfo
            if (altWifiInfo != null) {
                bssid = altWifiInfo.bssid
                Log.d(TAG, "Method 5 BSSID (direct method): $bssid")
                if (isValidBSSID(bssid)) {
                    Log.d(TAG, "Method 5 successful: $bssid")
                    return bssid
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Method 5 direct method failed: ${e.message}")
        }

        // Method 6: For newer Android versions, try network-based approach
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val network = connectivityManager.activeNetwork
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                    // Try to get WiFi info through network
                    val networkWifiInfo = wifiManager.connectionInfo
                    bssid = networkWifiInfo?.bssid
                    Log.d(TAG, "Method 6 BSSID (network-based): $bssid")
                    if (isValidBSSID(bssid)) {
                        Log.d(TAG, "Method 6 successful: $bssid")
                        return bssid
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Method 6 network-based failed: ${e.message}")
            }
        }

        // Method 7: Last resort - return original BSSID even if it seems invalid
        // Some devices return valid BSSIDs that don't match our validation
        bssid = wifiInfo.bssid
        if (bssid != null && bssid.isNotEmpty() && bssid != "null") {
            Log.d(TAG, "Method 7 (last resort): Returning potentially valid BSSID: $bssid")
            return bssid
        }

        Log.w(TAG, "All BSSID detection methods failed")
        return null
    }

    // Check if BSSID is valid (more lenient for device compatibility)
    private fun isValidBSSID(bssid: String?): Boolean {
        if (bssid == null || bssid.isEmpty()) return false
        if (bssid == "null") return false
        if (bssid == "<unknown ssid>") return false
        if (bssid == "00:00:00:00:00:00") return false
        if (bssid == "02:00:00:00:00:00") return false
        
        // More lenient MAC address pattern check
        // Accept both : and - separators, and be more flexible with format
        val macPattern1 = "^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$"
        val macPattern2 = "^[0-9A-Fa-f]{12}$" // No separators
        val macPattern3 = "^([0-9A-Fa-f]{2}[.]){5}([0-9A-Fa-f]{2})$" // Dot separators
        
        return bssid.matches(macPattern1.toRegex()) || 
               bssid.matches(macPattern2.toRegex()) || 
               bssid.matches(macPattern3.toRegex()) ||
               (bssid.length >= 12 && bssid.all { it.isLetterOrDigit() || it in ":-." })
    }

    // Clean SSID string
    private fun cleanSSID(ssid: String?): String {
        if (ssid == null) return "Unknown"
        return ssid.replace("\"", "").replace("<unknown ssid>", "Unknown")
    }

    // Get detailed WiFi state information
    private fun getWifiStateInfo(): String {
        return try {
            val state = wifiManager.wifiState
            when (state) {
                WifiManager.WIFI_STATE_DISABLED -> "DISABLED"
                WifiManager.WIFI_STATE_DISABLING -> "DISABLING"
                WifiManager.WIFI_STATE_ENABLED -> "ENABLED"
                WifiManager.WIFI_STATE_ENABLING -> "ENABLING"
                WifiManager.WIFI_STATE_UNKNOWN -> "UNKNOWN"
                else -> "STATE_$state"
            }
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }
}