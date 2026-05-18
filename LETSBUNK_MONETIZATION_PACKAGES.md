# 🏆 LetsBunk Subscription Ecosystem: Monetization Packages & Human Features

Welcome to the official **LetsBunk Monetization & Subscription Architecture**. This proposal introduces three tiers of structured, value-added subscription plans designed around the **LetsBunk** technical architecture. Each package is tailored to address specific user needs, incorporating both students' daily lifestyle requirements ("human features") and the technical capabilities of our intelligent background verification pillars.

---

## 📊 Overview: LetsBunk Subscription Matrix

| Feature | ☕ Bunk-Pilot (Free) | 🏃 Shuttle-Relay Plus (Pro) | 👑 Bunk-Overlord (Elite) |
| :--- | :---: | :---: | :---: |
| **Pricing** | **$0.00 / Free** | **$2.99 / Month** | **$6.99 / Month** |
| **BSSID WiFi Tracking** | Standard | Standard + Shared | Auto-Pilot Geofenced |
| **Verification Loop** | Initial Face Verify | Multi-Factor (Face + WiFi) | Hardware Redundancy Resilient |
| **Shuttle Relay** | ❌ None | ✅ Full Catch-Up Enabled | ✅ Unlimited Catch-Up & Alerts |
| **Bunk Calculator** | Basic | AI-Predictive | Real-time Risk Assessment |
| **Sync Queue Cache** | 5 Records | 30 Days Cached | Infinite Resilient Cache |
| **Digital Lanyard Card** | Default Theme | Premium Skins | Fully Customizable SDUI |

---

## ☕ 1. Bunk-Pilot (The "Stay Safe" Tier)
> [!NOTE]
> Designed for the casual student who wants clean, reliable, and honest attendance tracking without administrative friction.

### 🌟 Human-Centric Value Proposition
Provides the essential, bulletproof foundation for everyday college life. It ensures students' presence is recorded securely and automatically synced to the campus database.

### 🛠️ Core Technical Features
* **BSSID Local Verification:** Standard matching of the student's active connected WiFi MAC address against the authorized access point for the assigned lecture room.
* **Basic Offline Timer:** Dynamic foreground service that counts attendance seconds securely during verified periods.
* **2-Minute Grace Period:** Standard protection against network fluctuations—automatically pauses the timer instead of terminating the attendance session during temporary WiFi drops.
* **Visual Calendar Heatmap:** Access to the standard graphical calendar screen displaying present/absent color codes for active subjects.
* **Subject Limit:** Up to 3 core subjects tracked concurrently.

---

## 🏃 2. Shuttle-Relay Plus (The "Team Captain" Tier)
> [!TIP]
> Built for the collaborative students who work together to keep their attendance perfectly optimized above the mandatory 75% university threshold.

### 🌟 Human-Centric Value Proposition
Perfect for students who occasionally run late but want to keep their attendance record pristine. It integrates collaborative verification and premium catches that make bunking an exact science.

### 🛠️ Core Technical Features
* **Partner/Couple Shuttle Relay Loop:** Fully unlocks the newly implemented Shuttle Relay mechanism! If marked present manually, the student receives the 75% baseline immediately on the server, while their active timer continues running in the background to dynamically catch up and advance their attendance to **76%, 80%, or even 100%**.
* **Peer-to-Peer Beacon Vouching:** If a student's WiFi fails the BSSID check due to congested routers, a verified classmate in the same room can send an encrypted Bluetooth "Beacon vouch" to validate their presence instantly.
* **AI Bunk Predictor Engine:** Calculates the precise number of classes a student can safely bunk based on subject trends, historical professor leniency, and current semester analytics.
* **Random Ring Alert Radar:** Predicts the most likely window for a teacher's random liveness prompt during a lecture (e.g. *"90% of random rings for this period occur in the first 25 minutes"*).
* **Collaborative Whitelist:** Share verified BSSID access points with classmates in the syndicate to instantly sync local timetable mappings.

---

## 👑 3. Bunk-Overlord (The "Syndicate Supreme" Tier)
> [!IMPORTANT]
> The ultimate defense suite for academic peace of mind. Provides complete automation, bulletproof database persistence, and real-time administrative intelligence.

### 🌟 Human-Centric Value Proposition
For the master academic strategist who wants absolute peace of mind. It turns attendance tracking into a passive background process that requires zero manual interaction, while keeping the student ahead of any faculty modifications.

### 🛠️ Core Technical Features
* **Auto-Pilot Geofence Trigger:** Automatically starts and halts the countdown timer the moment the student crosses the verified BSSID gateway of the classroom—no manual taps or app opening required!
* **Hardware Redundancy Keystore Resiliency:** Utilizes the native Android keystore to store hardware-locked redundant timer states. If the phone gets rebooted, runs out of battery, or is force-killed by battery-saving operating systems, the timer seamlessly recovers its exact state.
* **Professor Override Webhook:** Receives instant, high-priority push notifications and WhatsApp/Telegram alerts the exact millisecond a teacher opens the manual override panel in the teacher dashboard.
* **Grace-Period Multiplier:** Extends the standard Wi-Fi loss grace period from 2 minutes up to **10 minutes**, accommodating deep campus corridors with poor signal penetration.
* **Premium SDUI Lanyard Creator:** Unlock full customization of the digital Student ID Lanyard Card with dynamic college branding themes, glassmorphism card templates, and real-time QR credentials.
* **Syndicate Dashboard:** Unlimited subjects, priority database sync queues, ad-free UI, and institutional-grade CSV/PDF spreadsheet exports for academic coordinators.

---

## 🎨 Premium UI Theme Showcase (Server-Driven UI Designs)

````carousel
```json
{
  "theme": "Bunk-Pilot (Free)",
  "primaryColor": "#6C5CE7",
  "backgroundColor": "#1E1E24",
  "accentColor": "#00DEC9",
  "glassmorphism": false,
  "lanyardCardStyle": "Standard Flat Color"
}
```
<!-- slide -->
```json
{
  "theme": "Shuttle-Relay Plus (Pro)",
  "primaryColor": "#FF7675",
  "backgroundColor": "#0F0F13",
  "accentColor": "#FFEAA7",
  "glassmorphism": true,
  "lanyardCardStyle": "Dynamic Glass Card"
}
```
<!-- slide -->
```json
{
  "theme": "Bunk-Overlord (Elite)",
  "primaryColor": "#00DEC9",
  "backgroundColor": "#09090D",
  "accentColor": "#FF7675",
  "glassmorphism": true,
  "lanyardCardStyle": "Futuristic Neon Hologram"
}
```
````

---
> *Empowering academic balance, one class at a time.*  
> **LetsBunk Development Syndicate — 2026**
