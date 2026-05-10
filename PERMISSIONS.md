# LetsBunk APK — Permissions Reference

---

## ⚠️ Permissions User Must Manually Enable

These are runtime permissions. Android shows a dialog for each one — the user must tap Allow. The app will not work correctly if any are denied.

---

### Camera
- **Prompt:** "Allow LetsBunk to take pictures and record video"
- **Android:** All versions
- **Why:** Face verification at attendance check-in
- **If denied:** Cannot mark attendance at all

---

### Precise Location (ACCESS_FINE_LOCATION)
- **Prompt:** "Allow LetsBunk to access this device's precise location"
- **Android:** All versions
- **Why:** Required to read WiFi BSSID and verify the student is in the correct classroom
- **If denied:** Attendance check-in fails

---

### Approximate Location (ACCESS_COARSE_LOCATION)
- **Prompt:** "Allow LetsBunk to access this device's approximate location"
- **Android:** All versions
- **Why:** Fallback for WiFi BSSID detection
- **If denied:** BSSID may not be readable on some devices

---

### Background Location (ACCESS_BACKGROUND_LOCATION)
- **Prompt:** "Allow all the time" — this is a **separate second prompt** after granting location
- **Android:** API 29+ (Android 10+)
- **Why:** Validates WiFi BSSID while the timer runs in the background
- **If denied:** Timer stops checking WiFi when app is minimized — attendance may be invalidated
- **⚠️ Important:** User must select "Allow all the time", not just "While using the app"

---

### Notifications (POST_NOTIFICATIONS)
- **Prompt:** "Allow LetsBunk to send you notifications"
- **Android:** API 33+ (Android 13+) only
- **Why:** Random ring alerts and attendance reminders
- **If denied:** Missed random rings count as absent

---

### Nearby Wi-Fi Devices (NEARBY_WIFI_DEVICES)
- **Prompt:** "Allow LetsBunk to find, connect to, and determine the relative position of nearby devices"
- **Android:** API 33+ (Android 13+) only
- **Why:** The only way to read WiFi BSSID on Android 13+ without full location access
- **If denied:** Attendance check-in fails on Android 13+

---

## Install-time Permissions (auto-granted, no prompt)

These are granted silently when the APK is installed. No user action needed.

- INTERNET — communicate with the Azure backend
- ACCESS_WIFI_STATE — read current WiFi network and BSSID
- CHANGE_WIFI_STATE — WiFi connection management
- ACCESS_NETWORK_STATE — detect online/offline for timer sync
- CHANGE_NETWORK_STATE — network management on OEM/MIUI devices
- FOREGROUND_SERVICE — keep timer alive in background
- FOREGROUND_SERVICE_DATA_SYNC — timer service type (API 34+)
- WAKE_LOCK — prevent CPU sleep while timer counts
- VIBRATE — vibrate on random ring alerts
- SYSTEM_ALERT_WINDOW — overlay for attendance prompts
- USE_BIOMETRIC — biometric fallback on Xiaomi/OEM devices
- READ_EXTERNAL_STORAGE — read face data for verification
- WRITE_EXTERNAL_STORAGE — save face enrollment locally (Android 9 and below only)
- RECORD_AUDIO — reserved for future liveness detection
- WRITE_SETTINGS — WiFi settings (Android API 22 and below only)

---

## Hardware Features Required

- WiFi hardware — required (app will not install on devices without WiFi)
- Location hardware — required
- Camera — not required to install, but needed for face verification
- GPS — not required
- Fingerprint — not required
