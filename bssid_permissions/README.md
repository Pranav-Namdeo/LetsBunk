# BSSID Permission Files

This folder contains the necessary files for implementing WiFi BSSID-based attendance with proper Android permissions.

## Files Included

### 1. PermissionHelper.kt
A clean, reusable helper class for managing location permissions required for WiFi BSSID access.

**Features:**
- Check if location permissions are granted
- Request location permissions
- Handle permission results
- Show permission rationale to users

### 2. MainActivity.kt (Reference)
Complete implementation showing how permissions are used in the full app context.

### 3. AndroidManifest.xml (Reference)
Required permission declarations for the manifest file.

## Required Permissions

Add these to your `AndroidManifest.xml`:

```xml
<!-- WiFi and Location Permissions (Required for BSSID access) -->
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Optional: Biometric Permissions -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.CAMERA" />
```

## How to Use PermissionHelper

### Step 1: Add to your Activity

```kotlin
import com.example.letsbunk.PermissionHelper

class YourActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.your_layout)
        
        // Check and request permissions
        PermissionHelper.checkAndRequestPermissions(this)
    }
    
    // Handle permission result
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        PermissionHelper.handlePermissionResult(
            requestCode,
            grantResults,
            onGranted = {
                // Permissions granted - proceed with WiFi BSSID access
                Toast.makeText(this, "Permissions granted!", Toast.LENGTH_SHORT).show()
                // Your code here
            },
            onDenied = {
                // Permissions denied - show message
                Toast.makeText(this, "Permissions required for attendance", Toast.LENGTH_LONG).show()
            }
        )
    }
}
```

### Step 2: Check permissions before accessing WiFi BSSID

```kotlin
fun getWifiBSSID() {
    if (!PermissionHelper.hasLocationPermission(this)) {
        PermissionHelper.showPermissionRationale(this)
        PermissionHelper.requestLocationPermission(this)
        return
    }
    
    // Safe to access WiFi BSSID now
    val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val wifiInfo = wifiManager.connectionInfo
    val bssid = wifiInfo.bssid
    
    // Use BSSID for attendance verification
}
```

## Why Location Permission is Required

Starting from Android 6.0 (API level 23), accessing WiFi BSSID requires location permissions because:
- BSSID can be used to determine user location
- Android treats WiFi scanning as a location-sensitive operation
- This is a privacy protection measure

## Important Notes

1. **Runtime Permissions**: Always check permissions at runtime for Android 6.0+
2. **Permission Rationale**: Explain to users why you need location permission
3. **Graceful Degradation**: Handle cases where permissions are denied
4. **Background Access**: For Android 10+, background location requires additional permission

## Integration with Your Project

1. Copy `PermissionHelper.kt` to your project's package
2. Update package name if different from `com.example.letsbunk`
3. Add required permissions to `AndroidManifest.xml`
4. Use `PermissionHelper` in your activities as shown above

## Testing

Test on devices with:
- Android 6.0+ (Runtime permissions)
- Android 10+ (Background location restrictions)
- Android 12+ (Approximate location option)

## Reference Implementation

See `MainActivity.kt` for a complete working example of:
- Permission handling
- WiFi BSSID access
- Attendance marking with BSSID verification
- Socket.IO integration for real-time updates

## Server Integration

The BSSID is sent to the server for verification:
```kotlin
POST /api/mark-attendance
{
    "studentId": "123",
    "bssid": "aa:bb:cc:dd:ee:ff"
}
```

Server validates the BSSID against authorized classroom WiFi networks.
