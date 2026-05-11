/**
 * PermissionManager.js
 * Requests all required app permissions on startup.
 * Goes straight to native action dialogs — no info pre-prompt.
 */

import { PermissionsAndroid, Platform, Alert, Linking } from 'react-native';

const PERMISSIONS = [
  {
    key: 'camera',
    permission: PermissionsAndroid.PERMISSIONS.CAMERA,
    rationale: {
      title: 'Camera',
      message: 'LetsBunk needs camera access for face verification during attendance.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  },
  {
    key: 'fineLocation',
    permission: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    rationale: {
      title: 'Precise Location',
      message: 'LetsBunk needs precise location to detect your classroom WiFi (BSSID) for attendance.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  },
  {
    key: 'coarseLocation',
    permission: PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    rationale: {
      title: 'Approximate Location',
      message: 'LetsBunk needs approximate location as a fallback for WiFi-based attendance.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  },
  {
    key: 'notifications',
    permission: 'android.permission.POST_NOTIFICATIONS',
    minSdk: 33,
    rationale: {
      title: 'Notifications',
      message: 'LetsBunk needs notification permission to send attendance and class alerts.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  },
  {
    key: 'nearbyWifi',
    permission: 'android.permission.NEARBY_WIFI_DEVICES',
    minSdk: 33,
    rationale: {
      title: 'Nearby Wi-Fi Devices',
      message: 'LetsBunk needs this permission on Android 13+ to read WiFi BSSID for attendance.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  },
];

/**
 * Request all required permissions at app startup.
 * Each permission gets its own native action dialog — no info screen first.
 * @returns {Promise<{allGranted: boolean, results: Object}>}
 */
export async function requestStartupPermissions() {
  if (Platform.OS !== 'android') {
    return { allGranted: true, results: {} };
  }

  // Filter to permissions applicable on this Android version
  const applicable = PERMISSIONS.filter(
    (p) => !p.minSdk || Platform.Version >= p.minSdk
  );

  // Check which are already granted
  const checks = await Promise.all(
    applicable.map((p) => PermissionsAndroid.check(p.permission))
  );
  const needed = applicable.filter((_, i) => !checks[i]);

  if (needed.length === 0) {
    return { allGranted: true, results: {} };
  }

  // Request each permission individually so each gets its own native dialog
  const results = {};
  for (const p of needed) {
    try {
      const result = await PermissionsAndroid.request(p.permission, p.rationale);
      results[p.permission] = result;
    } catch (_) {
      results[p.permission] = PermissionsAndroid.RESULTS.DENIED;
    }
  }

  const denied = needed.filter(
    (p) => results[p.permission] !== PermissionsAndroid.RESULTS.GRANTED
  );

  // If any were permanently denied, offer Settings shortcut
  const permanentlyDenied = denied.filter(
    (p) => results[p.permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
  );

  if (permanentlyDenied.length > 0) {
    Alert.alert(
      'Permissions Blocked',
      `Some permissions were permanently denied:\n\n${permanentlyDenied
        .map((p) => `• ${p.rationale.title}`)
        .join('\n')}\n\nPlease enable them in App Settings > Permissions.`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  }

  return { allGranted: denied.length === 0, results };
}
