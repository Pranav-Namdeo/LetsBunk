package com.example.letsbunk

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Permission Helper for Location and WiFi Access
 * 
 * This helper class manages runtime permissions required for:
 * - ACCESS_FINE_LOCATION: Required to get WiFi BSSID
 * - ACCESS_COARSE_LOCATION: Required for WiFi scanning
 * - ACCESS_WIFI_STATE: Required to read WiFi state
 * - CHANGE_WIFI_STATE: Required to enable/disable WiFi
 */
object PermissionHelper {
    
    // Permission request code
    const val PERMISSION_REQUEST_CODE = 100
    
    // Required permissions for WiFi BSSID access
    val LOCATION_PERMISSIONS = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )
    
    /**
     * Check if all location permissions are granted
     */
    fun hasLocationPermission(context: Context): Boolean {
        return LOCATION_PERMISSIONS.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Request location permissions
     */
    fun requestLocationPermission(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            LOCATION_PERMISSIONS,
            PERMISSION_REQUEST_CODE
        )
    }
    
    /**
     * Check and request permissions if not granted
     * @return true if permissions are already granted, false if requesting
     */
    fun checkAndRequestPermissions(activity: Activity): Boolean {
        return if (!hasLocationPermission(activity)) {
            requestLocationPermission(activity)
            false
        } else {
            true
        }
    }
    
    /**
     * Handle permission request result
     * Call this from Activity's onRequestPermissionsResult
     */
    fun handlePermissionResult(
        requestCode: Int,
        grantResults: IntArray,
        onGranted: () -> Unit,
        onDenied: () -> Unit
    ) {
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && 
                grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                onGranted()
            } else {
                onDenied()
            }
        }
    }
    
    /**
     * Show rationale for why permissions are needed
     */
    fun showPermissionRationale(context: Context) {
        Toast.makeText(
            context,
            "Location permission is required to verify your attendance via WiFi BSSID",
            Toast.LENGTH_LONG
        ).show()
    }
}
