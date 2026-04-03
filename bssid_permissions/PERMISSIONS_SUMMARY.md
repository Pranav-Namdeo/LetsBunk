# BSSID Permissions - Quick Reference

## Files Downloaded

✅ **PermissionHelper.kt** - Clean, reusable permission helper class
✅ **MainActivity.kt** - Full reference implementation
✅ **AndroidManifest.xml** - Required permission declarations
✅ **README.md** - Complete usage guide

## Quick Start

### 1. Add Permissions to AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### 2. Use PermissionHelper in Your Activity

```kotlin
// Check permissions
if (PermissionHelper.hasLocationPermission(this)) {
    // Access WiFi BSSID
} else {
    // Request permissions
    PermissionHelper.requestLocationPermission(this)
}
```

### 3. Handle Permission Result

```kotlin
override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    
    PermissionHelper.handlePermissionResult(
        requestCode,
        grantResults,
        onGranted = { /* Proceed */ },
        onDenied = { /* Show message */ }
    )
}
```

## Key Points

1. **Location permission is REQUIRED** to access WiFi BSSID on Android 6.0+
2. **Runtime permissions** must be requested before accessing WiFi info
3. **User explanation** should be provided for why location is needed
4. **Graceful handling** of denied permissions is important

## Integration Steps

1. Copy `PermissionHelper.kt` to your project
2. Update package name if needed
3. Add permissions to manifest
4. Implement permission checks before WiFi access
5. Handle permission results properly

## Testing Checklist

- [ ] Permissions declared in manifest
- [ ] Runtime permission request implemented
- [ ] Permission result handling works
- [ ] WiFi BSSID accessible after permission grant
- [ ] Graceful degradation when permissions denied
- [ ] Tested on Android 6.0+
- [ ] Tested on Android 10+ (background restrictions)

## Common Issues

**Issue**: WiFi BSSID returns null
**Solution**: Ensure location permissions are granted AND location services are enabled

**Issue**: Permission dialog doesn't show
**Solution**: Check if permissions are already declared in manifest

**Issue**: "Permission denied" even after granting
**Solution**: Verify all required permissions (FINE and COARSE location)

## Next Steps

1. Review `README.md` for detailed implementation guide
2. Check `MainActivity.kt` for complete working example
3. Integrate `PermissionHelper.kt` into your project
4. Test on multiple Android versions

## Support

For issues or questions:
- Review the full MainActivity.kt implementation
- Check Android documentation for location permissions
- Test on physical devices (emulator may have limitations)
