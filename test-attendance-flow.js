/**
 * Attendance Flow End-to-End Test Script
 * 
 * Tests the full flow:
 *   1. Login as student (1234 / aditya)
 *   2. Capture face embedding from device camera
 *   3. Get current WiFi BSSID
 *   4. POST /api/attendance/check-in  (face + WiFi + timestamp)
 *   5. Simulate timer running (offline-sync every 30s for 3 minutes)
 *   6. POST /api/attendance/record    (save final lecture attendance)
 *   7. GET  /api/attendance/history/:enrollmentNo  (verify status)
 * 
 * Run: node test-attendance-flow.js
 * Requires: npm install node-fetch@2 wifi-name (or supply BSSID manually)
 */

const fetch = require('node-fetch');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SERVER = 'https://letsbunk-server.azurewebsites.net/';
const LOGIN_ID = '0000';
const LOGIN_PASSWORD = 'pranav';

// If you know your WiFi BSSID already, paste it here.
// Otherwise the script will try to read it via the wifi-name package.
const MANUAL_BSSID = 'fe:9f:1c:92:d7:8b'; // e.g. 'aa:bb:cc:dd:ee:ff'
// ─────────────────────────────────────────────────────────────────────────────

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const log = (tag, msg, data) => {
  const ts = new Date().toLocaleTimeString();
  console.log(`\n[${ts}] ${tag} ${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${SERVER}${path}`);
  return res.json();
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── STEP 1: LOGIN ────────────────────────────────────────────────────────────
async function login() {
  log('🔐', 'Logging in...', { id: LOGIN_ID });
  const data = await post('/api/login', { id: LOGIN_ID, password: LOGIN_PASSWORD });

  if (!data.success) {
    throw new Error(`Login failed: ${data.message}`);
  }

  log('✅', 'Login success', {
    name: data.user.name,
    enrollmentNo: data.user.enrollmentNo,
    semester: data.user.semester,
    branch: data.user.branch,
    hasFaceEnrolled: data.user.hasFaceEnrolled,
    faceEmbeddingLength: data.user.faceEmbedding?.length ?? 0
  });

  return data.user;
}

// ─── STEP 2: FACE EMBEDDING ───────────────────────────────────────────────────
// In a Node.js test script we can't open a camera directly.
// Strategy:
//   a) If the student already has a face embedding stored on the server (returned
//      at login), we reuse it — this is exactly what the mobile app does when it
//      compares the live capture against the stored embedding.
//   b) We flag this clearly so you know it's a "self-match" shortcut for testing.
//
// To test with a REAL live capture, run this on the device via the app instead.
function getFaceEmbedding(user) {
  if (user.faceEmbedding && user.faceEmbedding.length > 0) {
    log('📸', `Using stored face embedding (${user.faceEmbedding.length} floats) — self-match shortcut for Node.js test`);
    return user.faceEmbedding;
  }

  // No face enrolled — generate a dummy 128-float embedding so we can still
  // exercise the rest of the flow and see the exact server error message.
  log('⚠️', 'No face enrolled on server. Generating dummy embedding to probe server response.');
  return Array.from({ length: 128 }, () => Math.random() * 2 - 1);
}

// ─── STEP 3: WIFI BSSID ───────────────────────────────────────────────────────
async function getBSSID() {
  if (MANUAL_BSSID) {
    log('📶', `Using manually supplied BSSID: ${MANUAL_BSSID}`);
    return MANUAL_BSSID;
  }

  // Try wifi-name package (works on macOS/Linux, not Windows)
  try {
    const wifi = require('wifi-name');
    const name = await wifi();
    log('📶', `Connected WiFi SSID: ${name} — NOTE: wifi-name gives SSID not BSSID.`);
    log('⚠️', 'Cannot read BSSID from Node.js on most platforms. Set MANUAL_BSSID at the top of this file.');
    // Return a placeholder so the rest of the flow runs and shows the server error
    return '00:00:00:00:00:00';
  } catch {
    log('⚠️', 'wifi-name not available. Using placeholder BSSID 00:00:00:00:00:00');
    log('   ', 'Set MANUAL_BSSID at the top of this file to use your real BSSID.');
    return '00:00:00:00:00:00';
  }
}

// ─── STEP 4: CHECK-IN ─────────────────────────────────────────────────────────
async function checkIn(enrollmentNo, faceEmbedding, wifiBSSID) {
  log('📱', 'Sending check-in request...', { enrollmentNo, wifiBSSID, embeddingLen: faceEmbedding.length });

  const data = await post('/api/attendance/check-in', {
    enrollmentNo,
    faceEmbedding,
    wifiBSSID,
    timestamp: new Date().toISOString()
  });

  log(data.success ? '✅' : '❌', 'Check-in response', data);
  return data;
}

// ─── STEP 5: TIMER SIMULATION (offline-sync) ─────────────────────────────────
async function runTimer(enrollmentNo, lecture, durationSeconds = 180, syncIntervalSeconds = 30) {
  log('⏱️', `Starting timer simulation — ${durationSeconds}s total, syncing every ${syncIntervalSeconds}s`);

  let elapsed = 0;

  while (elapsed < durationSeconds) {
    const nextSync = Math.min(syncIntervalSeconds, durationSeconds - elapsed);
    log('⏳', `Waiting ${nextSync}s before next sync... (elapsed: ${elapsed}s)`);
    await sleep(nextSync * 1000);
    elapsed += nextSync;

    const data = await post('/api/attendance/offline-sync', {
      studentId: enrollmentNo,
      timerSeconds: elapsed,
      lecture,
      timestamp: new Date().toISOString(),
      isRunning: elapsed < durationSeconds,
      isPaused: false
    });

    log(data.success ? '🔄' : '❌', `Sync at ${elapsed}s`, {
      success: data.success,
      error: data.error,
      missedRandomRing: data.missedRandomRing ?? null
    });
  }

  log('🏁', `Timer simulation complete — total: ${elapsed}s`);
  return elapsed;
}

// ─── STEP 6: SAVE ATTENDANCE RECORD ──────────────────────────────────────────
async function saveAttendanceRecord(user, lecture, timerSeconds) {
  const totalClassTime = lecture.totalSeconds ? Math.floor(lecture.totalSeconds / 60) : 60;
  const totalAttended = Math.floor(timerSeconds / 60);
  const dayPercentage = totalClassTime > 0
    ? parseFloat(((totalAttended / totalClassTime) * 100).toFixed(1))
    : 0;
  const status = dayPercentage >= 75 ? 'present' : 'absent';

  const payload = {
    studentId: user.enrollmentNo,
    studentName: user.name,
    enrollmentNo: user.enrollmentNo,
    status,
    semester: user.semester,
    branch: user.branch,
    lectures: [{
      subject: lecture.subject,
      startTime: lecture.startTime,
      endTime: lecture.endTime,
      room: lecture.room,
      attended: totalAttended,
      total: totalClassTime,
      percentage: dayPercentage,
      present: dayPercentage >= 75
    }],
    totalAttended,
    totalClassTime,
    dayPercentage,
    clientDate: new Date().toISOString()
  };

  log('💾', 'Saving attendance record...', { status, totalAttended, totalClassTime, dayPercentage });
  const data = await post('/api/attendance/record', payload);
  log(data.success ? '✅' : '❌', 'Attendance record response', data);
  return data;
}

// ─── STEP 7: VERIFY STATUS ────────────────────────────────────────────────────
async function verifyAttendanceStatus(enrollmentNo) {
  log('🔍', `Fetching attendance history for ${enrollmentNo}...`);
  const data = await get(`/api/attendance/history/${enrollmentNo}`);

  if (!data.success) {
    log('❌', 'Failed to fetch history', data);
    return;
  }

  const today = new Date().toDateString();
  const todayRecord = data.records?.find(r => new Date(r.date).toDateString() === today);

  log('📊', 'Attendance history summary', {
    totalRecords: data.records?.length ?? 0,
    todayRecord: todayRecord
      ? {
          date: new Date(todayRecord.date).toDateString(),
          status: todayRecord.status,
          dayPercentage: todayRecord.dayPercentage,
          totalAttended: todayRecord.totalAttended,
          totalClassTime: todayRecord.totalClassTime,
          lectureCount: todayRecord.lectures?.length ?? 0
        }
      : '⚠️  No record found for today'
  });

  // Also hit the period-report endpoint
  const today8601 = new Date().toISOString().split('T')[0];
  const periodData = await get(
    `/api/attendance/period-report?enrollmentNo=${enrollmentNo}&date=${today8601}`
  );
  log('📋', 'Period-wise report for today', {
    success: periodData.success,
    records: periodData.records?.map(r => ({
      period: r.period,
      status: r.status,
      verificationType: r.verificationType
    })) ?? []
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('='.repeat(60));
  console.log('  LetsBunk Attendance Flow — End-to-End Test');
  console.log('='.repeat(60));

  try {
    // 1. Login
    const user = await login();

    // 2. Face embedding
    const faceEmbedding = getFaceEmbedding(user);

    // 3. WiFi BSSID
    const wifiBSSID = await getBSSID();

    // 4. Check-in
    const enrollmentNo = user.enrollmentNo || user.id || LOGIN_ID;
    const checkInResult = await checkIn(enrollmentNo, faceEmbedding, wifiBSSID);

    // Build a lecture object for the timer — use check-in response if available,
    // otherwise fall back to a generic placeholder so the timer still runs.
    const lecture = {
      subject: checkInResult.currentLecture?.subject ?? 'Test Subject',
      teacher: checkInResult.currentLecture?.teacher ?? 'Test Teacher',
      room: checkInResult.currentLecture?.room ?? 'Room 101',
      startTime: checkInResult.currentLecture?.startTime ?? new Date().toISOString(),
      endTime: checkInResult.currentLecture?.endTime ?? new Date(Date.now() + 3600000).toISOString(),
      totalSeconds: checkInResult.currentLecture?.totalSeconds ?? 3600
    };

    // 5. Run timer for 3 minutes (syncing every 30s)
    //    Reduce to 10s intervals if you want faster output: runTimer(..., 60, 10)
    const timerSeconds = await runTimer(enrollmentNo, lecture, 180, 30);

    // 6. Save final attendance record
    await saveAttendanceRecord({ ...user, enrollmentNo }, lecture, timerSeconds);

    // 7. Verify status
    await verifyAttendanceStatus(enrollmentNo);

    console.log('\n' + '='.repeat(60));
    console.log('  Test complete. Review the output above for issues.');
    console.log('='.repeat(60));

  } catch (err) {
    log('💥', 'Unhandled error', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();
