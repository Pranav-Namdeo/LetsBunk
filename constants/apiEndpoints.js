// ============================================================
// API ENDPOINTS — SINGLE SOURCE OF TRUTH
// DO NOT hardcode endpoint strings anywhere else in the project.
// All additions, renames, or removals happen HERE only.
//
// Generated from server.js route audit — 2026-05-07
// ============================================================

import { SERVER_BASE_URL } from '../config';

const BASE_URL = SERVER_BASE_URL;

export const API_BASE = BASE_URL;

// ----------------------------
// Health & Root
// ----------------------------
export const GET_HEALTH = `${BASE_URL}/api/health`;
export const GET_TIME   = `${BASE_URL}/api/time`;

// ----------------------------
// Authentication
// ----------------------------
export const POST_LOGIN          = `${BASE_URL}/api/login`;
export const POST_REFRESH_PROFILE = `${BASE_URL}/api/refresh-profile`;

// ----------------------------
// Configuration — App / SDUI
// ----------------------------
export const GET_CONFIG              = `${BASE_URL}/api/config`;
export const GET_CONFIG_APP          = `${BASE_URL}/api/config/app`;
export const GET_CONFIG_ACADEMIC_YEAR = `${BASE_URL}/api/config/academic-year`;

// ----------------------------
// Configuration — Branches
// ----------------------------
export const GET_CONFIG_BRANCHES         = `${BASE_URL}/api/config/branches`;
export const POST_CONFIG_BRANCHES        = `${BASE_URL}/api/config/branches`;
export const PUT_CONFIG_BRANCH_BY_ID     = (id)         => `${BASE_URL}/api/config/branches/${id}`;
export const DELETE_CONFIG_BRANCH        = (identifier) => `${BASE_URL}/api/config/branches/${identifier}`;

// ----------------------------
// Configuration — Semesters
// ----------------------------
export const GET_CONFIG_SEMESTERS        = `${BASE_URL}/api/config/semesters`;
export const POST_CONFIG_SEMESTERS       = `${BASE_URL}/api/config/semesters`;
export const DELETE_CONFIG_SEMESTER      = (identifier) => `${BASE_URL}/api/config/semesters/${identifier}`;

// ----------------------------
// Configuration — Departments
// ----------------------------
export const GET_CONFIG_DEPARTMENTS      = `${BASE_URL}/api/config/departments`;
export const POST_CONFIG_DEPARTMENTS     = `${BASE_URL}/api/config/departments`;
export const PUT_CONFIG_DEPARTMENT_BY_ID = (id)         => `${BASE_URL}/api/config/departments/${id}`;
export const DELETE_CONFIG_DEPARTMENT    = (identifier) => `${BASE_URL}/api/config/departments/${identifier}`;

// ----------------------------
// Students
// ----------------------------
export const GET_STUDENTS              = `${BASE_URL}/api/students`;
export const POST_STUDENTS             = `${BASE_URL}/api/students`;
export const POST_STUDENTS_BULK        = `${BASE_URL}/api/students/bulk`;
export const PUT_STUDENT_BY_ID         = (id)        => `${BASE_URL}/api/students/${id}`;
export const DELETE_STUDENT_BY_ID      = (id)        => `${BASE_URL}/api/students/${id}`;
export const GET_STUDENT_FACE_DATA     = (studentId) => `${BASE_URL}/api/students/${studentId}/face-data`;
export const GET_STUDENT_MANAGEMENT    = `${BASE_URL}/api/student-management`;
export const GET_STUDENT_VALIDATE      = `${BASE_URL}/api/student/validate`;
export const GET_VIEW_RECORDS_STUDENTS = `${BASE_URL}/api/view-records/students`;

// ----------------------------
// Teachers
// ----------------------------
export const GET_TEACHERS                      = `${BASE_URL}/api/teachers`;
export const POST_TEACHERS                     = `${BASE_URL}/api/teachers`;
export const POST_TEACHERS_BULK                = `${BASE_URL}/api/teachers/bulk`;
export const PUT_TEACHER_BY_ID                 = (id)        => `${BASE_URL}/api/teachers/${id}`;
export const PUT_TEACHER_TIMETABLE_ACCESS      = (id)        => `${BASE_URL}/api/teachers/${id}/timetable-access`;
export const DELETE_TEACHER_BY_ID              = (id)        => `${BASE_URL}/api/teachers/${id}`;
export const GET_TEACHER_CURRENT_LECTURE       = (teacherId) => `${BASE_URL}/api/teacher/current-lecture/${teacherId}`;
export const GET_TEACHER_ALLOWED_BRANCHES      = (teacherId) => `${BASE_URL}/api/teacher/allowed-branches/${teacherId}`;
export const GET_TEACHER_CURRENT_CLASS_STUDENTS = (teacherId) => `${BASE_URL}/api/teacher/current-class-students/${teacherId}`;
export const GET_TEACHER_SCHEDULE              = (teacherId, day) => `${BASE_URL}/api/teacher-schedule/${teacherId}/${day}`;

// ----------------------------
// Departments (teacher filter)
// ----------------------------
export const GET_DEPARTMENTS = `${BASE_URL}/api/departments`;

// ----------------------------
// Timetable
// ----------------------------
export const GET_TIMETABLES                    = `${BASE_URL}/api/timetables`;
export const GET_TIMETABLE_BY_SEMESTER_BRANCH  = (semester, branch) => `${BASE_URL}/api/timetable/${semester}/${branch}`;
export const GET_TIMETABLE_CURRENT_PERIOD      = `${BASE_URL}/api/timetable/current-period`;
export const POST_TIMETABLE                    = `${BASE_URL}/api/timetable`;
export const PUT_TIMETABLE_BY_SEMESTER_BRANCH  = (semester, branch) => `${BASE_URL}/api/timetable/${semester}/${branch}`;

// ----------------------------
// Periods
// ----------------------------
export const GET_PERIODS            = `${BASE_URL}/api/periods`;
export const POST_PERIODS_UPDATE_ALL = `${BASE_URL}/api/periods/update-all`;

// ----------------------------
// Subjects
// ----------------------------
export const GET_SUBJECTS            = `${BASE_URL}/api/subjects`;
export const POST_SUBJECTS           = `${BASE_URL}/api/subjects`;
export const GET_SUBJECT_BY_CODE     = (code) => `${BASE_URL}/api/subjects/${code}`;
export const PUT_SUBJECT_BY_CODE     = (code) => `${BASE_URL}/api/subjects/${code}`;
export const DELETE_SUBJECT_BY_CODE  = (code) => `${BASE_URL}/api/subjects/${code}`;
export const GET_SUBJECTS_GROUPED    = `${BASE_URL}/api/subjects/grouped/by-semester-branch`;
export const PUT_SUBJECTS_BULK_UPDATE = `${BASE_URL}/api/subjects/bulk-update`;

// ----------------------------
// Attendance — Core Reports
// ----------------------------
export const GET_ATTENDANCE_STATS          = `${BASE_URL}/api/attendance/stats`;
export const GET_ATTENDANCE_BY_DATE        = (date)            => `${BASE_URL}/api/attendance/date/${date}`;
export const GET_ATTENDANCE_BY_DATE_SUBJECT = (date, subject)  => `${BASE_URL}/api/attendance/date/${date}/subject/${subject}`;
export const GET_ATTENDANCE_PERIOD_REPORT  = `${BASE_URL}/api/attendance/period-report`;
export const GET_ATTENDANCE_DAILY_REPORT   = `${BASE_URL}/api/attendance/daily-report`;
export const GET_ATTENDANCE_MONTHLY_REPORT = `${BASE_URL}/api/attendance/monthly-report`;
export const GET_ATTENDANCE_EXPORT         = `${BASE_URL}/api/attendance/export`;
export const GET_ATTENDANCE_AUDIT_TRAIL    = `${BASE_URL}/api/attendance/audit-trail`;
export const GET_ATTENDANCE_RECORDS        = `${BASE_URL}/api/attendance/records`;
export const GET_ATTENDANCE_DATE_RANGE     = `${BASE_URL}/api/attendance/date-range`;
export const GET_ATTENDANCE_SUMMARY        = (enrollmentNo) => `${BASE_URL}/api/attendance/summary/${enrollmentNo}`;
export const GET_ATTENDANCE_ALL            = `${BASE_URL}/api/attendance/all`;

// ----------------------------
// Attendance — Student Detail
// ----------------------------
export const GET_STUDENT_ATTENDANCE_DATES          = (enrollmentNo)              => `${BASE_URL}/api/attendance/student/${enrollmentNo}/dates`;
export const GET_STUDENT_ATTENDANCE_BY_DATE        = (enrollmentNo, date)        => `${BASE_URL}/api/attendance/student/${enrollmentNo}/date/${date}`;
export const GET_STUDENT_ATTENDANCE_BY_DATE_PERIOD = (enrollmentNo, date, period) => `${BASE_URL}/api/attendance/student/${enrollmentNo}/date/${date}/lecture/${period}`;
export const GET_STUDENT_ATTENDANCE_SUBJECT_STATS  = (enrollmentNo)              => `${BASE_URL}/api/attendance/student/${enrollmentNo}/subject-stats`;

// ----------------------------
// Attendance — Teacher View
// ----------------------------
export const GET_ATTENDANCE_SUBJECTS        = `${BASE_URL}/api/attendance/subjects`;
export const GET_ATTENDANCE_SUBJECT_DATES   = `${BASE_URL}/api/attendance/subject-dates`;
export const GET_TEACHER_ATTENDANCE_LECTURES = (teacherId) => `${BASE_URL}/api/attendance/teacher/${teacherId}/lectures`;

// ----------------------------
// Attendance — Actions
// ----------------------------
export const POST_ATTENDANCE_CHECK_IN             = `${BASE_URL}/api/attendance/check-in`;
// POST_ATTENDANCE_RECORD → redirected to period-sync (old /api/attendance/record endpoint removed)
export const POST_ATTENDANCE_RECORD               = `${BASE_URL}/api/attendance/period-sync`;
export const POST_ATTENDANCE_OFFLINE_SYNC         = `${BASE_URL}/api/attendance/offline-sync`;
export const POST_ATTENDANCE_PERIOD_SYNC          = `${BASE_URL}/api/attendance/period-sync`;
export const POST_ATTENDANCE_RANDOM_RING_RESPONSE = `${BASE_URL}/api/attendance/random-ring-response`;
export const POST_ATTENDANCE_MANUAL_MARK          = `${BASE_URL}/api/attendance/manual-mark`;
export const POST_ATTENDANCE_START_SESSION        = `${BASE_URL}/api/attendance/period-sync`;   // ← was /start-session (dead) → period-sync
export const POST_ATTENDANCE_LECTURE_START        = `${BASE_URL}/api/attendance/period-sync`;   // ← was /lecture-start (dead) → period-sync
export const POST_ATTENDANCE_LECTURE_END          = `${BASE_URL}/api/attendance/offline-sync`;  // ← was /lecture-end (dead) → offline-sync
export const POST_ATTENDANCE_ADD_VERIFICATION     = `${BASE_URL}/api/random-ring/verify`;       // ← was /add-verification (dead) → random-ring/verify

// ----------------------------
// Attendance — History
// ----------------------------
export const GET_ATTENDANCE_HISTORY        = (enrollmentNo) => `${BASE_URL}/api/attendance/history/${enrollmentNo}`;
export const POST_ATTENDANCE_HISTORY_PERIOD = `${BASE_URL}/api/attendance/period-sync`;         // ← was /history/period (dead) → period-sync

// ----------------------------
// Attendance — Management
// ----------------------------
export const GET_ATTENDANCE_MANAGE                = `${BASE_URL}/api/attendance/manage`;
export const POST_ATTENDANCE_MANAGE               = `${BASE_URL}/api/attendance/manage`;
export const POST_ATTENDANCE_MANAGE_BULK_OPERATION = `${BASE_URL}/api/attendance/manage/bulk-operation`;
export const PUT_ATTENDANCE_MANAGE_BY_ID          = (recordId) => `${BASE_URL}/api/attendance/manage/${recordId}`;
export const PUT_ATTENDANCE_MANAGE_BULK           = `${BASE_URL}/api/attendance/manage/bulk`;
export const DELETE_ATTENDANCE_MANAGE_BY_ID       = (recordId) => `${BASE_URL}/api/attendance/manage/${recordId}`;
export const POST_ATTENDANCE_CALCULATE_DAILY      = `${BASE_URL}/api/attendance/offline-sync`;  // ← was /calculate-daily (dead) → offline-sync recalculates

// ----------------------------
// WiFi / BSSID
// ----------------------------
export const POST_ATTENDANCE_WIFI_EVENT      = `${BASE_URL}/api/attendance/check-in`;           // ← was /wifi-event (dead) → check-in handles WiFi
export const POST_ATTENDANCE_VALIDATE_BSSID  = `${BASE_URL}/api/attendance/check-in`;           // ← was /validate-bssid (dead) → check-in validates BSSID
export const GET_ATTENDANCE_AUTHORIZED_BSSID = (studentId) => `${BASE_URL}/api/attendance/authorized-bssid/${studentId}`;
export const GET_DAILY_BSSID_SCHEDULE        = `${BASE_URL}/api/daily-bssid-schedule`;

// ----------------------------
// Random Ring
// ----------------------------
export const POST_RANDOM_RING                       = `${BASE_URL}/api/random-ring`;
export const POST_RANDOM_RING_VERIFY                = `${BASE_URL}/api/random-ring/verify`;
export const POST_RANDOM_RING_VERIFY_DIRECT         = `${BASE_URL}/api/random-ring/verify-direct`;
export const POST_RANDOM_RING_VERIFY_AFTER_REJECTION = `${BASE_URL}/api/random-ring/verify-after-rejection`;
export const POST_RANDOM_RING_TEACHER_ACTION        = `${BASE_URL}/api/random-ring/teacher-action`;
export const GET_RANDOM_RING_HISTORY                = (teacherId) => `${BASE_URL}/api/random-ring/history/${teacherId}`;

// ----------------------------
// Face Enrollment & Verification
// ----------------------------
export const GET_ENROLLMENTS        = `${BASE_URL}/api/enrollments`;
export const GET_ENROLLMENT_BY_NO   = (enrollmentNo) => `${BASE_URL}/api/enrollment/${enrollmentNo}`;
export const POST_ENROLLMENT        = `${BASE_URL}/api/enrollment`;
export const POST_ENROLLMENT_VERIFY = `${BASE_URL}/api/enrollment/verify`;
export const PUT_ENROLLMENT_BY_NO   = (enrollmentNo) => `${BASE_URL}/api/enrollment/${enrollmentNo}`;
export const DELETE_ENROLLMENT_BY_NO = (enrollmentNo) => `${BASE_URL}/api/enrollment/${enrollmentNo}`;
export const POST_VERIFY_FACE       = `${BASE_URL}/api/random-ring/verify-direct`;              // ← was /verify-face (dead) → random-ring/verify-direct
export const POST_VERIFY_FACE_PROOF = `${BASE_URL}/api/random-ring/verify-after-rejection`;    // ← was /verify-face-proof (dead) → verify-after-rejection
export const GET_FACE_DESCRIPTOR    = (userId)   => `${BASE_URL}/api/face-descriptor/${userId}`;
export const POST_UPLOAD_PHOTO      = `${BASE_URL}/api/upload-photo`;
export const GET_PHOTO              = (filename) => `${BASE_URL}/api/photo/${filename}`;

// ----------------------------
// Settings
// ----------------------------
export const GET_SETTINGS                        = `${BASE_URL}/api/settings`;
export const GET_SETTINGS_ATTENDANCE_THRESHOLD   = `${BASE_URL}/api/settings/attendance-threshold`;
export const POST_SETTINGS_ATTENDANCE_THRESHOLD  = `${BASE_URL}/api/settings/attendance-threshold`;
export const PUT_SETTINGS_ATTENDANCE_THRESHOLD   = `${BASE_URL}/api/settings/attendance-threshold`;

// ----------------------------
// Holidays
// ----------------------------
export const GET_HOLIDAYS        = `${BASE_URL}/api/holidays`;
export const GET_HOLIDAYS_RANGE  = `${BASE_URL}/api/holidays/range`;
export const POST_HOLIDAYS       = `${BASE_URL}/api/holidays`;
export const PUT_HOLIDAY_BY_ID   = (id) => `${BASE_URL}/api/holidays/${id}`;
export const DELETE_HOLIDAY_BY_ID = (id) => `${BASE_URL}/api/holidays/${id}`;

// ----------------------------
// Classrooms
// ----------------------------
export const GET_CLASSROOMS         = `${BASE_URL}/api/classrooms`;
export const POST_CLASSROOMS        = `${BASE_URL}/api/classrooms`;
export const PUT_CLASSROOM_BY_ID    = (id) => `${BASE_URL}/api/classrooms/${id}`;
export const DELETE_CLASSROOM_BY_ID = (id) => `${BASE_URL}/api/classrooms/${id}`;

// ----------------------------
// Timetable History
// ----------------------------
export const GET_TIMETABLE_HISTORY_DAY       = `${BASE_URL}/api/timetable-history/day`;
export const POST_TIMETABLE_HISTORY_BACKFILL = `${BASE_URL}/api/timetable-history/backfill`;

// ----------------------------
// Database Management (Admin Only)
// ----------------------------
export const POST_DB_MIGRATE           = `${BASE_URL}/api/db/migrate`;
export const POST_DB_RESYNC_ATTENDANCE = `${BASE_URL}/api/db/resync-attendance`;
export const POST_DB_WIPE_ALL          = `${BASE_URL}/api/db/resync-attendance`;  // ← /wipe-all removed; use scripts/format-database.js for full wipe

// ----------------------------
// Admin Utilities
// ----------------------------
export const POST_ADMIN_PURGE_ORPHAN_SUBJECTS = `${BASE_URL}/api/admin/purge-orphan-subjects`;

// ----------------------------
// Legacy / Deprecated
// NOTE: These routes are called from admin-panel/main.js but are NOT
// registered in server.js. They are documented here for visibility.
// Either implement them in server.js or remove the calls in main.js.
// ----------------------------
export const DELETE_STUDENTS_ALL  = `${BASE_URL}/api/students/delete-all`;  // ⚠️ NOT IMPLEMENTED in server.js
export const DELETE_TEACHERS_ALL  = `${BASE_URL}/api/teachers/delete-all`;  // ⚠️ NOT IMPLEMENTED in server.js
