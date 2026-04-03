# LetsBunk: A Comprehensive Technical Thesis
## *Next-Generation Intelligent Attendance & Academic Transparency Ecosystem*

---

## 1. Abstract
**LetsBunk** is an integrated, high-integrity attendance management ecosystem designed to eliminate "proxy" attendance and streamline academic reporting in higher education. By leveraging a triad of technologies—**Wi-Fi Fingerprinting (BSSID)**, **Biometric Face Verification**, and **Real-Time Synchronous Communication**—LetsBunk transforms attendance from a manual, error-prone task into a passive, secure background process. This project comprises a hybrid mobile application for students and teachers, a native Android enrollment suite, and an Electron-based centralized administration panel, all powered by a robust Node.js and MongoDB backend.

---

## 2. Problem Statement & Motivation
### 2.1 The Crisis of Proxy Attendance
Traditional attendance systems (paper-based or simple QR codes) are vulnerable to "proxying," where one student marks attendance for an absent peer. This leads to:
- Diluted academic integrity.
- Inaccurate data for faculty decision-making.
- Administrative overhead in manually reconciling records.

### 2.2 The Solution: LetsBunk
LetsBunk addresses these by enforcing **Physical Presence Validation** through hardware-locked identifiers (BSSID) and **Identity Validation** through face-tracking.

---

## 3. System Architecture
LetsBunk follows a distributed architecture with a centralized source of truth.

### 3.1 Component Overview
1.  **The Attendance App (Hybrid React Native/Expo):**
    - The dual-role client for Students and Teachers.
    - Features a **Server-Driven UI (SDUI)** engine to allow real-time layout updates.
2.  **The Enrollment App (Native Android):**
    - A specialized tool for one-time biometric onboarding.
    - Interfaces directly with low-level Android camera APIs for high-fidelity face data extraction.
3.  **The Admin Panel (Electron/Web):**
    - Desktop-grade interface for managing institutional metadata (classrooms, Wi-Fi paths, course structures).
4.  **The Backend (Node.js/Express):**
    - A highly scalable API gateway managing state, security, and persistence.
    - Utilizes **Redis** for sub-millisecond response times in live session tracking.

### 3.2 Data Flow Architecture
- **Clients:** React Native (Students/Teachers) & Native Android (Enrollment).
- **Communication:** HTTP for state/configuration, Socket.io for live heartbeat.
- **Persistence:** MongoDB for historical records, Redis for active session caching.

---

## 4. Core Security & Verification Pillars

### 4.1 Wi-Fi BSSID Fingerprinting
Unlike standard Wi-Fi SSID (which can be easily spoofed using hotspots), LetsBunk tracks the **BSSID (Basic Service Set Identifier)**—the unique MAC address of the classroom's wireless access point.
- **Logic:** The app fetches the current BSSID using a custom Native Kotlin module (`NativeWiFiService`).
- **Validation:** Attendance is only recorded if the fetched BSSID matches the pre-configured hardware ID for the room assigned in the current timetable period.

### 4.2 Biometric Identity Verification
To prevent students from leaving their phones in class while they "bunk," the system triggers:
- **Initial Verification:** Proof of identity at the start of a lecture.
- **Random Liveness Checks:** Periodic facial verification prompts that require the user to be active within the app's geofence.

### 4.3 Grace Period Management
Recognizing the volatility of wireless signals, the system implements a **2-Minute Grace Period**. If a student's Wi-Fi disconnects due to a signal drop, the session is paused rather than terminated, allowing for seamless reconnection without penalizing the student.

---

## 5. Software Stack & Implementation

### 5.1 Backend: The Core Engine
- **Language/Framework:** Node.js, Express.js.
- **Database:** MongoDB (using Mongoose ODM) with complex indexing for attendance audits.
- **Real-time:** Socket.io for a "Heartbeat" mechanism between the Student App and Teacher Dashboard.
- **Storage:** Cloudinary for encrypted face profile storage.

### 5.2 Frontend: Hybrid Flexibility
- **React Native (Expo):** Allows for cross-platform deployment while maintaining access to native APIs via "Expo Modules."
- **SDUI Model:** The backend sends JSON configurations that dictate the UI layout (colors, text, button placement), allowing admins to "theme" the app for different departments dynamically.
- **State Management:** React Context API + AsyncStorage for offline persistence.

### 5.3 Desktop Management: Electron
- **Technology:** Electron.js wrapper around a React/Vite web application.
- **Purpose:** Native OS integration for exporting massive CSV reports and managing classroom-BSSID mapping with a local database cache.

---

## 6. Deep Dive into Features

### 6.1 Server-Driven UI (SDUI)
LetsBunk uses SDUI to minimize app updates. If the college wants to change the attendance "Start" button color from Blue to Cyan for a special event, it is changed on the server, and all clients reflect this instantly.

### 6.2 Intelligent Timetable Matching
The system doesn't just check for "any" Wi-Fi. It checks:
1.  **Current Local Time** vs. **Stored Timetable**.
2.  **Assigned Room Number** for the Current Period.
3.  **Authorized BSSID List** for that Room.
Only when all three intersect is the "Mark Attendance" button enabled.

### 6.3 Anti-Spoofing & Auditing
Every manual attendance correction by a teacher is logged in the `AttendanceAudit` collection. This creates an unalterable trail of "Who changed whose attendance and why," ensuring transparency and accountability.

---

## 7. Technical Challenges & Overcome Strategies

| Challenge | Strategy |
| :--- | :--- |
| **Android Location Permissions** | Implemented "Aggressive Permission Requests" with explanatory UI to satisfy Android 11+ BSSID requirements. |
| **Battery Consumption** | Used a optimized 10-second polling interval for WiFi state instead of continuous scanning. |
| **Offline Sync** | Implemented a "Sync Queue" so students in low-network areas can record attendance locally and upload when they reach a stronger signal. |
| **Data Staleness** | Used Redis to store active session heartbeats, ensuring the teacher sees a live student count with <1s latency. |

---

## 8. Future Roadmap
1.  **Predictive Analytics:** AI models to predict student failure risk based on attendance patterns and bunking trends.
2.  **LMS Integration:** Two-way sync with Moodle/Canvas.
3.  **NFC Hybridization:** Using NFC tags at classroom doors as a tertiary verification layer.

---

## 9. Conclusion
LetsBunk represents a paradigm shift in institutional management. By combining hardware-level verification with modern web technologies, it provides a "trust-but-verify" environment that benefits students, teachers, and administrators alike. It is not just an attendance app; it is a comprehensive ecosystem for academic discipline and operational efficiency.

---
*Created by the LetsBunk Development Team*
*March 2026*
