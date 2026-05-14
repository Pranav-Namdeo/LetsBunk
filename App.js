import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  Animated, TextInput, ScrollView, FlatList, AppState, useColorScheme, Image, Modal, RefreshControl, PermissionsAndroid, Platform, Alert, NativeModules, Vibration
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import OfflineTimerService from './OfflineTimerService';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import BottomNavigation from './BottomNavigation';
import CalendarScreen from './CalendarScreen';
import ProfileScreen from './ProfileScreen';
import TimetableScreen from './TimetableScreen';
import NotificationsScreen from './NotificationsScreen';
import LanyardCard from './LanyardCard';
import { SunIcon, MoonIcon, LogoutIcon, RefreshIcon } from './Icons';
import { initializeServerTime, getServerTime } from './ServerTime';
import FloatingBrandButton from './FloatingBrandButton';
// New Teacher UI Components
import TeacherHeader from './TeacherHeader';
import StudentSearch from './StudentSearch';
import StudentList from './StudentList';
import StudentProfileDialog from './StudentProfileDialog';
import TeacherProfileDialog from './TeacherProfileDialog';
import RandomRingDialog from './RandomRingDialog';
import TimetableSelector from './TimetableSelector';
import ViewRecords from './ViewRecords';
import Notifications from './Notifications';
import Updates from './Updates';
import HelpAndSupport from './HelpAndSupport';
import Feedback from './Feedback';
import SemesterSelector from './SemesterSelector';
import WiFiManager from './WiFiManager';
import NativeWiFiService from './NativeWiFiService';
import TestBSSID from './TestBSSID';
import SecurityStatusIndicator from './SecurityStatusIndicator';
// WiFi BSSID Integration from LetsBunk
import SecureStorage from './SecureStorage';
import BSSIDStorage from './BSSIDStorage';
// Face Verification Module
import FaceVerification from './FaceVerification';
import CircularTimer from './CircularTimer';
import { requestStartupPermissions } from './PermissionManager';
import LoginScreen from './LoginScreen';
import SplashScreenView from './SplashScreen';
import { showToast, ToastContainer } from './Toast';

// Configuration - Import from centralized config
import { SERVER_BASE_URL, API_URL as CONFIG_API_URL, SOCKET_URL as CONFIG_SOCKET_URL } from './config';

import { GET_ATTENDANCE_RECORDS, GET_ATTENDANCE_STATS, GET_CONFIG_APP, GET_DAILY_BSSID_SCHEDULE, GET_HEALTH, GET_STUDENT_MANAGEMENT, GET_STUDENT_VALIDATE, GET_TEACHER_CURRENT_CLASS_STUDENTS, GET_TIMETABLE_BY_SEMESTER_BRANCH, GET_VIEW_RECORDS_STUDENTS, POST_ATTENDANCE_OFFLINE_SYNC, POST_ATTENDANCE_PERIOD_SYNC, POST_ATTENDANCE_RANDOM_RING_RESPONSE, POST_ATTENDANCE_RECORD, POST_LOGIN, POST_RANDOM_RING, POST_RANDOM_RING_TEACHER_ACTION, POST_RANDOM_RING_VERIFY_AFTER_REJECTION, POST_RANDOM_RING_VERIFY_DIRECT, POST_REFRESH_PROFILE, POST_TIMETABLE } from './constants/apiEndpoints';
// Use Constants.expoConfig.extra for environment variables in Expo SDK 51
const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL || CONFIG_API_URL;
const SOCKET_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SOCKET_URL || CONFIG_SOCKET_URL;

// Constants
const CACHE_KEY = '@timer_config';
const ROLE_KEY = '@user_role';
const STUDENT_ID_KEY = '@student_id';
const STUDENT_NAME_KEY = '@student_name';
const SEMESTER_KEY = '@user_semester';
const BRANCH_KEY = '@user_branch';

// Timing constants (in milliseconds)
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const INITIAL_HEARTBEAT_DELAY = 60 * 1000; // 1 minute
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const WIFI_CHECK_INTERVAL = 30000; // 30 seconds
const USER_DATA_KEY = '@user_data';
const LOGIN_ID_KEY = '@login_id';
const THEME_KEY = '@app_theme';
const DAILY_VERIFICATION_KEY = '@daily_verification';

// Initialize ServerTime at module load so getServerTime() never throws before useEffect runs
initializeServerTime(SOCKET_URL);

const normalizeStudentUserData = (user) => {
  if (!user || user.role !== 'student') return user;
  const normalizedBranch = user.branch ?? user.course ?? '';
  const normalizedSemester = user.semester != null ? user.semester.toString() : '';
  return {
    ...user,
    branch: normalizedBranch,
    course: normalizedBranch,
    semester: normalizedSemester,
  };
};

// ── Spoof-proof monotonic clock (time since device boot) ─────────────────────
// Uses SystemClock.elapsedRealtime() via TimerModule — cannot be changed by
// adjusting device date/time. Falls back to Date.now() only if native unavailable.
const { TimerModule: _NativeTimerModule } = NativeModules;
let _appBootMsCache = 0;
let _appBootMsCacheAt = 0;
async function _refreshAppBootCache() {
  try {
    if (_NativeTimerModule && _NativeTimerModule.getBootElapsedMs) {
      const { bootElapsedMs } = await _NativeTimerModule.getBootElapsedMs();
      _appBootMsCache = bootElapsedMs;
      _appBootMsCacheAt = Date.now();
    }
  } catch (_) { }
}
function _appGetBootMs() {
  if (_appBootMsCache > 0) {
    return _appBootMsCache + Math.max(0, Date.now() - _appBootMsCacheAt);
  }
  return Date.now(); // fallback only if native unavailable
}
// Warm up cache immediately on module load
_refreshAppBootCache();

// Theme colors
const THEMES = {
  // ── Warm (matches login repo color palette) ───────────────────
  warm: {
    background: '#E8DCC4',
    cardBackground: '#DDD0B3',
    text: '#030213',
    textSecondary: 'rgba(3,2,19,0.6)',
    primary: '#030213',
    border: 'rgba(0,0,0,0.1)',
    statusBar: 'dark',
    label: 'Warm',
    emoji: '☀️',
  },

  // ── Night (black/grey dark mode) ──────────────────────────────
  night: {
    background: '#111111',
    cardBackground: '#1e1e1e',
    text: '#f0f0f0',
    textSecondary: '#9a9a9a',
    primary: '#ffffff',
    border: '#333333',
    statusBar: 'light',
    label: 'Night',
    emoji: '🌙',
  },
};

const THEME_GROUPS = [
  { label: '☀️ Warm', keys: ['warm'] },
  { label: '🌙 Night', keys: ['night'] },
];

const getDefaultConfig = () => ({
  roleSelection: {
    backgroundColor: '#E8DCC4',
    title: { text: 'Who are you?', fontSize: 36, color: '#030213', fontWeight: 'bold' },
    subtitle: { text: 'Select your role to continue', fontSize: 16, color: '#00d9ff' },
    roles: [
      { id: 'student', text: 'Student', icon: '🎓', backgroundColor: '#00d9ff', textColor: '#0a1628' },
      { id: 'teacher', text: 'Teacher', icon: '👨‍🏫', backgroundColor: '#00bfff', textColor: '#0a1628' }
    ]
  },
  studentNameInput: {
    backgroundColor: '#0a1628',
    title: { text: 'Enter Your Name', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
    subtitle: { text: 'This will be visible to your teacher', fontSize: 14, color: '#00d9ff' },
    placeholder: 'Your Name',
    buttonText: 'START SESSION',
    inputBackgroundColor: '#0d1f3c',
    inputTextColor: '#00f5ff',
    inputBorderColor: '#00d9ff'
  },
  studentScreen: {
    backgroundColor: '#0a1628',
    title: { text: 'Countdown Timer', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
    timer: { duration: 120, backgroundColor: '#0d1f3c', textColor: '#00f5ff', fontSize: 72, borderRadius: 20 },
    buttons: [
      { id: 'startPause', text: 'START', pauseText: 'PAUSE', backgroundColor: '#00f5ff', textColor: '#0a1628', fontSize: 18 },
      { id: 'reset', text: 'RESET', backgroundColor: '#00d9ff', textColor: '#0a1628', fontSize: 18 }
    ]
  },
  teacherScreen: {
    backgroundColor: '#0a1628',
    title: { text: 'Live Attendance', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
    subtitle: { text: 'Real-time student tracking', fontSize: 16, color: '#00d9ff' },
    statusColors: { attending: '#00ff88', absent: '#ff4444', present: '#00d9ff' },
    cardBackgroundColor: '#0d1f3c',
    cardBorderColor: '#00d9ff'
  }
});

export default function App() {
  console.log('🚀🚀🚀 APP COMPONENT LOADED 🚀🚀🚀');
  const [config, setConfig] = useState(getDefaultConfig());
  const [selectedRole, setSelectedRole] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [students, setStudents] = useState([]);

  const [semester, setSemester] = useState(null);
  const [branch, setBranch] = useState(null);

  // Timer state (deprecated - kept for compatibility with period-based system)
  const [isRunning] = useState(false); // Always false in period-based system

  // Party popper state — shown when attendance threshold is reached
  const [showPartyPopper, setShowPartyPopper] = useState(false);
  const prevAttendanceStatus = useRef(null);

  // Offline Timer Service state
  const [offlineTimerState, setOfflineTimerState] = useState({
    isRunning: false,
    isPaused: false,
    timerSeconds: 0,
    currentLecture: null,
    isOnline: true,
    hasInternetConnection: true,
    isConnectedToAuthorizedWiFi: false,
    lastSyncTime: null,
    queuedSyncs: 0,
    pendingSyncCount: 0
  });
  const [offlineTimerInitialized, setOfflineTimerInitialized] = useState(false);
  
  // Segment timer data for CircularTimer (timer data for each period)
  const [segmentTimerData, setSegmentTimerData] = useState(null);
  
  // Current period number (1-based) for CircularTimer highlighting
  const [currentPeriodNumber, setCurrentPeriodNumber] = useState(null);
  
  // Past period viewing mode - when user taps a segment to see past timer data
  const [viewingPastPeriod, setViewingPastPeriod] = useState(false);
  const [pastPeriodData, setPastPeriodData] = useState(null);

  // Fire party popper when attendance status transitions to 'present'
  useEffect(() => {
    const current = offlineTimerState.attendanceStatus;
    if (current === 'present' && prevAttendanceStatus.current !== 'present') {
      setShowPartyPopper(true);
      const hideTimer = setTimeout(() => setShowPartyPopper(false), 3500);
      prevAttendanceStatus.current = current;
      return () => clearTimeout(hideTimer);
    }
    prevAttendanceStatus.current = current;
  }, [offlineTimerState.attendanceStatus]);

  // Teacher-specific timetable states
  const [showTimetable, setShowTimetable] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editRoom, setEditRoom] = useState('');

  // Student detail modal states
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Teacher UI navigation states (MUST be at top level - no conditional hooks)
  const [showViewRecords, setShowViewRecords] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [showHelpAndSupport, setShowHelpAndSupport] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [randomRingDialogOpen, setRandomRingDialogOpen] = useState(false);
  const [activeRandomRing, setActiveRandomRing] = useState(null); // Track active random ring for accept/reject
  const [randomRingData, setRandomRingData] = useState(null); // Active ring notification for student
  const [selectedBranchForTimetable, setSelectedBranchForTimetable] = useState(null);
  const [showSemesterSelector, setShowSemesterSelector] = useState(false);
  const [manualSelection, setManualSelection] = useState({ semester: 'auto', branch: null });
  const [selectedSemesterForTimetable] = useState(null);

  // Login states
  const [showLogin, setShowLogin] = useState(true); // start with login until session is verified
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loggedInUserId, setLoggedInUserId] = useState(''); // Persistent user ID after login

  // Log when userData changes (for debugging permissions)
  useEffect(() => {
    if (userData && selectedRole === 'teacher') {
      console.log('👤 App.js - userData updated:', userData.name);
      console.log('✏️ App.js - canEditTimetable:', userData.canEditTimetable);
    }
  }, [userData, selectedRole]);

  // Theme state
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('warm'); // Default to warm (light) theme
  const [showThemePicker, setShowThemePicker] = useState(false);
  const isDarkTheme = themeMode === 'night';
  const theme = THEMES[themeMode] || THEMES.warm;

  // Loading state for better UX
  const [isInitializing, setIsInitializing] = useState(true);
  const [splashDone, setSplashDone] = useState(false);

  // Profile modal state
  const [showProfile, setShowProfile] = useState(false);

  // Bottom navigation state
  const [activeTab, setActiveTab] = useState('home');
  const [notificationBadge, setNotificationBadge] = useState(0);

  // BSSID Test state
  const [showBSSIDTest, setShowBSSIDTest] = useState(false);

  // WiFi status tracking (internal use only - not displayed to students)
  const [wifiDebugInfo, setWifiDebugInfo] = useState({
    status: 'Not checked',
    currentBSSID: 'N/A',
    expectedBSSID: 'N/A',
    room: 'N/A',
    lastChecked: null
  });

  // Auto-check WiFi status (background only - no debug display)
  useEffect(() => {
    if (selectedRole === 'student' && !showLogin) {
      const wifiCheckInterval = setInterval(async () => {
        if (currentClassInfoRef.current) {
          // Background check: silence alerts to avoid spamming the user
          await isConnectedToClassroomWiFi(true); 
        }
      }, 60000); // Check every 60s — background only, no display

      return () => clearInterval(wifiCheckInterval);
    }
  }, [selectedRole, showLogin]); // removed currentClassInfo from deps — avoids re-registering interval on every class change

  // Lanyard state
  const [showLanyard, setShowLanyard] = useState(false);

  // Pull-to-refresh states
  const [refreshingTeacher, setRefreshingTeacher] = useState(false);
  const [refreshingStudent, setRefreshingStudent] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Current day state for real-time timetable updates (using server time)
  const [currentDay, setCurrentDay] = useState(() => {
    try {
      const serverTime = getServerTime();
      return serverTime.getCurrentDay();
    } catch {
      // Fallback to boot-anchored time if server time not initialized yet
      const dayIndex = new Date(_appGetBootMs()).getDay();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return days[dayIndex];
    }
  });

  // Class progress tracking (display only - server handles timing)
  const [currentClassInfo, setCurrentClassInfo] = useState(null);

  // Offline timetable period data (from BSSIDStorage - has full teacher/room/time info)
  const [offlinePeriod, setOfflinePeriod] = useState(null);

  // Detailed attendance tracking (using server time)
  const [todayAttendance, setTodayAttendance] = useState({
    date: (() => {
      try {
        const serverTime = getServerTime();
        return serverTime.nowDate().toDateString();
      } catch {
        return new Date(_appGetBootMs()).toDateString();
      }
    })(),
    lectures: [], // { subject, attended, total, present }
    totalAttended: 0,
    totalClassTime: 0,
    dayPresent: false
  });
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  const intervalRef = useRef(null);
  const socketRef = useRef(null);
  const currentClassRoomRef = useRef(null); // tracks the room teacher is currently in
  const studentIdRef = useRef(null);   // always current studentId for socket handlers
  const selectedRoleRef = useRef(null); // always current role for socket handlers
  const semesterRef = useRef(null);    // always current semester for socket handlers
  const branchRef = useRef(null);      // always current branch for socket handlers
  const currentClassInfoRef = useRef(null); // always current class for background WiFi checks
  const appState = useRef(AppState.currentState);
  const backgroundTimeRef = useRef(null);
  const shownMissedRingIds = useRef(new Set()); // prevent duplicate "missed ring" alerts
  const periodicSyncRef = useRef(null); // periodic server sync interval

  // Keep refs in sync with state so socket handlers always read current values
  useEffect(() => { studentIdRef.current = studentId; }, [studentId]);
  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);
  useEffect(() => { semesterRef.current = semester; }, [semester]);
  useEffect(() => { branchRef.current = branch; }, [branch]);
  useEffect(() => { currentClassInfoRef.current = currentClassInfo; }, [currentClassInfo]);

  // Animations
  const glowAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const profileScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (splashDone) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }).start();
    }
  }, [splashDone]);

  useEffect(() => {
    // Only animate glow in dark theme and after splash is done
    if (isDarkTheme && splashDone) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      glowAnim.stopAnimation();
    }
  }, [isDarkTheme, splashDone]);

  useEffect(() => {
    // Animate modal when it opens
    if (selectedStudent) {
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedStudent]);

  useEffect(() => {
    // Animate profile modal when it opens
    if (showProfile) {
      profileScaleAnim.setValue(0);
      Animated.spring(profileScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [showProfile]);

  // Update current day at midnight and reset verification (using server time in IST)
  useEffect(() => {
    const getISTDateStr = (timestamp) => {
        const ist = new Date(timestamp + 5.5 * 60 * 60 * 1000);
        return ist.toISOString().split('T')[0];
    };
    
    let lastDate = (() => {
      try {
        const serverTime = getServerTime();
        return getISTDateStr(serverTime.now());
      } catch {
        return getISTDateStr(new Date(_appGetBootMs() || Date.now()).getTime());
      }
    })();

    const updateCurrentDay = () => {
      try {
        const serverTime = getServerTime();
        const currentDate = getISTDateStr(serverTime.now());

        // Update current day using server time
        setCurrentDay(serverTime.getCurrentDay());

        // Check if date changed (new day)
        if (currentDate !== lastDate) {
          console.log('🌅 New day detected (server time)! Resetting attendance status.');
          // Face verification removed - no longer needed
          // Timer removed - period-based attendance
          lastDate = currentDate;

          // Clear saved verification state and offline timer
          AsyncStorage.removeItem(DAILY_VERIFICATION_KEY).catch(err =>
            console.log('Error clearing verification:', err)
          );
          if (typeof OfflineTimerService !== 'undefined') {
              OfflineTimerService.clearState?.();
              AsyncStorage.removeItem('@offline_timer_state');
          }
        }
      } catch (error) {
        console.warn('⚠️ Server time not available, using boot-anchored time');
        const timestamp = _appGetBootMs() || Date.now();
        const currentDate = getISTDateStr(timestamp);
        const istDate = new Date(timestamp + 5.5 * 60 * 60 * 1000);
        const dayIndex = istDate.getUTCDay();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        setCurrentDay(days[dayIndex]);

        if (currentDate !== lastDate) {
          console.log('🌅 New day detected (device time)! Resetting attendance status.');
          // Face verification removed - no longer needed
          // Timer removed - period-based attendance
          lastDate = currentDate;

          // Clear saved verification state and offline timer
          AsyncStorage.removeItem(DAILY_VERIFICATION_KEY).catch(err =>
            console.log('Error clearing verification:', err)
          );
          if (typeof OfflineTimerService !== 'undefined') {
              OfflineTimerService.clearState?.();
              AsyncStorage.removeItem('@offline_timer_state');
          }
        }
      }
    };

    // Check every minute if day has changed
    const dayCheckInterval = setInterval(() => {
      updateCurrentDay();
    }, 60000); // Check every minute

    return () => clearInterval(dayCheckInterval);
  }, []);

  // Fetch timetable when user is logged in and semester/branch are available
  useEffect(() => {
    if (selectedRole === 'student' && !showLogin) {
      // For students, try to get semester/branch from stored data if not already set
      if (!semester || !branch) {
        const loadStudentData = async () => {
          try {
            // Get stored student data
            const storedSemester = await AsyncStorage.getItem(SEMESTER_KEY);
            const storedBranch = await AsyncStorage.getItem(BRANCH_KEY);

            if (storedSemester && storedBranch) {
              console.log('📚 Auto-loading student data:', storedSemester, storedBranch);
              setSemester(storedSemester);
              setBranch(storedBranch);
            } else {
              console.log('⚠️ No semester/branch found for student - waiting for profile data');
            }
          } catch (error) {
            console.log('Error loading student data:', error);
          }
        };
        loadStudentData();
      } else {
        console.log('Fetching timetable for logged in student:', semester, branch);
        fetchTimetable(semester, branch);
      }
    }
  }, [selectedRole, semester, branch, showLogin]);

  // Fetch timetable when semester/branch are set for students
  useEffect(() => {
    if (selectedRole === 'student' && semester && branch && !showLogin) {
      console.log('📅 Semester/branch available, fetching timetable:', semester, branch);
      fetchTimetable(semester, branch);
    }
  }, [semester, branch, selectedRole, showLogin]);

  // Fetch timetable for teachers when semester/branch are available
  useEffect(() => {
    if (selectedRole === 'teacher' && semester && branch && !showLogin) {
      console.log('👨‍🏫 Teacher - Semester/branch available, fetching timetable:', semester, branch);
      fetchTimetable(semester, branch);
    }
  }, [semester, branch, selectedRole, showLogin]);

  // Force refetch if current day is missing from timetable (handles old timetables without Sunday)
  useEffect(() => {
    if (timetable?.schedule && currentDay) {
      if (!timetable.schedule[currentDay]) {
        console.warn(`⚠️ Current day "${currentDay}" not found in timetable!`);
        console.warn('  Available days:', Object.keys(timetable.schedule).join(', '));
        console.warn('  Force refetching timetable...');
        if (semester && branch) {
          fetchTimetable(semester, branch);
        }
      }
    }
  }, [currentDay, timetable?.schedule]);

  // Check if today is a leave day (no classes scheduled)
  const isLeaveDay = () => {
    try {
      // Check if there are any classes today
      if (!timetable?.schedule?.[currentDay]) return false;
      const schedule = timetable.schedule[currentDay];
      if (!schedule || !Array.isArray(schedule)) return false;
      const hasClasses = schedule.some(slot => !slot.isBreak && slot.subject);
      return !hasClasses;
    } catch (error) {
      console.log('Error checking leave day:', error);
      return false;
    }
  };

  // Save attendance to server when lectures are updated
  useEffect(() => {
    if (selectedRole === 'student' && todayAttendance.lectures.length > 0 && studentId && semester && branch) {
      saveAttendanceToServer();
    }
  }, [todayAttendance.lectures.length]);

  // Branch restrictions removed - teachers can see all branches

  // Periodic refresh for teacher to see real-time student updates
  useEffect(() => {
    // Teacher auto-refresh: works with or without semester/branch (uses loginId-based API)
    if (selectedRole === 'teacher' && activeTab === 'home') {
      // Initial fetch
      fetchStudents();

      // Refresh every 60 seconds as backup (socket provides real-time updates)
      const refreshInterval = setInterval(() => {
        fetchStudents();
      }, 60000); // 60 seconds — socket events provide instant updates

      return () => clearInterval(refreshInterval);
    }
  }, [selectedRole, activeTab]); // Removed semester/branch deps - teacher uses loginId

  // Calculate current class progress every second
  useEffect(() => {
    if (!timetable?.schedule?.[currentDay] || selectedRole !== 'student') return;

    const updateClassProgress = () => {
      let now, currentHour, currentMinute, currentSeconds, currentTimeInSeconds;

      try {
        const serverTime = getServerTime();
        now = serverTime.nowDate();
        currentHour = now.getHours();
        currentMinute = now.getMinutes();
        currentSeconds = now.getSeconds();
        currentTimeInSeconds = (currentHour * 3600) + (currentMinute * 60) + currentSeconds;
      } catch {
        now = new Date(_appGetBootMs());
        currentHour = now.getHours();
        currentMinute = now.getMinutes();
        currentSeconds = now.getSeconds();
        currentTimeInSeconds = (currentHour * 3600) + (currentMinute * 60) + currentSeconds;
      }

      const schedule = timetable.schedule[currentDay];
      let foundClass = null;

      // Find first and last lecture times (excluding breaks)
      let firstLectureStart = null;
      let lastLectureEnd = null;
      let currentLecture = null;

      for (const slot of schedule) {
        if (slot.time && !slot.isBreak) {
          const [start, end] = slot.time.split('-').map(t => t.trim());
          const [startH, startM] = start.split(':').map(Number);
          const [endH, endM] = end.split(':').map(Number);

          const startSeconds = (startH * 3600) + (startM * 60);
          const endSeconds = (endH * 3600) + (endM * 60);

          // Track first and last lecture times
          if (firstLectureStart === null || startSeconds < firstLectureStart) {
            firstLectureStart = startSeconds;
          }
          if (lastLectureEnd === null || endSeconds > lastLectureEnd) {
            lastLectureEnd = endSeconds;
          }

          // Check if we're currently in this lecture
          if (currentTimeInSeconds >= startSeconds && currentTimeInSeconds < endSeconds) {
            currentLecture = {
              subject: slot.subject,
              teacher: slot.teacher || slot.teacherName || 'Unknown',
              room: slot.room,
              startTime: start,
              endTime: end,
            };
          }
        }
      }

      // Check if we're within the overall lecture period (first to last)
      if (firstLectureStart !== null && lastLectureEnd !== null) {
        if (currentTimeInSeconds >= firstLectureStart && currentTimeInSeconds <= lastLectureEnd) {
          // We're within lecture hours (including breaks)
          const elapsed = currentTimeInSeconds - firstLectureStart;
          const total = lastLectureEnd - firstLectureStart;
          const remaining = total - elapsed;

          // Convert first/last times to HH:MM format
          const firstStartH = Math.floor(firstLectureStart / 3600);
          const firstStartM = Math.floor((firstLectureStart % 3600) / 60);
          const lastEndH = Math.floor(lastLectureEnd / 3600);
          const lastEndM = Math.floor((lastLectureEnd % 3600) / 60);

          foundClass = {
            subject: currentLecture ? currentLecture.subject : 'Break Time',
            teacher: currentLecture ? currentLecture.teacher : '',
            room: currentLecture ? currentLecture.room : '',
            startTime: `${firstStartH.toString().padStart(2, '0')}:${firstStartM.toString().padStart(2, '0')}`,
            endTime: `${lastEndH.toString().padStart(2, '0')}:${lastEndM.toString().padStart(2, '0')}`,
            currentLecture: currentLecture ? `${currentLecture.subject} (${currentLecture.startTime}-${currentLecture.endTime})` : 'Break',
            elapsedMinutes: Math.floor(elapsed / 60),
            remainingMinutes: Math.floor(remaining / 60),
            remainingSeconds: remaining,
            totalMinutes: Math.floor(total / 60),
            elapsedSeconds: elapsed,
            totalSeconds: total,
            isWithinLectureHours: true,
          };
        }
      }

      // Update class info only when it actually changes (avoid re-render every second)
      // Don't clear to null immediately — only clear if offlinePeriod is also null
      // (offlinePeriod acts as a secondary source; clearing both at once prevents flicker)
      setCurrentClassInfo(prev => {
        if (!foundClass && !prev) return prev;
        if (!foundClass) {
          // Only clear timetable-provided info if offlinePeriod is also gone
          // (offlinePeriod synthesis effect will handle its own clearing)
          if (prev && prev.isFromOfflineSchedule) return prev; // let offlinePeriod effect handle it
          return null;
        }
        if (!prev) return foundClass;
        // Only update if meaningful fields changed (not every second for elapsed/remaining)
        if (
          prev.subject !== foundClass.subject ||
          prev.currentLecture !== foundClass.currentLecture ||
          prev.startTime !== foundClass.startTime ||
          prev.endTime !== foundClass.endTime ||
          prev.elapsedMinutes !== foundClass.elapsedMinutes
        ) {
          return foundClass;
        }
        return prev;
      });
    };

    updateClassProgress();
    const progressInterval = setInterval(updateClassProgress, 15000); // Check every 15s for faster updates

    return () => clearInterval(progressInterval);
  }, [timetable, currentDay, selectedRole]);

  // If timetable hasn't loaded or has no schedule but offline period is active,
  // synthesize currentClassInfo from offlinePeriod so the timer box shows
  useEffect(() => {
    if (selectedRole !== 'student') return;

    if (offlinePeriod) {
      // Active period in offline schedule — synthesize currentClassInfo if timetable hasn't provided it
      setCurrentClassInfo(prev => {
        if (prev && !prev.isFromOfflineSchedule) return prev; // timetable already provided — don't override
        return {
          subject: offlinePeriod.subject,
          teacher: offlinePeriod.teacher || offlinePeriod.teacherName || 'Unknown',
          room: offlinePeriod.room || 'Unknown',
          startTime: offlinePeriod.startTime,
          endTime: offlinePeriod.endTime,
          currentLecture: `${offlinePeriod.subject} (${offlinePeriod.startTime}-${offlinePeriod.endTime})`,
          isFromOfflineSchedule: true,
          isWithinLectureHours: true,
          elapsedMinutes: 0,
          remainingMinutes: 0,
        };
      });
    } else {
      // No active period — clear synthesized info (but keep timetable-provided info)
      setCurrentClassInfo(prev => {
        if (prev && !prev.isFromOfflineSchedule) return prev;
        return null;
      });
    }
  }, [offlinePeriod, selectedRole]);

  // Refresh offline period data from BSSIDStorage every minute
  useEffect(() => {
    if (selectedRole !== 'student') return;
    // Debounce null results — only clear offlinePeriod after 2 consecutive nulls
    // This prevents a single missed poll from causing a flicker to "No Lectures"
    let nullCount = 0;
    const fetchOfflinePeriod = async () => {
      const period = await BSSIDStorage.getCurrentPeriodBSSID();
      if (period) {
        nullCount = 0;
        setOfflinePeriod(period);
      } else {
        nullCount++;
        // Only clear after 2 consecutive nulls (30s grace window at 15s interval)
        if (nullCount >= 2) {
          setOfflinePeriod(null);
        }
        // else: keep the last known period for one more cycle to avoid flicker
      }

      // If timer is running, update currentLecture in offlineTimerState
      // so the Offline Timer box always shows the correct current period subject
      if (period) {
        setOfflineTimerState(prev => {
          // Only update if period identifier actually changed (P1 to P2, etc.)
          const periodChanged = prev.currentLecture?.period !== period.period;

          if (!periodChanged) {
            console.log('✅ Same period, continuing timer (no reset)');
            // Still update lecture info but don't reset timer
            const updatedLecture = {
              ...prev.currentLecture,
              subject: period.subject || prev.currentLecture?.subject,
              teacher: period.teacher || period.teacherName || prev.currentLecture?.teacher,
              room: period.room || prev.currentLecture?.room,
              startTime: period.startTime || prev.currentLecture?.startTime,
              endTime: period.endTime || prev.currentLecture?.endTime,
              period: period.period || prev.currentLecture?.period,
            };
            if (OfflineTimerService.isRunning) {
              OfflineTimerService.currentLecture = updatedLecture;
            }
            return { ...prev, currentLecture: updatedLecture };
          }

          console.log('🔄 Period change detected:', {
            from: prev.currentLecture?.period,
            to: period.period,
            fromSubject: prev.currentLecture?.subject,
            toSubject: period.subject,
            timerWasRunning: prev.isRunning
          });

          // Period changed - save attendance to server for admin panel
          // Save even if timer not running, as long as there's attendance data
          if (prev.elapsedSeconds > 0 || todayAttendance.lectures.length > 0) {
            saveAttendanceToServer(prev.elapsedSeconds, 'attending');
          }

          const updatedLecture = {
            ...prev.currentLecture,
            subject: period.subject || prev.currentLecture?.subject,
            teacher: period.teacher || period.teacherName || prev.currentLecture?.teacher,
            room: period.room || prev.currentLecture?.room,
            startTime: period.startTime || prev.currentLecture?.startTime,
            endTime: period.endTime || prev.currentLecture?.endTime,
            period: period.period || prev.currentLecture?.period,
          };

          // Auto-start timer for period transitions (P1->P2, P2->P3, etc.)
          // First time of day requires manual start, regardless of which period
          const hasStartedTimerToday = prev.elapsedSeconds > 0 || prev.isRunning;
          const wasRunningBeforeLectureEnd = OfflineTimerService.wasRunningBeforeLectureEnd;

          if (hasStartedTimerToday && wasRunningBeforeLectureEnd) {
            console.log('⏱️ Period transition detected - auto-starting timer from 00:00:00');
            // Use an async IIFE so we can await properly without race conditions
            (async () => {
              try {
                // 1. Stop the current period timer and sync its data (if running)
                if (prev.isRunning) {
                  await OfflineTimerService.stopTimer('period_change');
                  console.log('   Timer stopped for period transition');
                }

                // 2. Hard-reset timer to 0 for the new period
                OfflineTimerService.timerSeconds = 0;
                OfflineTimerService._countingBaseSeconds = 0;
                OfflineTimerService._countingStartedAt = null;
                OfflineTimerService.attendanceStatus = 'absent';
                OfflineTimerService.thresholdSeconds = null;
                OfflineTimerService.wasRunningBeforeLectureEnd = false;  // Clear the flag
                console.log('   Timer state reset to 0 for new period');

                // 3. Small gap so the stop sync completes before we start again
                await new Promise(resolve => setTimeout(resolve, 500));

                // 4. Start fresh for the new period
                const lectureInfo = {
                  subject: period.subject || prev.currentLecture?.subject,
                  teacher: period.teacher || period.teacherName || prev.currentLecture?.teacher,
                  room: period.room || prev.currentLecture?.room,
                  startTime: period.startTime || prev.currentLecture?.startTime,
                  endTime: period.endTime || prev.currentLecture?.endTime,
                  period: period.period || prev.currentLecture?.period,
                };
                if (lectureInfo.subject && lectureInfo.period) {
                  await OfflineTimerService.startTimer(lectureInfo);
                  console.log('✅ Timer auto-started for new period from 00:00:00');
                } else {
                  console.log('⚠️ Cannot auto-start — missing subject or period');
                }
              } catch (err) {
                console.error('❌ Period transition error:', err);
              }
            })();
          } else if (!hasStartedTimerToday) {
            console.log('🌅 First time of day - requires manual START TIMER button');
            // Reset stale timer from previous session
            OfflineTimerService.timerSeconds = 0;
            OfflineTimerService.attendanceStatus = 'absent';
            OfflineTimerService.thresholdSeconds = null;
          } else {
            console.log('⏸️ Timer was not running in previous period - requires manual start');
            // Reset stale timer from previous period so new period starts clean
            OfflineTimerService.timerSeconds = 0;
            OfflineTimerService.attendanceStatus = 'absent';
            OfflineTimerService.thresholdSeconds = null;
          }

          // Also update OfflineTimerService's internal currentLecture
          if (OfflineTimerService.isRunning) {
            OfflineTimerService.currentLecture = updatedLecture;
          }
          // Reset timerSeconds in React state too so UI shows 00:00:00 for new period
          return {
            ...prev,
            currentLecture: updatedLecture,
            timerSeconds: prev.isRunning ? prev.timerSeconds : 0,
            attendanceStatus: prev.isRunning ? prev.attendanceStatus : 'absent',
            thresholdSeconds: prev.isRunning ? prev.thresholdSeconds : null,
          };
        });
      } else {
        // No active period - clear currentLecture completely
        setOfflineTimerState(prev => {
          if (prev.currentLecture) {
            console.log('🔚 No active period - clearing stale lecture info');
            return {
              ...prev,
              currentLecture: null,
              timerSeconds: 0,
              attendanceStatus: 'absent',
              thresholdSeconds: null,
            };
          }
          return prev;
        });
      }
    };
    fetchOfflinePeriod();
    const interval = setInterval(fetchOfflinePeriod, 15000); // 15 seconds for faster period detection
    return () => clearInterval(interval);
  }, [selectedRole]);

  useEffect(() => {
    // Request all required permissions on first launch
    requestStartupPermissions().then(async ({ allGranted }) => {
      if (!allGranted) {
        console.warn('⚠️ Some permissions were not granted at startup');
      } else {
        console.log('✅ All startup permissions granted');
      }

      // Android 11+ (API 30) background location mandatory choice UI
      if (Platform.OS === 'android' && Platform.Version >= 29) {
        try {
          const bgGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
          if (!bgGranted) {
            Alert.alert(
              "📍 Background Timer",
              "To keep the attendance timer running while your phone is locked or in your pocket, you MUST select:\n\n\"Allow all the time\"\n\n⚠️ If you select \"Allow only while using the app\", the timer will PAUSE the moment you exit the app!",
              [
                { 
                  text: "I Understand -> Let's Set It Up", 
                  onPress: () => {
                    try {
                      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
                    } catch(e) {}
                  }
                }
              ],
              { cancelable: false }
            );
          }
        } catch (e) {
          console.log('Failed to check background location', e);
        }
      }
    });

    // Initialize server time synchronization (CRITICAL for security)
    const serverTime = initializeServerTime(SOCKET_URL);
    serverTime.initialize().then(async (success) => {
      if (serverTime.isDeviceTimeManipulated()) {
        console.error('🚨 DEVICE TIME MANIPULATION DETECTED');
        console.error('   Please set your device time to automatic');
        Alert.alert(
          '⚠️ Time Error',
          'Your device time is incorrect. Please set your device time to automatic (use network-provided time) and restart the app.\n\nThe app cannot function with incorrect device time for security reasons.',
          [{ text: 'OK' }]
        );
      } else if (success) {
        console.log('✅ Server time synchronized');
        console.log('   Server time:', serverTime.nowISO());
        console.log('   Device time:', new Date().toISOString());
        console.log('   Offset:', serverTime.serverTimeOffset, 'ms');
      } else {
        console.warn('⚠️ Server time sync failed');
      }
    });

    // Face cache removed - no longer needed

    console.log('📋 About to load config...');
    loadConfig();
    console.log('📋 Config loaded!');

    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', async nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - period-based attendance (no timer)
        console.log('📱 App came to foreground');
        backgroundTimeRef.current = null;

        // Refresh data for students when app comes to foreground
        if (selectedRoleRef.current === 'student') {
          console.log('🔄 Refreshing data after app came to foreground...');

          // Rejoin class room in case socket reconnected while in background
          const currentSem = semesterRef.current;
          const currentBranch = branchRef.current;
          if (currentSem && currentBranch) {
            joinClassRoom(currentSem?.toString(), currentBranch);
          }

          // Refresh timetable
          if (currentSem && currentBranch) {
            console.log('📅 Fetching latest timetable...');
            await fetchTimetable(currentSem, currentBranch);
          }

          // Refresh BSSID schedule - get enrollment number from storage
          try {
            const storedUserData = await AsyncStorage.getItem('@user_data');
            if (storedUserData) {
              const parsedUserData = JSON.parse(storedUserData);
              if (parsedUserData.enrollmentNo) {
                console.log('📶 Fetching latest BSSID schedule (forced refresh)...');
                await fetchDailyBSSIDSchedule(parsedUserData.enrollmentNo, true); // Force refresh
              }
            }
          } catch (error) {
            console.error('❌ Error refreshing BSSID schedule:', error);
          }

          console.log('✅ Data refresh complete');
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background - period-based attendance (no timer)
        console.log('📱 App went to background');
      }
      appState.current = nextAppState;
    });

    return () => {
      if (socketRef.current) {
        // Clear ping interval
        if (socketRef.current.pingInterval) {
          clearInterval(socketRef.current.pingInterval);
        }
        socketRef.current.disconnect();
      }
      subscription.remove();
    };
  }, []); // Only run once on mount

  // Dedicated socket initialization/reconnection effect
  useEffect(() => {
    console.log('🔌 Socket effect triggered - Identity:', studentId || loggedInUserId || 'anonymous', '| Role:', selectedRole);
    setupSocket();

    return () => {
      if (socketRef.current?.pingInterval) {
        clearInterval(socketRef.current.pingInterval);
        socketRef.current.pingInterval = null;
      }
      socketRef.current?.removeAllListeners?.();
      socketRef.current?.disconnect?.();
    };
  }, [studentId, loggedInUserId, selectedRole]);

  // Initialize OfflineTimerService when student logs in
  useEffect(() => {
    if (selectedRole === 'student' && studentId && !showLogin && !offlineTimerInitialized) {
      const initializeOfflineTimer = async () => {
        try {
          console.log('🔧 Initializing OfflineTimerService for student:', studentId);

          const success = await OfflineTimerService.initialize(studentId, SOCKET_URL);

          if (success) {
            // Update student data for BSSID validation
            if (userData) {
              await OfflineTimerService.updateStudentData({
                semester: userData.semester,
                branch: userData.branch
              });
            }

            // Setup event listeners
            const unsubscribe = OfflineTimerService.addListener((event) => {
              console.log('🔔 OfflineTimer event:', event.type);

              switch (event.type) {
                case 'timer_tick':
                  setOfflineTimerState(prev => ({
                    ...prev,
                    timerSeconds: event.timerSeconds
                  }));
                  break;

                case 'timer_started':
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isRunning: true,
                    isPaused: false,
                    timerSeconds: event.timerSeconds,
                    currentLecture: event.lecture
                  }));
                  break;

                case 'timer_stopped':
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isRunning: false,
                    isPaused: false,
                    currentLecture: null,
                    thresholdSeconds: null,   // reset so next period gets fresh threshold
                    attendanceStatus: 'absent'
                  }));
                  // Alert if stopped because student left classroom while screen was off
                  if (event.reason === 'wifi_left_classroom_background') {
                    showToast('📶 Left classroom WiFi — timer stopped', 'warning');
                    // Play alert sound to notify student
                    const playAlert = async () => {
                      try {
                        const { sound } = await Audio.Sound.createAsync(
                          { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' }
                        );
                        await sound.playAsync();
                      } catch (e) { console.log('Sound error', e); }
                    };
                    playAlert();
                    Vibration.vibrate([0, 500, 200, 500]);
                  }
                  break;

                case 'timer_paused':
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isPaused: true
                  }));
                  break;

                case 'timer_resumed':
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isPaused: false
                  }));
                  break;

                case 'bssid_unauthorized':
                case 'wifi_disconnected':
                  showToast(
                    event.type === 'bssid_unauthorized'
                      ? '📶 Left authorized WiFi — timer stopped'
                      : '📶 WiFi disconnected — timer stopped',
                    'warning'
                  );
                  break;

                case 'missed_random_ring': {
                  const missedRingId = event.ringId || 'unknown';
                  if (!shownMissedRingIds.current.has(missedRingId)) {
                    shownMissedRingIds.current.add(missedRingId);
                    showToast('🔔 Random ring missed — please respond immediately', 'error', 5000);
                  }
                  break;
                }

                case 'wifi_reconnected':
                  // WiFi reconnected - check if we need to handle reconnection
                  if (event.needsReconnectionHandling) {
                    console.log('📶 WiFi reconnected - handling reconnection logic');
                    handleWiFiReconnectionEvent(event.currentBSSID);
                  }
                  break;

                case 'timer_resumed_after_reconnection':
                  console.log('✅ Timer resumed after reconnection');
                  // Silent resumption preferred for better UX
                  break;

                case 'timer_started_after_reconnection':
                  console.log('🆕 New lecture started after reconnection');
                  // Silent start preferred for better UX
                  break;

                case 'connectivity_changed':
                  // Update offline timer state with connectivity info
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isOnline: event.isOnline,
                    hasInternetConnection: event.hasInternet,
                    isConnectedToAuthorizedWiFi: event.hasAuthorizedWiFi,
                    pendingSyncCount: event.pendingSyncs
                  }));

                  // Show connectivity status changes to user
                  if (!event.hasInternet && event.hasAuthorizedWiFi) {
                    console.log('📶 App went offline - timer running locally');
                  } else if (event.hasInternet && event.hasAuthorizedWiFi) {
                    console.log('📶 App back online - syncing data');
                  }
                  break;

                case 'sync_successful':
                  console.log('✅ Timer sync successful');
                  setOfflineTimerState(prev => ({
                    ...prev,
                    lastSyncTime: event.lastSyncTime,   // update displayed "Last sync" time
                    attendanceStatus: event.attendanceStatus,
                    thresholdSeconds: event.thresholdSeconds,
                    attendanceThreshold: event.attendanceThreshold
                  }));
                  break;

                case 'sync_server_error':
                  // Server is reachable but rejected the sync (403/404/400)
                  // Keep online status — this is NOT a network failure
                  console.warn('⚠️ Server rejected sync:', event.message);
                  if (event.statusCode === 403 && event.message?.includes('check-in')) {
                    // Show once — don't spam
                    setOfflineTimerState(prev => ({
                      ...prev,
                      isOnline: true,
                      hasInternetConnection: true,
                      syncError: 'Check-in required before syncing'
                    }));
                  }
                  break;

                case 'sync_failed':
                  console.log('⚠️ Timer sync failed:', event.error);
                  break;

                case 'pending_syncs_completed':
                  console.log(`✅ Completed ${event.syncedCount} pending syncs, ${event.remainingCount} remaining`);
                  // Alert removed to avoid spamming - background sync should be silent
                  break;

                case 'lecture_ended':
                  // Lecture period has ended - timer automatically stopped
                  // Don't show alert — auto-continue to next period will handle it
                  saveAttendanceToServer();
                  break;

                case 'period_auto_continued':
                  // Timer auto-started for next period (no face verification needed)
                  setOfflineTimerState(prev => ({
                    ...prev,
                    isRunning: true,
                    isPaused: false,
                    timerSeconds: 0,
                    currentLecture: event.lecture,
                    attendanceStatus: 'absent',
                    thresholdSeconds: null
                  }));
                  break;
              }

              // Update state with current timer state
              const currentState = OfflineTimerService.getState();
              setOfflineTimerState(currentState);
            });

            // Get initial state
            const initialState = OfflineTimerService.getState();
            setOfflineTimerState(initialState);
            setOfflineTimerInitialized(true);

            console.log('✅ OfflineTimerService initialized successfully');

            // Cleanup function
            return () => {
              unsubscribe();
              OfflineTimerService.cleanup();
            };
          } else {
            console.error('❌ Failed to initialize OfflineTimerService');
          }
        } catch (error) {
          console.error('❌ Error initializing OfflineTimerService:', error);
        }
      };

      initializeOfflineTimer();
    }
  }, [selectedRole, studentId, showLogin, userData, offlineTimerInitialized]);

  // Handle WiFi reconnection events
  const handleWiFiReconnectionEvent = async (currentBSSID) => {
    try {
      console.log('📶 Handling WiFi reconnection event');
      console.log('   Current BSSID:', currentBSSID);
      console.log('   Current class info:', currentClassInfo);

      if (!currentClassInfo) {
        console.log('⚠️ No current class info available for reconnection');
        return;
      }

      // Create lecture info from current class
      const lectureInfo = {
        subject: currentClassInfo.subject || currentClassInfo.currentLecture,
        teacher: currentClassInfo.teacher || 'Unknown',
        room: currentClassInfo.room || 'Unknown',
        startTime: currentClassInfo.startTime,
        endTime: currentClassInfo.endTime
      };

      console.log('📚 Attempting WiFi reconnection with lecture info:', lectureInfo);

      // Call OfflineTimerService to handle reconnection
      const result = await OfflineTimerService.handleWiFiReconnection(lectureInfo);

      if (!result.success) {
        console.error('❌ WiFi reconnection failed:', result.error);

        let title = '📶 WiFi Reconnection Failed';
        let message = result.error;

        // Customize message based on failure reason
        switch (result.step) {
          case 'bssid_validation':
            title = '📶 WiFi Validation Failed';
            message = 'Unable to validate WiFi connection. Please ensure you are connected to the authorized classroom WiFi.';
            break;
          case 'face_verification':
            title = '👤 Face Verification Failed';
            message = 'Face verification failed during reconnection. Please try again.';
            break;
          default:
            message = `WiFi reconnection failed: ${result.error}`;
            break;
        }

        Alert.alert(title, message, [{ text: 'OK' }]);
      } else {
        console.log('✅ WiFi reconnection handled successfully');
        console.log('   Scenario:', result.scenario);
        console.log('   Resumed:', result.resumed);
        console.log('   Timer seconds:', result.timerSeconds);

        // Success message will be shown by the event listener for 
        // 'timer_resumed_after_reconnection' or 'timer_started_after_reconnection'
      }
    } catch (error) {
      console.error('❌ Error handling WiFi reconnection:', error);
      Alert.alert(
        '❌ Reconnection Error',
        `An error occurred during WiFi reconnection: ${error.message}`,
        [{ text: 'OK' }]
      );
    }
  };

  // Handle timer start/stop based on current class
  // isTimerActionInProgress prevents multiple concurrent calls from rapid taps
  const isTimerActionInProgress = useRef(false);

  const handleTimerStartStop = async () => {
    if (isTimerActionInProgress.current) return; // debounce — ignore extra taps
    isTimerActionInProgress.current = true;

    try {
      if (!offlineTimerInitialized || !currentClassInfo) {
        showToast('⚠️ Timer not available — no active lecture', 'warning');
        return;
      }

      if (offlineTimerState.isRunning) {
        // Stop timer
        console.log('⏹️ Stopping timer manually');
        const result = await OfflineTimerService.stopTimer('manual');

        if (result.success) {
          stopPeriodicSync(); // Stop periodic server sync
        }

        if (!result.success) {
          showToast(`❌ Failed to stop timer: ${result.error}`, 'error');
        }
      } else {
      // Start timer with BSSID and face verification
      console.log('▶️ Starting timer for current class');

      // Check if there's an active period (not a break)
      if (!offlinePeriod || offlinePeriod.isBreak) {
        showToast('⚠️ Timer only available during active lectures, not breaks', 'warning');
        return;
      }

      // Show loading toast for verification process
      showToast('🔐 Verifying WiFi & face — please wait…', 'info', 8000);

      // Extract current lecture info — prefer offline schedule (BSSIDStorage) as source of truth
      // offlinePeriod has the correct subject/teacher/room/time for the current period
      const lectureInfo = offlinePeriod ? {
        subject: offlinePeriod.subject || currentClassInfo.subject,
        teacher: offlinePeriod.teacher || offlinePeriod.teacherName || currentClassInfo.teacher || 'Unknown',
        room: offlinePeriod.room || currentClassInfo.room || 'Unknown',
        startTime: offlinePeriod.startTime || currentClassInfo.startTime,
        endTime: offlinePeriod.endTime || currentClassInfo.endTime,
        period: offlinePeriod.period || null,
      } : {
        subject: currentClassInfo.subject,
        teacher: currentClassInfo.teacher || 'Unknown',
        room: currentClassInfo.room || 'Unknown',
        startTime: currentClassInfo.startTime,
        endTime: currentClassInfo.endTime
      };

      const result = await OfflineTimerService.startTimer(lectureInfo);

      if (result.success) {
        startPeriodicSync(); // Start periodic server sync for admin panel visibility
      }

      if (!result.success) {
        let title = '❌ Cannot Start Timer';
        let message = result.error || 'Failed to start timer';

        // Provide specific error messages based on the step that failed
        switch (result.step) {
          case 'bssid_validation':
            title = '📶 WiFi Validation Failed';
            message = result.error + '\n\nPlease ensure you are connected to the correct classroom WiFi network.';
            break;
          case 'face_verification':
            title = '👤 Face Verification Failed';
            if (result.reason === 'no_face_enrolled') {
              message = 'Face not enrolled. Please use the Face Enrollment app to enroll your face first.';
            } else if (result.reason === 'face_not_matched') {
              message = result.error + '\n\nPlease ensure good lighting and look directly at the camera.';
            } else {
              message = result.error + '\n\nPlease try again or contact support if the issue persists.';
            }
            break;
          default:
            // Keep default message
            break;
        }

        Alert.alert(title, message, [
          { text: 'OK' },
          // Retry button for face verification failures (except no_face_enrolled)
          ...(result.step === 'face_verification' && result.reason !== 'no_face_enrolled'
            ? [{ text: '🔄 Retry', onPress: () => handleTimerStartStop() }]
            : []
          ),
          ...(result.step === 'face_verification' && result.reason === 'no_face_enrolled'
            ? [{
              text: 'Open Enrollment App', onPress: () => {
                console.log('User wants to open enrollment app');
              }
            }]
            : []
          )
        ]);
      } else {
        // Success - timer started — vibrate to confirm face verification passed
        try { Vibration.vibrate([0, 80, 60, 80]); } catch (_) { }
        showToast('✅ Timer started — attendance tracking active', 'success');
      }
      }
    } catch (err) {
      console.error('❌ handleTimerStartStop error:', err);
    } finally {
      isTimerActionInProgress.current = false;
    }
  };

  const setupSocket = () => {
    console.log('🔌🔌🔌 setupSocket() called - Initializing socket connection...');
    console.log('🔌 SOCKET_URL:', SOCKET_URL);
    console.log('🔌 Current role:', selectedRole);
    console.log('🔌 Current studentId:', studentId);

    // Disconnect existing socket if any
    if (socketRef.current) {
      console.log('🔌 Disconnecting existing socket');
      if (socketRef.current.pingInterval) {
        clearInterval(socketRef.current.pingInterval);
        socketRef.current.pingInterval = null;
      }
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
    }

    console.log('🔌 Creating new socket.io connection...');
    console.log('🔌 URL:', SOCKET_URL);
    console.log('🔌 io function exists:', typeof io);
    console.log('🔌 io function type:', typeof io);

    try {
      socketRef.current = io(SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });

      console.log('🔌 Socket object created:', socketRef.current ? 'YES' : 'NO');
      console.log('🔌 Socket connecting:', socketRef.current?.connecting);
      console.log('🔌 Socket connected:', socketRef.current?.connected);
    } catch (error) {
      console.error('❌❌❌ FAILED TO CREATE SOCKET:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      return;
    }

    socketRef.current.on('connect', async () => {
      console.log('✅✅✅ SOCKET CONNECTED TO SERVER ✅✅✅');
      console.log('✅ Socket ID:', socketRef.current.id);
      console.log('✅ Transport:', socketRef.current.io.engine.transport.name);
      console.log('✅ Connected at:', new Date().toISOString());

      // Check for offline session and sync
      try {
        const offlineSessionData = await AsyncStorage.getItem('offline_session');
        if (offlineSessionData) {
          const data = JSON.parse(offlineSessionData);
          const offlineDuration = Math.floor((_appGetBootMs() - data.startTime) / 1000);

          console.log('🔄 Syncing offline attendance...');
          console.log(`   Offline duration: ${offlineDuration}s (${Math.floor(offlineDuration / 60)}m)`);

          // Sync with server
          const response = await fetch(POST_ATTENDANCE_OFFLINE_SYNC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId,
              offlineStartTime: data.startTime,
              offlineEndTime: _appGetBootMs(),
              offlineDuration,
              lastKnownSeconds: data.lastKnownSeconds,
              lectureSubject: data.lectureSubject
            })
          });

          const result = await response.json();

          if (result.success) {
            if (result.missedRandomRing) {
              // Random Ring was missed during offline — show only once
              const missedId = result.ringId || 'offline_sync';
              if (!shownMissedRingIds.current.has(missedId)) {
                shownMissedRingIds.current.add(missedId);
                alert(`⚠️ Random Ring Missed\n\nA Random Ring was triggered while you were offline.\n\nYour attendance has been capped at ${result.cappedMinutes} minutes.`);
              }
              // Timer removed - period-based attendance
            } else if (result.teacherAccepted) {
              // Teacher accepted during offline
              alert(`✅ Teacher Accepted\n\nYour teacher accepted you during offline period.\n\nFull offline time (${Math.floor(offlineDuration / 60)} minutes) has been counted.`);
            } else {
              // Normal sync
              console.log(`✅ Offline time synced: ${Math.floor(offlineDuration / 60)} minutes`);
            }
          }

          // Clear offline session
          await AsyncStorage.removeItem('offline_session');
        }
      } catch (error) {
        console.error('❌ Error syncing offline session:', error);
      }

      // Refresh timetable and BSSID schedule on reconnection
      // This ensures students get latest data if changes were made while they were offline
      if (selectedRoleRef.current === 'student') {
        console.log('🔄 Refreshing data after reconnection...');

        // Refresh timetable
        if (semesterRef.current && branchRef.current) {
          console.log('📅 Fetching latest timetable...');
          await fetchTimetable(semesterRef.current, branchRef.current);
        }

        // Refresh BSSID schedule - get enrollment number from storage
        try {
          const storedUserData = await AsyncStorage.getItem('@user_data');
          if (storedUserData) {
            const parsedUserData = JSON.parse(storedUserData);
            if (parsedUserData.enrollmentNo) {
              console.log('📶 Fetching latest BSSID schedule (forced refresh)...');
              await fetchDailyBSSIDSchedule(parsedUserData.enrollmentNo, true); // Force refresh
            }
          }
        } catch (error) {
          console.error('❌ Error refreshing BSSID schedule:', error);
        }

        console.log('✅ Data refresh complete');
      }

      // Re-send current status if student is active (period-based attendance)
      if (selectedRoleRef.current === 'student' && studentIdRef.current) {
        console.log('📡 Re-sending student status after reconnect');
        // Rejoin class room so student keeps receiving random ring notifications
        const currentSem = semesterRef.current;
        const currentBranch = branchRef.current;
        if (currentSem && currentBranch) {
          joinClassRoom(currentSem?.toString(), currentBranch);
        }
      }
    });

    socketRef.current.on('disconnect', async (reason) => {
      console.log('❌❌❌ SOCKET DISCONNECTED ❌❌❌');
      console.log('❌ Reason:', reason);
      console.log('❌ Disconnected at:', new Date().toISOString());

      // Period-based attendance - no offline tracking needed
    });

    socketRef.current.on('connect_error', (error) => {
      console.log('❌❌❌ SOCKET CONNECTION ERROR ❌❌❌');
      console.log('❌ Error:', error.message);
      console.log('❌ Error type:', error.type);
      console.log('❌ Error description:', error.description);
      console.log('❌ Full error:', JSON.stringify(error, null, 2));
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Socket reconnect attempt #${attemptNumber}`);
    });

    socketRef.current.on('reconnect', async (attemptNumber) => {
      console.log(`✅ Socket reconnected after ${attemptNumber} attempts`);

      if (selectedRoleRef.current === 'student') {
        console.log('🔄 Refreshing data after reconnection...');

        const currentSem = semesterRef.current;
        const currentBranch = branchRef.current;
        if (currentSem && currentBranch) {
          console.log('📅 Fetching latest timetable...');
          await fetchTimetable(currentSem, currentBranch);
          // Rejoin class room on reconnect
          joinClassRoom(currentSem?.toString(), currentBranch);
        }

        // Refresh BSSID schedule - get enrollment number from storage
        try {
          const storedUserData = await AsyncStorage.getItem('@user_data');
          if (storedUserData) {
            const parsedUserData = JSON.parse(storedUserData);
            if (parsedUserData.enrollmentNo) {
              console.log('📶 Fetching latest BSSID schedule (forced refresh)...');
              await fetchDailyBSSIDSchedule(parsedUserData.enrollmentNo, true); // Force refresh
            }
          }
        } catch (error) {
          console.error('❌ Error refreshing BSSID schedule:', error);
        }

        console.log('✅ Data refresh complete');
      } else if (selectedRoleRef.current === 'teacher') {
        // Teacher reconnect: refresh student list and rejoin class room if active
        console.log('👨\u200d🏫 Teacher reconnecting - refreshing student list...');
        await fetchStudents();
      }
    });

    socketRef.current.on('reconnect_error', (error) => {
      console.log('❌ Socket reconnect error:', error.message);
    });

    socketRef.current.on('reconnect_failed', () => {
      console.log('❌ Socket reconnect failed - giving up');
    });

    // Test socket communication with ping/pong
    socketRef.current.on('pong', (latency) => {
      // pong received — latency tracked silently
    });

    // Send a keep-alive ping every 60 seconds
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('ping');
      }
    }, 60000);

    // Store interval ref for cleanup
    socketRef.current.pingInterval = pingInterval;

    socketRef.current.on('student_update', (data) => {
      console.log('📥 Received student update:', data);

      // For teachers: Instant updates for all students
      if (selectedRole === 'teacher') {
        console.log('👨‍🏫 Teacher received update for student:', data.enrollmentNo);
        console.log('   Update data:', { status: data.status, isRunning: data.isRunning, enrollmentNo: data.enrollmentNo });

        setStudents(prev => {
          // server always sends enrollmentNo — match on that only
          const existingIndex = prev.findIndex(s =>
            s.enrollmentNo && s.enrollmentNo === data.enrollmentNo
          );

          if (existingIndex >= 0) {
            const updated = [...prev];
            const oldStudent = updated[existingIndex];
            updated[existingIndex] = { ...oldStudent, ...data };
            console.log('✅ Updated student:', oldStudent.name, '| Status:', data.status, '| Running:', data.isRunning);
            return updated;
          } else {
            console.log('⚠️ Student not found in list, enrollmentNo:', data.enrollmentNo);
            console.log('   Current list has', prev.length, 'students');
            fetchStudents();
            return prev;
          }
        });
      } else {
        // For non-teachers, match by enrollmentNo only
        setStudents(prev => prev.map(s =>
          s.enrollmentNo === data.enrollmentNo ? { ...s, ...data } : s
        ));
      }
    });

    socketRef.current.on('student_registered', () => {
      console.log('📥 Student registered event received');
      fetchStudents();
    });

    // Listen for Random Ring verification updates (teachers only)
    socketRef.current.on('random_ring_student_verified', (data) => {
      console.log('✅ Random Ring verification update:', data);
      if (selectedRole === 'teacher' && loginId === data.teacherId) {
        // Show notification to teacher
        alert(`✅ Student Verified!\n\n${data.studentName} has verified their attendance.\n\nVerified: ${data.verifiedCount}/${data.totalCount}`);

        // Refresh student list to show updated status
        fetchStudents();
      }
    });

    // Listen for Random Ring notifications (students only)
    socketRef.current.on('random_ring_notification', (data) => {
      console.log('🔔 Random ring received:', data);
      console.log('   Current role:', selectedRoleRef.current);
      console.log('   Current studentId:', studentIdRef.current);
      console.log('   Notification for:', data.enrollmentNo);

      if (selectedRoleRef.current === 'student' && studentIdRef.current === data.enrollmentNo) {
        console.log('✅ Random Ring is for this student!');

        const ringPauseTime = _appGetBootMs();
        OfflineTimerService.pauseTimer('random_ring');
        console.log('⏸️ Timer paused for random ring at', ringPauseTime);

        const ringInfo = {
          randomRingId: data.randomRingId,
          teacherId: data.teacherId,
          timestamp: data.timestamp,
          expiresAt: data.expiresAt,
          ringPauseTime,
        };

        setRandomRingData(ringInfo);

        setTimeout(() => {
          setRandomRingData(prev => {
            if (prev && prev.randomRingId === data.randomRingId) {
              console.log('⏰ Random ring verification timeout — resuming timer');
              OfflineTimerService.resumeTimer('random_ring_timeout');
              return null;
            }
            return prev;
          });
        }, 240000);

        // Auto-open face verification camera immediately
        console.log('📸 Auto-launching face verification for random ring...');
        (async () => {
          try {
            const storedEmbedding = await SecureStorage.getFaceEmbedding();
            if (!storedEmbedding || storedEmbedding.length !== 192) {
              console.warn('❌ No face embedding — student must tap manually');
              return;
            }

            const verificationResult = await FaceVerification.verifyFace(storedEmbedding);
            console.log('🔍 Auto face verify result:', verificationResult);

            if (!verificationResult.success || !verificationResult.isMatch) {
              console.log('❌ Auto face verify failed — banner stays open for retry');
              return;
            }

            let currentBSSID = null;
            try {
              const wifiResult = await NativeWiFiService.validateWiFiWithPermissions();
              if (wifiResult && wifiResult.bssid) currentBSSID = wifiResult.bssid;
            } catch (e) { console.warn('⚠️ WiFi check failed:', e.message); }

            const res = await fetch(POST_RANDOM_RING_VERIFY_DIRECT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                randomRingId: ringInfo.randomRingId,
                studentId: studentIdRef.current,
                bssid: currentBSSID,
              }),
            });
            const result = await res.json();
            if (result.success) {
              console.log('✅ Auto face verify accepted by server');
            } else {
              console.warn('❌ Auto face verify rejected:', result.error);
            }
          } catch (err) {
            if (err.message === 'VERIFICATION_CANCELLED') {
              console.log('📸 Auto face verify cancelled by student');
            } else {
              console.error('❌ Auto face verify error:', err.message);
            }
          }
        })();
      } else {
        console.log('❌ Random Ring not for this student (role or ID mismatch)');
      }
    });

    // Listen for teacher accept action
    socketRef.current.on('random_ring_teacher_accepted', (data) => {
      console.log('✅ Teacher accepted your presence:', data);
      if (selectedRoleRef.current === 'student' && studentIdRef.current === data.enrollmentNo) {
        setRandomRingData(prev => {
          if (prev) {
            const pausedSeconds = prev.ringPauseTime ? (_appGetBootMs() - prev.ringPauseTime) / 1000 : 0;
            console.log(`▶️ Resuming timer after teacher accept, adding back ${pausedSeconds.toFixed(1)}s`);
            OfflineTimerService.resumeTimer('random_ring_accepted', pausedSeconds);
          }
          return null;
        });
        alert('✅ Teacher verified your presence!');
      }
    });

    // Listen for teacher reject action
    socketRef.current.on('random_ring_teacher_rejected', (data) => {
      console.log('❌ Teacher rejected your presence:', data);
      if (selectedRoleRef.current === 'student' && studentIdRef.current === data.enrollmentNo) {
        setRandomRingData(prev => ({
          randomRingId: data.randomRingId,
          teacherId: data.teacherId,
          expiresAt: data.expiresAt,
          isRejection: true,
          ringPauseTime: prev?.ringPauseTime || _appGetBootMs(),
        }));
        alert('❌ Teacher rejected your presence.\n\nYou have 5 minutes to verify your face.');
      }
    });

    // Listen for teacher action updates (for teacher dashboard)
    socketRef.current.on('random_ring_teacher_action_update', (data) => {
      if (selectedRole === 'teacher') {
        setActiveRandomRing(prev => {
          if (!prev || prev._id !== data.randomRingId) return prev;
          return {
            ...prev,
            selectedStudents: prev.selectedStudents.map(s => {
              if (s.enrollmentNo !== data.enrollmentNo) return s;
              // 'responded' means student tapped "I'm Here" — keep teacherAction as 'pending'
              // so accept/reject buttons stay visible. Just mark responded flag.
              if (data.action === 'responded') {
                return { ...s, responded: true };
              }
              return { ...s, teacherAction: data.action };
            })
          };
        });
      }
    });

    // Listen for face verification success (students)
    socketRef.current.on('random_ring_face_verification_success', (data) => {
      console.log('✅ Face verification successful:', data);
      if (selectedRoleRef.current === 'student' && studentIdRef.current === data.enrollmentNo) {
        setRandomRingData(prev => {
          if (prev) {
            const pausedSeconds = prev.ringPauseTime ? (_appGetBootMs() - prev.ringPauseTime) / 1000 : 0;
            console.log(`▶️ Resuming timer after face verify success, adding back ${pausedSeconds.toFixed(1)}s`);
            OfflineTimerService.resumeTimer('random_ring_face_verified', pausedSeconds);
          }
          return null;
        });
        alert('✅ Face Verification Successful! Timer resumed.');
      }
    });

    // Listen for face verification after rejection (for teacher dashboard)
    socketRef.current.on('random_ring_face_verified_after_rejection', (data) => {
      console.log('✅ Student verified face after rejection:', data);
      if (selectedRole === 'teacher') {
        setActiveRandomRing(prev => {
          if (!prev || prev._id !== data.randomRingId) return prev;
          return {
            ...prev,
            selectedStudents: prev.selectedStudents.map(s =>
              s.enrollmentNo === data.enrollmentNo
                ? { ...s, faceVerifiedAfterRejection: true, verified: true }
                : s
            )
          };
        });

        alert(`✅ ${data.studentName} verified face after rejection. Timer resumed.`);
      }
    });

    // Live timer broadcast from server (targeted to class room)
    socketRef.current.on('timer_broadcast', (data) => {
      if (selectedRole !== 'teacher') return;
      setStudents(prevStudents => {
        const updated = [...prevStudents];
        // server always sends enrollmentNo — match on that only
        const index = updated.findIndex(s => s.enrollmentNo === data.enrollmentNo);
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            timerValue: data.attendedSeconds,
            isRunning: data.isRunning,
            status: data.status,
            attendanceSession: {
              ...(updated[index].attendanceSession || {}),
              isRunning: data.isRunning,
              status: data.status,
              attendedSeconds: data.attendedSeconds,
            },
          };
        }
        return updated;
      });
    });

    // Snapshot of all live students when teacher joins a class room
    socketRef.current.on('live_state_snapshot', ({ students: liveStudents }) => {
      if (selectedRole !== 'teacher' || !liveStudents?.length) return;
      setStudents(prevStudents => {
        const updated = [...prevStudents];
        liveStudents.forEach(live => {
          // server always sends enrollmentNo — match on that only
          const index = updated.findIndex(s => s.enrollmentNo === live.enrollmentNo);
          if (index !== -1) {
            updated[index] = {
              ...updated[index],
              timerValue: live.attendedSeconds,
              isRunning: live.isRunning,
              status: live.status,
              attendanceSession: {
                ...(updated[index].attendanceSession || {}),
                isRunning: live.isRunning,
                status: live.status,
                attendedSeconds: live.attendedSeconds,
              },
            };
          }
        });
        return updated;
      });
    });

    // Listen for BSSID schedule updates (students only)
    socketRef.current.on('bssid-schedule-update', async (data) => {
      console.log('📡 BSSID schedule update received:', data);

      // Use ref so we always have the current studentId (avoids stale closure bug)
      if (selectedRoleRef.current === 'student' && studentIdRef.current && data.enrollmentNo === studentIdRef.current) {
        console.log(`   Reason: ${data.reason}`);
        console.log(`   Date: ${data.date}`);
        console.log(`   Periods: ${data.schedule.length}`);

        // Update cached BSSID schedule
        const saved = await BSSIDStorage.saveDailySchedule(data.schedule);

        if (saved) {
          console.log('✅ BSSID schedule updated in cache');

          // Immediately refresh offlinePeriod state so banner updates without waiting 60s
          const updatedPeriod = await BSSIDStorage.getCurrentPeriodBSSID();
          setOfflinePeriod(updatedPeriod);

          // Also update currentLecture in offlineTimerState if timer is running
          if (updatedPeriod) {
            setOfflineTimerState(prev => {
              if (!prev.isRunning) return prev;
              const updatedLecture = {
                ...prev.currentLecture,
                subject: updatedPeriod.subject || prev.currentLecture?.subject,
                teacher: updatedPeriod.teacher || updatedPeriod.teacherName || prev.currentLecture?.teacher,
                room: updatedPeriod.room || prev.currentLecture?.room,
                startTime: updatedPeriod.startTime || prev.currentLecture?.startTime,
                endTime: updatedPeriod.endTime || prev.currentLecture?.endTime,
                period: updatedPeriod.period || prev.currentLecture?.period,
              };
              if (OfflineTimerService.isRunning) {
                OfflineTimerService.currentLecture = updatedLecture;
              }
              return { ...prev, currentLecture: updatedLecture };
            });
          }

          // Show notification to user
          if (data.reason === 'classroom_bssid_updated') {
            showToast(`📶 WiFi updated for ${data.affectedRoom}`, 'info');
          } else if (data.reason === 'timetable_updated') {
            console.log('📅 Timetable updated - BSSID schedule refreshed');
          }
        }
      }
    });

    // Listen for timetable updates from server
    socketRef.current.on('timetable-update', async (data) => {
      console.log('📡 Timetable update received:', data);

      if (selectedRoleRef.current === 'student' && semesterRef.current && branchRef.current) {
        // Force refresh timetable with latest data
        await fetchTimetable(semesterRef.current, branchRef.current);
        showToast('📅 Timetable updated', 'success');
      }
    });
  };

  // Save lecture attendance when class ends
  // Load today's attendance from server (called on login)
  const loadTodayAttendance = async (studentIdValue) => {
    // Data is already available from login response via userData — no extra fetch needed.
    // attendanceSession is restored by OfflineTimerService on initialization.
    console.log('📥 Attendance session will be restored by OfflineTimerService');
  };

  // Removed saveLectureAttendance - server handles all attendance tracking

  // Calculate attendance statistics
  const getAttendanceStats = () => {
    const totalDays = attendanceHistory.length + (todayAttendance.lectures.length > 0 ? 1 : 0);
    const presentDays = attendanceHistory.filter(d => d.dayPresent).length + (todayAttendance.dayPresent ? 1 : 0);

    return {
      totalDays,
      presentDays,
      attendancePercentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0
    };
  };

  // Save attendance to server (period-specific for period changes)
  const saveAttendanceToServer = async (timerValue, status) => {
    if (!studentId) return;

    // If no parameters provided, get defaults
    if (timerValue === undefined) {
      if (todayAttendance.lectures.length === 0) return;
      timerValue = todayAttendance.totalAttended || 0;
    }
    if (status === undefined) {
      status = 'attending';
    }

    try {
      // Get current period info
      const currentPeriod = offlinePeriod || offlineTimerState.currentLecture;
      if (!currentPeriod || !currentPeriod.period) {
        console.log('⚠️ No period info available for saving attendance');
        return;
      }

      // Get server date for validation
      let clientDate;
      try {
        const serverTime = getServerTime();
        clientDate = serverTime.nowDate().toISOString();
      } catch {
        clientDate = new Date(_appGetBootMs()).toISOString();
      }

      // Get current timer state from OfflineTimerService if available
      let currentTimerSeconds = 0;
      try {
        const timerState = OfflineTimerService.getState();
        currentTimerSeconds = timerState.timerSeconds || 0;
      } catch (error) {
        console.log('Could not get timer state:', error);
      }

      console.log('📊 Saving period-specific attendance to server:');
      console.log('   Period:', currentPeriod.period);
      console.log('   Subject:', currentPeriod.subject);
      console.log('   Timer seconds:', currentTimerSeconds);

      // Use period-sync endpoint to save period-specific timer data (no check-in required)
      const response = await fetch(POST_ATTENDANCE_PERIOD_SYNC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,   // studentId === enrollmentNo always
          timerSeconds: currentTimerSeconds,
          period: currentPeriod.period,
          subject: currentPeriod.subject,
          teacher: currentPeriod.teacher || currentPeriod.teacherName,
          room: currentPeriod.room,
          semester,
          branch,
          timestamp: clientDate
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ Period attendance saved to server:', data);
      } else {
        console.log('⚠️ Failed to save period attendance:', data.error);
      }
    } catch (error) {
      console.log('❌ Error saving period attendance to server:', error);
    }
  };

  const loadConfig = async () => {
    try {
      // Load all data in parallel for better performance
      const [savedTheme, cachedUserData, cachedLoginId, cachedConfig, dailyVerification] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(USER_DATA_KEY),
        AsyncStorage.getItem(LOGIN_ID_KEY),
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(DAILY_VERIFICATION_KEY)
      ]);

      // Force theme to 'warm' (light) - ignore saved preference
      setThemeMode('warm');
      await AsyncStorage.setItem(THEME_KEY, 'warm');

      // Check for saved login data
      if (cachedUserData && cachedLoginId) {
        try {
          const userData = normalizeStudentUserData(JSON.parse(cachedUserData));
          setUserData(userData);
          setLoginId(cachedLoginId);
          setSelectedRole(userData.role);
          setShowLogin(false);

          if (userData.role === 'student') {
            setStudentName(userData.name);
            // studentId is always enrollmentNo — never fall back to _id
            setStudentId(userData.enrollmentNo);
            setSemester(userData.semester);
            setBranch(userData.branch);
            // Join class socket room so student receives random ring notifications
            joinClassRoom(userData.semester?.toString(), userData.branch);

            // Validate enrollment in background — don't block UI restore
            const enrollmentNo = userData.enrollmentNo;
            if (enrollmentNo) {
              fetch(`${GET_STUDENT_VALIDATE}?enrollmentNo=${encodeURIComponent(enrollmentNo)}`)
                .then(r => r.json())
                .then(validateData => {
                  if (validateData.valid === false) {
                    console.log('🚫 Enrollment invalid — clearing session');
                    AsyncStorage.multiRemove([USER_DATA_KEY, LOGIN_ID_KEY, ROLE_KEY, STUDENT_NAME_KEY, STUDENT_ID_KEY, DAILY_VERIFICATION_KEY]);
                    setUserData(null);
                    setLoginId(null);
                    setSelectedRole(null);
                    setShowLogin(true);
                    Alert.alert('Enrollment Invalid', 'Your enrollment is no longer valid. Please contact administration.', [{ text: 'OK' }]);
                  }
                })
                .catch(() => console.log('⚠️ Enrollment validation skipped (network error)'));
            }

            if (userData.semester) {
              AsyncStorage.setItem(SEMESTER_KEY, userData.semester).catch(() => { });
            }
            if (userData.branch) {
              AsyncStorage.setItem(BRANCH_KEY, userData.branch).catch(() => { });
            }

            // Check if face verification is still valid for today
            if (dailyVerification) {
              try {
                const verificationData = JSON.parse(dailyVerification);
                const serverTime = getServerTime();
                const today = new Date(serverTime.now()).toDateString();

                // Face verification removed - auto-start timer if session exists
                if (verificationData.date === today &&
                  verificationData.verified &&
                  verificationData.studentId === userData.enrollmentNo) {
                  console.log('✅ Restoring session from today');
                  // Face verification removed - no longer needed

                  // Auto-start timer
                  setTimeout(() => {
                    // Timer removed - period-based attendance
                    console.log('▶️ Timer auto-started from saved session');
                  }, 1000);
                } else {
                  // Session expired or different student
                  console.log('🔄 Session expired or different student');
                  await AsyncStorage.removeItem(DAILY_VERIFICATION_KEY);
                }
              } catch (parseError) {
                console.log('Error parsing session data:', parseError);
                await AsyncStorage.removeItem(DAILY_VERIFICATION_KEY);
              }
            }
          } else if (userData.role === 'teacher') {
            // For teachers: fetch students and set up timetable from stored preferences
            // Check if teacher has stored semester/branch preferences
            const storedSemester = await AsyncStorage.getItem(SEMESTER_KEY);
            const storedBranch = await AsyncStorage.getItem(BRANCH_KEY);
            
            if (storedSemester && storedBranch) {
              console.log('📚 Restoring teacher preferences:', storedSemester, storedBranch);
              setSemester(storedSemester);
              setBranch(storedBranch);
              setManualSelection({ semester: storedSemester, branch: storedBranch });
              setCurrentClassInfo({
                subject: 'Manual Selection',
                branch: storedBranch,
                semester: storedSemester,
                isManual: true
              });
            }
            
            fetchStudents();
          }
        } catch (parseError) {
          console.log('Error parsing cached user data:', parseError);
          // Clear corrupted data
          await AsyncStorage.multiRemove([USER_DATA_KEY, LOGIN_ID_KEY]);
          setShowLogin(true);
        }
      } else {
        // No cached session — show login screen
        setShowLogin(true);
      }

      // Load cached config
      if (cachedConfig) {
        try {
          setConfig(JSON.parse(cachedConfig));
        } catch (parseError) {
          console.log('Error parsing cached config:', parseError);
        }
      }

      // Fetch fresh config from server
      fetchConfig();
    } catch (error) {
      console.log('Error loading cache:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  const toggleTheme = () => setShowThemePicker(true);

  const selectTheme = async (mode) => {
    setThemeMode(mode);
    setShowThemePicker(false);
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => { });
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setConfig(data);
      // Timer duration from config is no longer used - attendance based on actual lecture time

      // Fetch dynamic app configuration (branches, semesters, etc.)
      try {
        const appConfigResponse = await fetch(GET_CONFIG_APP);
        const appConfigData = await appConfigResponse.json();
        if (appConfigData.success) {
          console.log('✅ Loaded dynamic app config:', appConfigData.config);
          // Store for later use (branches, semesters, etc.)
          await AsyncStorage.setItem('@app_config', JSON.stringify(appConfigData.config));
        }
      } catch (configError) {
        console.log('Could not load dynamic config:', configError);
      }
    } catch (error) {
      console.log('Using cached config');
    }
  };

  const joinClassRoom = (sem, br) => {
    if (!socketRef.current || !sem || !br) return;
    // Leave old room first
    if (currentClassRoomRef.current) {
      const { semester: oldSem, branch: oldBr } = currentClassRoomRef.current;
      if (oldSem !== sem || oldBr !== br) {
        socketRef.current.emit('leave_class_room', { semester: oldSem, branch: oldBr });
      }
    }
    socketRef.current.emit('join_class_room', { semester: sem, branch: br });
    currentClassRoomRef.current = { semester: sem, branch: br };
  };

  const fetchStudents = async (overrideSelection) => {
    try {
      // Use override (e.g. from filter dialog) or current state
      const effectiveSelection = overrideSelection ?? manualSelection;

      // When teacher has chosen a filter (branch + semester), use it first so list reflects their selection
      if (selectedRole === 'teacher' && effectiveSelection.semester !== 'auto' && effectiveSelection.branch) {
        const manualResponse = await fetch(`${GET_VIEW_RECORDS_STUDENTS}?semester=${encodeURIComponent(effectiveSelection.semester)}&branch=${encodeURIComponent(effectiveSelection.branch)}`);
        const manualData = await manualResponse.json();
        if (manualData.success) {
          console.log(`✅ Filter: ${manualData.students?.length || 0} students for ${effectiveSelection.branch} Sem ${effectiveSelection.semester}`);
          setStudents(manualData.students || []);
          joinClassRoom(effectiveSelection.semester, effectiveSelection.branch);
          setCurrentClassInfo({
            subject: 'Manual Selection',
            branch: effectiveSelection.branch,
            semester: effectiveSelection.semester,
            isManual: true
          });
          return;
        }
      }

      // For teachers, otherwise use current class from timetable
      if (selectedRole === 'teacher' && loginId) {
        console.log(`🔍 Fetching students for teacher: ${loginId}`);
        const response = await fetch(GET_TEACHER_CURRENT_CLASS_STUDENTS(loginId));
        const data = await response.json();

        if (data.success) {
          if (data.hasActiveClass) {
            console.log(`✅ Found ${data.students?.length || 0} students in current class`);
            console.log(`📚 Current class: ${data.currentClass?.subject} - ${data.currentClass?.branch} Sem ${data.currentClass?.semester}`);
            setStudents(data.students || []);
            joinClassRoom(data.currentClass?.semester?.toString(), data.currentClass?.branch);
            setCurrentClassInfo(data.currentClass);

            // Update semester and branch to match current class (for other components)
            setSemester(data.currentClass.semester.toString());
            setBranch(data.currentClass.branch);
            return;
          }

          console.log('ℹ️  No active class right now');
        }

        // No active class and no manual selection
        setStudents([]);
        setCurrentClassInfo(null);
        return;
      }

      if (selectedRole === 'teacher' && !loginId && semester && branch) {
        // Fallback: only if loginId not available AND semester/branch are explicitly set
        console.log(`📊 Fetching students for ${branch} Semester ${semester} (fallback - no loginId)`);
        const response = await fetch(`${GET_VIEW_RECORDS_STUDENTS}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`);
        const data = await response.json();
        if (data.success) {
          setStudents(data.students || []);
        }
      }
    } catch (error) {
      console.log('Error fetching students:', error);
      // Show user-friendly feedback for network errors
      if (selectedRole === 'teacher') {
        showToast('⚠️ Could not load students. Check your connection.', 'error');
      }
    }
  };

  // Fetch single student and add to list (for instant updates)
  const fetchStudentForList = async (studentId) => {
    try {
      console.log('🔍 Fetching student details for instant add:', studentId);
      const response = await fetch(`${GET_STUDENT_MANAGEMENT}?enrollmentNo=${encodeURIComponent(studentId)}`);
      const data = await response.json();
      if (data.success && data.student) {
        setStudents(prev => {
          // Check if student already exists
          const exists = prev.some(s =>
            s._id === data.student._id ||
            s.enrollmentNo === data.student.enrollmentNo ||
            s.enrollmentNo === studentId
          );
          if (!exists) {
            console.log('✅ Instantly added student to list:', data.student.name);
            return [...prev, data.student];
          }
          return prev;
        });
      }
    } catch (error) {
      console.log('Error fetching student for list:', error);
      // Fallback: refresh entire list
      fetchStudents();
    }
  };

  const fetchStudentDetails = async (student) => {
    setSelectedStudent(student);
    setLoadingDetails(true);

    try {
      // Fetch student management details
      const detailsResponse = await fetch(`${GET_STUDENT_MANAGEMENT}?enrollmentNo=${encodeURIComponent(student.enrollmentNo)}`);
      const detailsData = await detailsResponse.json();

      // Fetch attendance records (last 30 days) - use server time
      let thirtyDaysAgo;
      try {
        const serverTime = getServerTime();
        thirtyDaysAgo = new Date(serverTime.now());
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      } catch {
        thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      }
      const recordsResponse = await fetch(`${GET_ATTENDANCE_RECORDS}?studentId=${encodeURIComponent(student.enrollmentNo)}&startDate=${thirtyDaysAgo.toISOString()}`);
      const recordsData = await recordsResponse.json();

      // Fetch attendance statistics
      const statsResponse = await fetch(`${GET_ATTENDANCE_STATS}?studentId=${encodeURIComponent(student.enrollmentNo)}`);
      const statsData = await statsResponse.json();

      if (detailsData.success) {
        setStudentDetails(detailsData.student);
      }
      if (recordsData.success) {
        setAttendanceRecords(recordsData.records);
      }
      if (statsData.success) {
        setAttendanceStats(statsData.stats);
      }
    } catch (error) {
      console.log('Error fetching student details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeStudentDetails = () => {
    setSelectedStudent(null);
    setStudentDetails(null);
    setAttendanceRecords([]);
    setAttendanceStats(null);
  };

  // Convert timetable format for CircularTimer (supports dynamic days)
  const convertTimetableFormat = (timetable) => {
    if (!timetable || !timetable.timetable) return null;

    const schedule = {};
    // Get days dynamically from timetable in proper week order
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKeys = Object.keys(timetable.timetable).sort((a, b) =>
      dayOrder.indexOf(a.toLowerCase()) - dayOrder.indexOf(b.toLowerCase())
    );

dayKeys.forEach((dayKey) => {
      const dayName = dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
      console.log(`🔍 Processing day: ${dayKey} → ${dayName}`);
      if (timetable.timetable[dayKey]) {
        schedule[dayName] = timetable.timetable[dayKey].map((period, idx) => {
          // Get period info from the periods array
          const periodInfo = timetable.periods && timetable.periods[idx];
          
          // Construct time: prefer periods array, fallback to period object, then calculate default 45-min periods from 08:00
          let periodTime = '';
          if (periodInfo && periodInfo.startTime && periodInfo.endTime) {
            periodTime = `${periodInfo.startTime}-${periodInfo.endTime}`;
          } else if (period.startTime && period.endTime) {
            periodTime = `${period.startTime}-${period.endTime}`;
          } else {
            // Generate default 45-min period times starting from 08:00
            const startHour = 8 + Math.floor((idx * 45) / 60);
            const startMinute = (idx * 45) % 60;
            const endHour = 8 + Math.floor(((idx + 1) * 45) / 60);
            const endMinute = ((idx + 1) * 45) % 60;
            periodTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
          }
          
          return {
            period: period.period || (idx + 1),
            subject: period.subject || '',
            teacher: period.teacher || period.teacherName || '',
            teacherName: period.teacherName || period.teacher || '',
            room: period.room || '',
            time: periodTime,
            isBreak: period.isBreak
          };
        });
        console.log(`✅ ${dayName} schedule created with ${schedule[dayName].length} periods`);
      }
    });

    console.log('Converted timetable schedule (dynamic days):', schedule);
    console.log('Schedule keys:', Object.keys(schedule));

    const result = { ...timetable, schedule };
    console.log('🎯 Returning timetable with schedule:', {
      hasSchedule: !!result.schedule,
      scheduleKeys: Object.keys(result.schedule),
      sundayExists: 'Sunday' in result.schedule,
      sundayLength: result.schedule.Sunday?.length
    });

    return result;
  };

  const fetchTimetable = async (sem, br) => {
    try {
      console.log('🔄 Fetching timetable for:', sem, br);
      const branchParam = encodeURIComponent(br);
      const response = await fetch(GET_TIMETABLE_BY_SEMESTER_BRANCH(sem, branchParam));
      console.log('✅ Response status:', response.status);
      const data = await response.json();

      const rawDays = data.timetable?.timetable ? Object.keys(data.timetable.timetable) : [];
      console.log('📥 RAW days from server:', rawDays.join(', '));
      console.log('🔍 Sunday in raw data?', rawDays.includes('sunday') ? 'YES ✅' : 'NO ❌');

      if (data.success) {
        const convertedTimetable = convertTimetableFormat(data.timetable);
        const convertedDays = convertedTimetable?.schedule ? Object.keys(convertedTimetable.schedule) : [];
        console.log('📤 Converted schedule days:', convertedDays.join(', '));
        console.log('🔍 Sunday in converted?', convertedDays.includes('Sunday') ? 'YES ✅' : 'NO ❌');

        // Validate that all 7 days are present
        const expectedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const missingDays = expectedDays.filter(day => !convertedDays.includes(day));
        if (missingDays.length > 0) {
          console.warn('⚠️ WARNING: Timetable is missing days:', missingDays.join(', '));
          console.warn('  This might be an old timetable. Consider clearing app data.');
        }

        setTimetable(convertedTimetable);
        console.log('✅ Timetable set successfully');
      }
    } catch (error) {
      console.log('❌ Error fetching timetable:', error);
    }
  };

  // Fetch and cache daily BSSID schedule
  const fetchDailyBSSIDSchedule = async (enrollmentNo, forceRefresh = false) => {
    try {
      // Check if refresh needed (skip check if force refresh)
      if (!forceRefresh) {
        const needsRefresh = await BSSIDStorage.needsRefresh();

        if (!needsRefresh) {
          console.log('✅ Using cached BSSID schedule');
          return;
        }
      }

      console.log('🔄 Fetching fresh BSSID schedule...');

      const response = await fetch(
        `${GET_DAILY_BSSID_SCHEDULE}?enrollmentNo=${encodeURIComponent(enrollmentNo)}`
      );

      const data = await response.json();

      if (data.success && data.schedule) {
        await BSSIDStorage.saveDailySchedule(data.schedule);
        console.log(`✅ Cached ${data.schedule.length} periods for ${data.dayName}`);

        // Also refresh face embedding cache whenever the offline schedule is updated.
        // This keeps the face data in sync with the BSSID schedule so both are
        // always fresh after any online sync, and offline face verification always
        // has the latest embedding available.
        (async () => {
          try {
            const faceResponse = await fetch(
              `${SOCKET_URL}/api/students/${enrollmentNo}/face-data`,
              { method: 'GET', headers: { 'Content-Type': 'application/json' } }
            );
            if (faceResponse.ok) {
              const faceData = await faceResponse.json();
              if (faceData.success && Array.isArray(faceData.faceEmbedding) && faceData.faceEmbedding.length > 0) {
                const enrolledAt = faceData.enrolledAt || new Date().toISOString();
                await SecureStorage.saveCachedServerEmbedding(faceData.faceEmbedding, enrolledAt);
                console.log('✅ Face embedding refreshed alongside BSSID schedule update');
              }
            }
          } catch (_) {
            // Silently ignore — BSSID schedule save already succeeded
          }
        })();
      } else {
        console.log('⚠️ No BSSID schedule available:', data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching BSSID schedule:', error);
    }
  };

  // Auto-refresh timetable every 60 seconds to get period updates
  useEffect(() => {
    if (selectedRole === 'student' && semester && branch && !showLogin) {
      const refreshInterval = setInterval(() => {
        fetchTimetable(semester, branch);
      }, 30 * 1000); // Refresh every 30 seconds for faster updates

      return () => clearInterval(refreshInterval);
    }
  }, [selectedRole, semester, branch, showLogin]);

  // Periodically rejoin class room to survive server restarts and silent socket drops
  useEffect(() => {
    if (selectedRole === 'student' && semester && branch && !showLogin) {
      const rejoinInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.connected) {
          console.log('🔄 Periodic class room rejoin (keep-alive)...');
          joinClassRoom(semester?.toString(), branch);
        }
      }, 60000); // Every 60 seconds

      return () => clearInterval(rejoinInterval);
    }
  }, [selectedRole, semester, branch, showLogin]);

  const saveTimetable = async (updatedTimetable) => {
    try {
      const response = await fetch(POST_TIMETABLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTimetable)
      });
      const data = await response.json();
      if (data.success) {
        setTimetable(data.timetable);
        alert('Timetable saved successfully!');
      }
    } catch (error) {
      console.log('Error saving timetable:', error);
      alert('Failed to save timetable');
    }
  };

  const handleRoleSelect = async (role) => {
    try {
      await AsyncStorage.setItem(ROLE_KEY, role);
      setSelectedRole(role);
      if (role === 'student') {
        setShowNameInput(true);
      } else if (role === 'teacher') {
        fetchStudents();
      }
    } catch (error) {
      console.log('Error saving role:', error);
    }
  };

  const handleNameSubmit = async () => {
    // Old anonymous name-only registration flow — replaced by full login.
    // Redirect to login screen instead of calling the old /api/student/register.
    if (!studentName.trim()) return;
    console.log('ℹ️ handleNameSubmit: old flow — redirecting to login screen');
    setShowNameInput(false);
    setShowLogin(true);
  };

  // Timer runs continuously when started - no countdown logic needed
  // Attendance is tracked per lecture based on actual class time
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRunning]);

  const updateTimerOnServer = async (timer, running, status = null) => {
    // Legacy function - kept for compatibility but server handles all tracking
    if (!studentId) {
      console.log('⚠️ No studentId for timer update');
      return;
    }

    if (!socketRef.current || !socketRef.current.connected) {
      console.log('⚠️ Socket not connected, reconnecting...');
      setupSocket();
      return;
    }

    let finalStatus = status;
    if (!finalStatus) {
      if (running) finalStatus = 'attending';
      else finalStatus = 'absent';
    }

    console.log('📡 Sending timer update:', { studentId, timer, running, status: finalStatus });

    socketRef.current.emit('timer_update', {
      studentId,          // === enrollmentNo always
      studentName: studentName,
      timerValue: timer,
      isRunning: running,
      status: finalStatus,
      semester,
      branch
    });

    // Save attendance record when timer completes or student marks present/absent
    if (finalStatus === 'present' || finalStatus === 'absent') {
      try {
        // Get server date for validation
        let clientDate;
        try {
          const serverTime = getServerTime();
          clientDate = serverTime.nowDate().toISOString();
        } catch {
          clientDate = new Date(_appGetBootMs()).toISOString();
        }

        // POST_ATTENDANCE_RECORD now routes to /api/attendance/period-sync
        await fetch(POST_ATTENDANCE_RECORD, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            timerSeconds: timer,
            period: offlineTimerState?.currentLecture?.period || 'P1',
            subject: offlineTimerState?.currentLecture?.subject || '',
            teacher: offlineTimerState?.currentLecture?.teacher || '',
            room: offlineTimerState?.currentLecture?.room || '',
            semester,
            branch,
            timestamp: clientDate
          })
        });
      } catch (error) {
        console.log('Error saving attendance record:', error);
      }
    }
  };

  // WiFi validation function - SAFE IMPLEMENTATION WITH DEBUG INFO
  // Check if connected to the authorized classroom WiFi
  const isConnectedToClassroomWiFi = async (suppressAlerts = false) => {
    try {
      console.log('📶 Starting WiFi validation...');

      // Check for simulated bypass (for testing)
      if (wifiDebugInfo.status === 'AUTHORIZED (SIMULATED)') {
        console.log('🧪 Using simulated WiFi validation for testing');
        return true;
      }

      // DEVELOPMENT MODE: Always allow bypass for testing
      if (__DEV__) {
        console.warn('⚠️ Development mode: Bypassing WiFi validation for testing');
        setWifiDebugInfo({
          status: 'AUTHORIZED (DEV MODE)',
          currentBSSID: 'Development bypass',
          expectedBSSID: 'Not required in dev',
          room: currentClassInfo?.room || 'Dev room',
          lastChecked: new Date().toLocaleTimeString()
        });
        return true;
      }

      // Check if we have current class info
      if (!currentClassInfo || !currentClassInfo.room) {
        console.log('❌ No classroom info available for WiFi check');
        setWifiDebugInfo({
          status: 'No classroom info',
          currentBSSID: 'N/A',
          expectedBSSID: 'N/A',
          room: 'N/A',
          lastChecked: new Date().toLocaleTimeString()
        });

        // In production, show user-friendly message only if requested
        if (!suppressAlerts) {
          alert('⚠️ No Active Class\n\nNo classroom information available for WiFi validation.\n\nPlease ensure you have an active class scheduled.');
        }
        return false;
      }

      // Check if WiFiManager is available
      if (!WiFiManager) {
        console.error('❌ WiFiManager not available');

        setWifiDebugInfo({
          status: 'WiFiManager not available',
          currentBSSID: 'N/A',
          expectedBSSID: 'N/A',
          room: currentClassInfo.room
        });

        // Show user-friendly error
        if (!suppressAlerts) {
          alert('⚠️ WiFi System Error\n\nWiFi validation system is not available.\n\nPlease restart the app and try again.');
        }
        return false;
      }

      console.log('✅ WiFiManager available');

      // Initialize WiFi manager with error handling
      try {
        const initResult = await WiFiManager.initialize();
        console.log('✅ WiFiManager initialized:', initResult);
      } catch (initError) {
        console.error('❌ WiFiManager initialization failed:', initError);
        setWifiDebugInfo({
          status: 'INIT ERROR',
          currentBSSID: 'Initialization failed',
          expectedBSSID: 'N/A',
          room: currentClassInfo.room,
          lastChecked: new Date().toLocaleTimeString(),
          reason: initError.message
        });
        return false;
      }

      // Load authorized BSSIDs for current student
      try {
        console.log('📥 Loading authorized BSSIDs with params:', {
          serverUrl: SOCKET_URL,
          semester,
          course: branch,
          enrollmentNo: studentId,
          room: currentClassInfo.room
        });

        await WiFiManager.loadAuthorizedBSSIDs(SOCKET_URL, {
          semester,
          course: branch,
          enrollmentNo: studentId
        });
        console.log('✅ Authorized BSSIDs loaded');

        // Debug: Show what BSSIDs were loaded
        const wifiStatus = WiFiManager.getStatus();
        console.log(`📋 Loaded ${wifiStatus.authorizedBSSIDsCount} authorized BSSIDs`);

      } catch (loadError) {
        console.error('❌ Failed to load authorized BSSIDs:', loadError);
        setWifiDebugInfo({
          status: 'CONFIG ERROR',
          currentBSSID: 'N/A',
          expectedBSSID: 'Failed to load from server',
          room: currentClassInfo.room,
          lastChecked: new Date().toLocaleTimeString(),
          reason: loadError.message
        });
        return false;
      }

      // Check if current BSSID is authorized for this room
      let authResult;
      try {
        console.log(`🔍 Checking authorization for room: ${currentClassInfo.room}`);
        authResult = await WiFiManager.isAuthorizedForRoom(currentClassInfo.room);

        console.log('📶 === WiFi Authorization Result ===');
        console.log('   Authorized:', authResult.authorized);
        console.log('   Current BSSID:', authResult.currentBSSID);
        console.log('   Expected BSSID:', authResult.expectedBSSID);
        console.log('   Reason:', authResult.reason);
        console.log('   Room Info:', authResult.roomInfo);
        console.log('================================');

        // Update debug info with actual values
        setWifiDebugInfo({
          status: authResult.authorized ? 'AUTHORIZED' : 'NOT AUTHORIZED',
          currentBSSID: authResult.currentBSSID || 'Not detected',
          expectedBSSID: authResult.expectedBSSID || 'Not configured',
          room: currentClassInfo.room,
          lastChecked: new Date().toLocaleTimeString(),
          reason: authResult.reason || 'unknown'
        });

      } catch (authError) {
        console.error('❌ WiFi authorization check failed:', authError);
        setWifiDebugInfo({
          status: 'ERROR',
          currentBSSID: 'Error getting BSSID',
          expectedBSSID: 'Error loading config',
          room: currentClassInfo.room,
          lastChecked: new Date().toLocaleTimeString(),
          reason: authError.message
        });
        return false;
      }

      if (!authResult || !authResult.authorized) {
        console.log(`❌ WiFi validation FAILED: ${authResult?.reason || 'unknown'}`);

        // Provide user-friendly error messages based on the reason
        let userMessage = '';
        switch (authResult?.reason) {
          case 'no_wifi':
            userMessage = '📶 WiFi Not Connected\n\nYou are not connected to any WiFi network.\n\nPlease:\n1. Enable WiFi on your device\n2. Connect to the classroom WiFi\n3. Try again';
            break;
          case 'wrong_bssid':
            userMessage = `📶 Wrong WiFi Network\n\nYou are connected to the wrong WiFi network.\n\nExpected: Classroom ${currentClassInfo.room}\nCurrent: ${authResult.currentBSSID || 'Unknown'}\n\nPlease connect to the correct classroom WiFi.`;
            break;
          case 'room_not_configured':
            userMessage = `⚙️ Room Not Configured\n\nRoom ${currentClassInfo.room} is not configured for WiFi validation.\n\nPlease contact your administrator.`;
            break;
          default:
            userMessage = `❌ WiFi Validation Failed\n\nReason: ${authResult?.reason || 'Unknown error'}\n\nPlease ensure you are connected to the classroom WiFi network.`;
        }

        // Don't show alert here - let the calling function handle it
        console.log('📱 User message prepared:', userMessage);
        return false;
      }

      console.log(`✅ WiFi validation PASSED - Connected to ${currentClassInfo.room}`);
      return true;

    } catch (error) {
      console.error('❌ Critical error in WiFi validation:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);

      // Update debug info with error
      setWifiDebugInfo({
        status: 'CRITICAL ERROR',
        currentBSSID: 'Error',
        expectedBSSID: 'Error',
        room: currentClassInfo?.room || 'Unknown',
        lastChecked: new Date().toLocaleTimeString(),
        reason: error.message
      });

      // CRITICAL: Any error in WiFi validation should block timer
      return false;
    }
  };

  // Periodic sync to server during active classes for admin panel visibility
  const startPeriodicSync = () => {
    if (periodicSyncRef.current) {
      clearInterval(periodicSyncRef.current);
    }

    periodicSyncRef.current = setInterval(async () => {
      if (offlineTimerState.isRunning && userData) {
        saveAttendanceToServer(offlineTimerState.elapsedSeconds, 'attending');
        console.log('🔄 Periodic attendance sync to server');
      }
    }, 2 * 60 * 1000); // Sync every 2 minutes during active class
  };

  const stopPeriodicSync = () => {
    if (periodicSyncRef.current) {
      clearInterval(periodicSyncRef.current);
      periodicSyncRef.current = null;
    }
  };

  // Handle face verification trigger from CircularTimer
  const handleFaceVerification = async () => {
    console.log('🔒 Face verification triggered from CircularTimer');

    // Only allow face verification during active class
    if (!currentClassInfo || currentClassInfo.currentLecture === 'Break') {
      alert('⚠️ Face verification is only available during active lectures.\n\nPlease wait for your class to start.');
      return;
    }

    try {
      // Get stored face embedding from SecureStorage
      const storedEmbedding = await SecureStorage.getFaceEmbedding();

      if (!storedEmbedding || storedEmbedding.length !== 192) {
        console.log('❌ No face data found or invalid');
        alert('❌ Face Data Not Found\n\nYour face data is not enrolled on this device.\n\nPlease login again to download your face data, or contact your teacher to enroll your face.');
        return;
      }

      console.log('✅ Face data loaded from storage (192 floats)');
      console.log('📸 Opening camera for face verification...');

      // Start face verification using native module
      const verificationResult = await FaceVerification.verifyFace(storedEmbedding);

      console.log('🔍 Face verification result:', verificationResult);

      if (!verificationResult.success || !verificationResult.isMatch) {
        console.log('❌ Face verification failed');
        alert(`❌ Face Verification Failed\n\n${verificationResult.message}\n\nSimilarity: ${verificationResult.similarityPercentage}%\n\nPlease try again or contact your teacher if you believe this is an error.`);
        return;
      }

      console.log('✅ Face verified successfully!');
      console.log(`   Similarity: ${verificationResult.similarityPercentage}%`);
      alert(`✅ Face Verified!\n\nYour identity has been confirmed.\n\nSimilarity: ${verificationResult.similarityPercentage}%`);

} catch (error) {
      console.error('❌ Face verification error:', error);

      if (error.message === 'VERIFICATION_CANCELLED') {
        alert('❌ Verification Cancelled\n\nFace verification was cancelled.');
      } else {
        alert(`❌ Face Verification Error\n\n${error.message}\n\nPlease try again or contact support if the issue persists.`);
      }
    }
  };

  // Handle segment press from CircularTimer - Show past timer data or live timer state
  const handleSegmentPress = async (segment) => {
    console.log('🎯 Segment pressed:', segment);
    console.log('   Segment ID:', segment.id);
    console.log('   Full Label:', segment.fullLabel);
    console.log('   Time:', segment.time);
    console.log('   Room:', segment.room);

    // Get current time and date for comparison
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // Parse segment time (format: "HH:MM-HH:MM")
    let segmentStatus = 'future';
    let segmentTime = segment.time || '';
    
    if (segmentTime && segmentTime.includes('-')) {
      try {
        const [startTimeStr, endTimeStr] = segmentTime.split('-');
        const [startHour, startMin] = startTimeStr.split(':').map(Number);
        const [endHour, endMin] = endTimeStr.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        if (currentTime > endMinutes) {
          segmentStatus = 'past';
        } else if (currentTime >= startMinutes && currentTime <= endMinutes) {
          segmentStatus = 'current';
        }
      } catch (e) {
        console.warn('Error parsing segment time:', e);
      }
    }

    const displaySubject = segment.fullLabel || segment.label || 'Unknown';
    const displayRoom = segment.room || 'N/A';
    const displayTime = segmentTime || 'N/A';
    const displayPeriod = segment.id ? `P${segment.id}` : '';

    // For past periods - fetch attendance data from server and show modal
    if (segmentStatus === 'past') {
      try {
        console.log('📊 Fetching attendance data for past period...');
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const response = await fetch(`${SOCKET_URL}/api/attendance/student/${studentId}/date/${today}`);
        const data = await response.json();
        
        let periodAttendance = null;
        if (data.success && data.record && data.record.lectures) {
          periodAttendance = data.record.lectures.find(l => l.period === `P${segment.id}`);
        }
        
        if (periodAttendance) {
          setPastPeriodData({
            period: `P${segment.id}`,
            subject: displaySubject,
            room: displayRoom,
            time: displayTime,
            attended: periodAttendance.attended || 0,
            total: periodAttendance.total || 0,
            percentage: periodAttendance.percentage || 0,
            present: periodAttendance.present || false
          });
        } else {
          setPastPeriodData({
            period: `P${segment.id}`,
            subject: displaySubject,
            room: displayRoom,
            time: displayTime,
            attended: 0,
            total: 0,
            percentage: 0,
            present: false,
            notFound: true
          });
        }
        setViewingPastPeriod(true);
      } catch (error) {
        console.error('❌ Error fetching past period data:', error);
        alert(`❌ Error fetching data\n\nCould not load attendance for ${displayPeriod}. ${displaySubject}`);
      }
    } else if (segmentStatus === 'current') {
      // For current period - go back to live timer
      setViewingPastPeriod(false);
      setPastPeriodData(null);
    } else {
      // Future period - show info in timer UI format
      setPastPeriodData({
        period: displayPeriod,
        subject: displaySubject,
        room: displayRoom,
        time: displayTime,
        attended: 0,
        total: 0,
        percentage: 0,
        present: false,
        isFuture: true
      });
      setViewingPastPeriod(true);
    }
  };

  // Close past period view and return to live timer state
  const closePastPeriodView = () => {
    setViewingPastPeriod(false);
    setPastPeriodData(null);
  };

  // Face verify after teacher rejection during random ring
  const handleRandomRingFaceVerify = async () => {
    if (!randomRingData) return;

    console.log('🔒 Random Ring face verification triggered, isRejection:', randomRingData.isRejection);

    try {
      // Get stored face embedding
      const storedEmbedding = await SecureStorage.getFaceEmbedding();
      if (!storedEmbedding || storedEmbedding.length !== 192) {
        alert('❌ Face Data Not Found\n\nYour face data is not enrolled on this device.\n\nPlease contact your teacher.');
        return;
      }

      // Run face verification
      const verificationResult = await FaceVerification.verifyFace(storedEmbedding);
      console.log('🔍 Random Ring face result:', verificationResult);

      if (!verificationResult.success || !verificationResult.isMatch) {
        alert(`❌ Face Verification Failed\n\nSimilarity: ${verificationResult.similarityPercentage}%\n\nPlease try again.`);
        return; // Keep banner open — multiple chances
      }

      // Face passed — get current BSSID
      let currentBSSID = null;
      try {
        const wifiResult = await NativeWiFiService.validateWiFiWithPermissions();
        if (wifiResult && wifiResult.bssid) {
          currentBSSID = wifiResult.bssid;
        }
      } catch (wifiErr) {
        console.warn('⚠️ WiFi check failed:', wifiErr.message);
      }

      // Choose endpoint based on flow path
      const endpoint = randomRingData.isRejection
        ? POST_RANDOM_RING_VERIFY_AFTER_REJECTION
        : POST_RANDOM_RING_VERIFY_DIRECT;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          randomRingId: randomRingData.randomRingId,
          studentId,
          bssid: currentBSSID,
        }),
      });
      const result = await res.json();

      if (result.success) {
        // Timer resume + compensation handled by random_ring_face_verification_success socket event
        console.log('✅ Face verify accepted by server via', endpoint);
      } else {
        alert('❌ Verification failed: ' + (result.error || 'Unknown error'));
      }

    } catch (error) {
      console.error('❌ Random Ring face verify error:', error);
      if (error.message === 'VERIFICATION_CANCELLED') {
        alert('❌ Verification Cancelled. You can try again.');
      } else {
        alert(`❌ Error: ${error.message}\n\nPlease try again.`);
      }
    }
  };

  const handleStartPause = async () => {
    // Only allow starting, no pausing
    if (isRunning) {
      // Already running, do nothing
      return;
    }

    // Check if there's an active class
    if (!currentClassInfo) {
      alert('❌ No Active Class\n\nNo lecture is currently scheduled.\n\nPlease wait for the next lecture to start.');
      return;
    }

    console.log('🔒 Starting attendance validation process...');

    // Step 0: Check and request location permissions FIRST
    console.log('🔐 Step 0: Checking location permissions...');
    if (Platform.OS === 'android') {
      // Use string constants directly to avoid null permission constants issue
      const FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION';
      const COARSE_LOCATION = 'android.permission.ACCESS_COARSE_LOCATION';

      const fineLocationGranted = await PermissionsAndroid.check(FINE_LOCATION);
      const coarseLocationGranted = await PermissionsAndroid.check(COARSE_LOCATION);

      console.log('🔐 Permission status:');
      console.log('   Fine location:', fineLocationGranted);
      console.log('   Coarse location:', coarseLocationGranted);

      if (!fineLocationGranted && !coarseLocationGranted) {
        console.log('🔐 Location permission not granted - requesting...');

        // Request fine location permission with explanation
        const granted = await PermissionsAndroid.request(
          FINE_LOCATION,
          {
            title: 'Location Permission Required',
            message: 'This app needs location permission to detect WiFi network details (BSSID) for attendance verification.\n\nThis is required by Android for security reasons.\n\nNo location data is collected or stored.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        console.log('🔐 Permission request result:', granted);

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('❌ Location permission denied');
          alert('❌ Permission Required\n\nLocation permission is required for WiFi-based attendance verification.\n\nPlease grant permission in device settings to continue.');
          return;
        }

        console.log('✅ Location permission granted');
      } else {
        console.log('✅ Location permission already granted');
      }
    }

    // CRITICAL: WiFi + Face verification required to start timer
    // This prevents students from faking attendance from home

    // 1. Check WiFi connection first (ASYNC)
    console.log('📶 Step 1: Validating WiFi connection...');
    const wifiValid = await isConnectedToClassroomWiFi(false); // Explicitly show alerts for manual start
    if (!wifiValid) {
      // Check if it's a simulated bypass
      if (wifiDebugInfo.status === 'AUTHORIZED (SIMULATED)') {
        console.log('🧪 WiFi bypass is active, proceeding...');
      } else {
        alert('❌ WiFi Validation Failed\n\nYou must be connected to the classroom WiFi to start attendance tracking.\n\nPlease connect to the authorized classroom network and try again.\n\n💡 Tip: If you\'re having WiFi issues, use the "Bypass WiFi Check" button for testing.');
        return;
      }
    }

    // 2. Face Verification (ASYNC)
    console.log('👤 Step 2: Starting face verification...');
    try {
      // Get stored face embedding from SecureStorage
      const storedEmbedding = await SecureStorage.getFaceEmbedding();

      if (!storedEmbedding || storedEmbedding.length !== 192) {
        console.log('❌ No face data found or invalid');
        alert('❌ Face Data Not Found\n\nYour face data is not enrolled on this device.\n\nPlease login again to download your face data, or contact your teacher to enroll your face.');
        return;
      }

      console.log('✅ Face data loaded from storage (192 floats)');
      console.log('📸 Opening camera for face verification...');

      // Start face verification using native module
      const verificationResult = await FaceVerification.verifyFace(storedEmbedding);

      console.log('🔍 Face verification result:', verificationResult);

      if (!verificationResult.success || !verificationResult.isMatch) {
        console.log('❌ Face verification failed');
        alert(`❌ Face Verification Failed\n\n${verificationResult.message}\n\nSimilarity: ${verificationResult.similarityPercentage}%\n\nPlease try again or contact your teacher if you believe this is an error.`);
        return;
      }

      console.log('✅ Face verified successfully!');
      console.log(`   Similarity: ${verificationResult.similarityPercentage}%`);

    } catch (error) {
      console.error('❌ Face verification error:', error);

      if (error.message === 'VERIFICATION_CANCELLED') {
        alert('❌ Verification Cancelled\n\nFace verification was cancelled.\n\nYou must complete face verification to start attendance tracking.');
      } else {
        alert(`❌ Face Verification Error\n\n${error.message}\n\nPlease try again or contact support if the issue persists.`);
      }
      return;
    }

    console.log('✅ All validations passed - Starting timer');
    console.log('   ✅ WiFi: Connected to classroom network');
    console.log('   ✅ Face: Verified successfully');
    console.log('   ✅ Class: Active lecture in progress');

    // Timer removed - period-based attendance

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('start_timer', {
        studentId,          // === enrollmentNo always
        name: studentName,
        semester,
        branch,
        currentClass: currentClassInfo?.subject,
        lectureDuration: currentClassInfo?.duration || 60,
        wifiValidated: true,
        faceVerified: true,
        validationTimestamp: new Date(_appGetBootMs()).toISOString()
      });
      console.log('⏱️ Sent start_timer to server with full validations');
    } else {
      console.warn('⚠️ Socket not connected, cannot start centralized timer');
      // Don't allow offline timer without server validation
      alert('❌ Server Connection Required\n\nServer connection is required for attendance tracking.\n\nPlease check your internet connection.');
      // Timer removed - period-based attendance
    }
  };

  // Face verification functions removed - no longer needed

  const handleReset = () => {
    // Reset stops the timer
    // Timer removed - period-based attendance
    // Face verification removed - no longer needed
    clearInterval(intervalRef.current);

    // Stop timer using server-side system
    if (socketRef.current && socketRef.current.connected) {
      console.log('⏹️  Stopping server-side timer...');
      socketRef.current.emit('stop_timer', {
        studentId: studentId,   // === enrollmentNo always
      });
      console.log('⏹️ Sent stop_timer to server');
    } else {
      // Fallback to old method
      updateTimerOnServer(0, false, 'absent');
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Format time in HH:MM:SS for attendance display
  const formatTimeHMS = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const refreshUserProfile = async () => {
    if (!loginId || !selectedRole) return;

    try {
      console.log('🔄 Refreshing profile for:', loginId, selectedRole);
      const response = await fetch(POST_REFRESH_PROFILE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loginId,
          role: selectedRole
        })
      });

      const data = await response.json();
      if (data.success && data.user) {
        setUserData(data.user);
        await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));
        console.log('✅ Profile refreshed:', data.user.name);
        if (selectedRole === 'teacher') {
          console.log('✅ canEditTimetable:', data.user.canEditTimetable);
        }
        return data.user;
      } else {
        console.log('❌ Profile refresh failed:', data.message);
        return null;
      }
    } catch (error) {
      console.log('❌ Error refreshing profile:', error);
      return null;
    }
  };

  // Glow effect only in dark theme
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isDarkTheme ? [0.3, 0.8] : [0, 0],
  });



  // Login function
  const handleLogin = async () => {
    if (!loginId.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both ID and password');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch(POST_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loginId.trim(),
          password: loginPassword.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        // Debug: Log user data to check photoUrl
        console.log('🔍 Login successful, user data:', data.user);
        console.log('📸 PhotoUrl:', data.user.photoUrl);
        console.log('👤 Face embedding:', data.user.faceEmbedding ? `${data.user.faceEmbedding.length} floats` : 'Not enrolled');

        const normalizedUser = normalizeStudentUserData(data.user);

        // Update state first for instant UI feedback
        setUserData(normalizedUser);
        setSelectedRole(normalizedUser.role);
        setLoggedInUserId(loginId.trim()); // Save the logged-in user ID
        setShowLogin(false);

        // Prepare storage data
        const storageData = [
          [USER_DATA_KEY, JSON.stringify(normalizedUser)],
          [LOGIN_ID_KEY, loginId.trim()],
          [ROLE_KEY, normalizedUser.role]
        ];

        if (normalizedUser.role === 'student') {
          setStudentName(normalizedUser.name);
          // studentId is always enrollmentNo — never fall back to _id
          const studentIdValue = normalizedUser.enrollmentNo;
          setStudentId(studentIdValue);
          setSemester(normalizedUser.semester);
          setBranch(normalizedUser.branch);
          // Join class socket room so student receives random ring notifications
          joinClassRoom(normalizedUser.semester?.toString(), normalizedUser.branch);

          // Fire all post-login fetches in parallel — no sequential waiting
          Promise.all([
            fetchTimetable(normalizedUser.semester, normalizedUser.branch),
            fetchDailyBSSIDSchedule(normalizedUser.enrollmentNo, true), // Force refresh like "Refresh from Server" button
            loadTodayAttendance(studentIdValue),
            refreshUserProfile(), // Fetch latest profile data from server (like refresh button)
          ]).catch(() => { });

          // Force sync timer data after login (like refresh button does)
          setTimeout(async () => {
            try {
              const syncResult = await OfflineTimerService.forceSyncTimerData();
              if (syncResult.success) {
                console.log('✅ Timer synced after login');
              }
            } catch (e) {
              console.warn('⚠️ Timer sync after login failed:', e.message);
            }
          }, 1000);

          storageData.push(
            [STUDENT_NAME_KEY, normalizedUser.name],
            [STUDENT_ID_KEY, studentIdValue]
          );

          if (normalizedUser.semester) storageData.push([SEMESTER_KEY, normalizedUser.semester]);
          if (normalizedUser.branch) storageData.push([BRANCH_KEY, normalizedUser.branch]);

          // Save face embedding at login — this is the primary offline cache.
          // We use saveCachedServerEmbedding so it writes to ALL storage keys:
          //   @letsbunk_cached_server_embedding  ← read by getStudentFaceData offline fallback
          //   @letsbunk_cached_server_embedding_enrolled_at ← used to detect re-enrollment
          //   @letsbunk_face_embedding            ← read by registerCheckIn
          // This guarantees face verification works offline immediately after login,
          // even if the student never had internet during a timer start before.
          if (data.user.faceEmbedding && Array.isArray(data.user.faceEmbedding) && data.user.faceEmbedding.length > 0) {
            const enrolledAt = data.user.faceEnrolledAt || data.user.enrolledAt || new Date().toISOString();
            SecureStorage.saveCachedServerEmbedding(data.user.faceEmbedding, enrolledAt)
              .then(() => SecureStorage.saveEnrollmentNumber(normalizedUser.enrollmentNo))
              .catch(() => { });
          }
        } else if (data.user.role === 'teacher') {
          // For teachers: fetch students and optionally set semester/branch for timetable
          // Teachers can manually select semester/branch via the selector, but we try to restore preferences
          const storedSemester = await AsyncStorage.getItem(SEMESTER_KEY);
          const storedBranch = await AsyncStorage.getItem(BRANCH_KEY);
          
          if (storedSemester && storedBranch) {
            console.log('📚 Restoring teacher preferences:', storedSemester, storedBranch);
            setSemester(storedSemester);
            setBranch(storedBranch);
            setManualSelection({ semester: storedSemester, branch: storedBranch });
            setCurrentClassInfo({
              subject: 'Manual Selection',
              branch: storedBranch,
              semester: storedSemester,
              isManual: true
            });
          }
          
          // Fetch students after a short delay to ensure socket is connecting
          setTimeout(() => fetchStudents(), 100);
          refreshUserProfile(); // Fetch latest profile data from server (like refresh button)
        }

        // Save session to AsyncStorage so it persists across app restarts
        AsyncStorage.multiSet(storageData).catch(err => console.warn('⚠️ Failed to save session:', err));
      } else {
        // Server returned an error message
        setLoginError(data.message || 'Login failed');
        console.error('Login failed:', data.message);
      }
    } catch (error) {
      // Network or connection error
      console.error('Login error:', error);

      if (error.message === 'Network request failed') {
        setLoginError('Cannot connect to server. Please check your internet connection.');
      } else if (error.message.includes('timeout')) {
        setLoginError('Server is not responding. Please try again later.');
      } else {
        setLoginError('Connection error. Please check server.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Pull-to-refresh handlers (defined at top level to avoid hooks violations)
  const onRefreshTeacher = async () => {
    setRefreshingTeacher(true);
    setIsOffline(false);
    try {
      // Test server connection first (AbortController — fetch has no timeout option in RN)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const healthCheck = await fetch(`${SOCKET_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!healthCheck.ok) {
        throw new Error('Server not responding');
      }

      await fetchStudents();
      await refreshUserProfile();
      setIsOffline(false);
    } catch (error) {
      console.log('Error refreshing teacher dashboard:', error);
      setIsOffline(true);
      // Show offline message for 3 seconds
      setTimeout(() => setIsOffline(false), 3000);
    } finally {
      setRefreshingTeacher(false);
    }
  };

const onRefreshStudent = async () => {
    setRefreshingStudent(true);
    setIsOffline(false);

    try {
      console.log('🔄 Student refresh started - checking connectivity and syncing timer...');

      // Force sync timer data if OfflineTimerService is available (wrapped in try-catch to not block refresh)
      let syncResult = null;
      if (offlineTimerInitialized) {
        console.log('⏱️ Force syncing timer data...');
        try {
          syncResult = await OfflineTimerService.forceSyncTimerData();
        } catch (syncError) {
          console.warn('⚠️ Timer sync error (non-blocking):', syncError.message);
          syncResult = { success: false, error: syncError.message, isOffline: false };
        }

        if (syncResult && syncResult.success) {
          console.log('✅ Timer sync successful');
        } else if (syncResult && !syncResult.success) {
          console.log('⚠️ Timer sync failed:', syncResult.error);
        }
      }

      // Test server connection (AbortController — fetch has no timeout option in RN)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const healthCheck = await fetch(`${SOCKET_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!healthCheck.ok) {
        throw new Error('Server not responding');
      }

      // Refresh timetable and profile data
      const updatedUser = await refreshUserProfile();
      
      const currentSem = updatedUser?.semester || semester;
      const currentBranch = updatedUser?.branch || branch;

      if (currentSem && currentBranch) {
        await fetchTimetable(currentSem, currentBranch);
      }
      
      const targetStudentId = updatedUser?.enrollmentNo || studentId;
      if (targetStudentId) {
        console.log(`🔄 Refreshing BSSID schedule for ${targetStudentId}...`);
        await fetchDailyBSSIDSchedule(targetStudentId, true);
      }

      // Show success message with sync info
      showToast('✅ Refreshed successfully', 'success');

      setIsOffline(false);
    } catch (error) {
      console.log('❌ Error refreshing student dashboard:', error);
      setIsOffline(true);

      // Show offline message
      showToast('📶 Offline — timer running locally, will sync when reconnected', 'warning', 5000);

      // Auto-hide offline indicator after 5 seconds
      setTimeout(() => setIsOffline(false), 5000);
    } finally {
      setRefreshingStudent(false);
    }
  };

  // Loading Screen — show splash once, then a plain loader while session restores
  if (!splashDone) {
    return (
      <SplashScreenView onDone={() => setSplashDone(true)} />
    );
  }

  if (isInitializing) {
    // Session is being restored from storage — show a minimal screen, not the splash again
    return (
      <View style={{ flex: 1, backgroundColor: 'rgb(250,245,234)', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#d97706" />
      </View>
    );
  }

  // Login Screen
  if (showLogin) {
    return (
      <LoginScreen
        loginId={loginId}
        setLoginId={setLoginId}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginError={loginError}
        setLoginError={setLoginError}
        isLoggingIn={isLoggingIn}
        handleLogin={handleLogin}
      />
    );
  }

  // Role Selection Screen (kept for fallback)
  if (!selectedRole) {
    const roleConfig = config?.roleSelection || getDefaultConfig().roleSelection;
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
        <StatusBar style={theme.statusBar} />
        <Text style={[styles.glowText, {
          fontSize: roleConfig?.title?.fontSize || 36,
          color: theme.primary,
        }]}>
          {roleConfig?.title?.text || 'Who are you?'}
        </Text>
        <Text style={{
          fontSize: roleConfig?.subtitle?.fontSize || 16,
          color: theme.textSecondary,
          marginBottom: 60,
        }}>
          {roleConfig?.subtitle?.text || 'Select your role to continue'}
        </Text>

        <View style={styles.roleContainer}>
          {(roleConfig?.roles || []).map((role) => (
            <TouchableOpacity
              key={role.id}
              onPress={() => handleRoleSelect(role.id)}
              activeOpacity={0.8}
            >
              <Animated.View
                style={[
                  styles.roleButton,
                  {
                    backgroundColor: role?.backgroundColor || theme.primary,
                    shadowColor: theme.primary,
                    shadowOpacity: glowOpacity,
                    shadowRadius: 20,
                    elevation: 15,
                  }
                ]}
              >
                <Text style={styles.roleIcon}>{role?.icon || '👤'}</Text>
                <Text style={[styles.roleText, { color: role?.textColor || '#0a1628' }]}>
                  {role?.text || 'Role'}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    );
  }

  // Student Name Input Screen
  if (selectedRole === 'student' && showNameInput) {
    const nameConfig = config?.studentNameInput || getDefaultConfig().studentNameInput;
    return (
      <Animated.View style={[styles.container, { backgroundColor: nameConfig?.backgroundColor || '#0a1628', opacity: fadeAnim }]}>
        <StatusBar style="light" />
        <Text style={[styles.glowText, {
          fontSize: nameConfig?.title?.fontSize || 32,
          color: nameConfig?.title?.color || '#00f5ff',
        }]}>
          {nameConfig?.title?.text || 'Enter Your Name'}
        </Text>
        <Text style={{
          fontSize: nameConfig?.subtitle?.fontSize || 14,
          color: nameConfig?.subtitle?.color || '#00d9ff',
          marginBottom: 40,
        }}>
          {nameConfig?.subtitle?.text || 'This will be visible to your teacher'}
        </Text>

        <Animated.View style={[styles.inputContainer, {
          backgroundColor: nameConfig?.inputBackgroundColor || theme.cardBackground,
          borderColor: nameConfig?.inputBorderColor || theme.border,
          shadowColor: theme.primary,
          shadowOpacity: glowOpacity,
          shadowRadius: 15,
        }]}>
          <TextInput
            style={[styles.input, { color: nameConfig?.inputTextColor || theme.primary }]}
            placeholder={nameConfig?.placeholder || 'Your Name'}
            placeholderTextColor={theme.textSecondary + '80'}
            value={studentName}
            onChangeText={setStudentName}
            autoFocus
          />
        </Animated.View>

        <TouchableOpacity onPress={handleNameSubmit} activeOpacity={0.8}>
          <Animated.View style={[styles.submitButton, {
            shadowColor: theme.primary,
            shadowOpacity: glowOpacity,
            shadowRadius: 20,
          }]}>
            <Text style={styles.submitButtonText}>{nameConfig?.buttonText || 'START SESSION'}</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Timetable Modal (for teachers only)
  if (selectedRole === 'teacher' && showTimetable && timetable) {
    // Get days dynamically from timetable
    const daysFull = Object.keys(timetable.timetable);
    const days = daysFull.map(day => day.substring(0, 3).charAt(0).toUpperCase() + day.substring(1, 3));
    const isTeacher = selectedRole === 'teacher';
    const canEdit = isTeacher && (userData?.canEditTimetable || false);

    const handleCellPress = (dayIdx, periodIdx) => {
      if (!canEdit) return;
      const period = timetable.timetable[daysFull[dayIdx]][periodIdx];
      setEditingCell({ dayIdx, periodIdx });
      setEditSubject(period.subject || '');
      setEditRoom(period.room || '');
    };

    const handleSaveCell = () => {
      if (!editingCell) return;
      const { dayIdx, periodIdx } = editingCell;
      const updatedTimetable = { ...timetable };
      updatedTimetable.timetable[daysFull[dayIdx]][periodIdx] = {
        ...updatedTimetable.timetable[daysFull[dayIdx]][periodIdx],
        subject: editSubject,
        room: editRoom,
        isBreak: false
      };
      setTimetable(updatedTimetable);
      setEditingCell(null);
    };

    const handleToggleBreak = (dayIdx, periodIdx) => {
      if (!canEdit) return;
      const updatedTimetable = { ...timetable };
      const currentBreak = updatedTimetable.timetable[daysFull[dayIdx]][periodIdx].isBreak;
      updatedTimetable.timetable[daysFull[dayIdx]][periodIdx] = {
        ...updatedTimetable.timetable[daysFull[dayIdx]][periodIdx],
        isBreak: !currentBreak,
        subject: !currentBreak ? '' : updatedTimetable.timetable[daysFull[dayIdx]][periodIdx].subject,
        room: !currentBreak ? '' : updatedTimetable.timetable[daysFull[dayIdx]][periodIdx].room
      };
      setTimetable(updatedTimetable);
    };

    const handleSaveTimetable = () => {
      saveTimetable(timetable);
    };

    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
        <StatusBar style={theme.statusBar} />
        <View style={styles.timetableHeader}>
          <Text style={[styles.glowText, { fontSize: 24, color: theme.primary }]}>
            📅 Timetable {canEdit ? '(Edit Mode)' : '(View Only)'}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 5 }}>
            Sem {timetable.semester} - {timetable.branch}
          </Text>
          <View style={{ flexDirection: 'row', gap: 15, marginTop: 10 }}>
            {canEdit && (
              <TouchableOpacity onPress={handleSaveTimetable}>
                <Text style={{ color: isDarkTheme ? '#00ff88' : '#10b981', fontSize: 14, fontWeight: 'bold' }}>💾 Save</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setShowTimetable(false); setEditingCell(null); }}>
              <Text style={{ color: theme.primary, fontSize: 14 }}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal style={styles.timetableScrollHorizontal}>
          <View style={styles.timetableGrid}>
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.cornerCell, {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border
              }]}>
                <Text style={[styles.cornerText, { color: theme.textSecondary }]}>Day/Period</Text>
              </View>
              {timetable.periods.map((period, idx) => (
                <View key={idx} style={[styles.gridCell, styles.headerCell, {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border
                }]}>
                  <Text style={[styles.periodHeaderText, { color: theme.primary }]}>P{period.number}</Text>
                  <Text style={[styles.timeText, { color: theme.textSecondary }]}>
                    {period.startTime}-{period.endTime}
                  </Text>
                </View>
              ))}
            </View>

            {days.map((day, dayIdx) => (
              <View key={day} style={styles.gridRow}>
                <View style={[styles.gridCell, styles.dayCell, {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border
                }]}>
                  <Text style={[styles.dayText, { color: theme.primary }]}>{day}</Text>
                </View>
                {timetable.timetable[daysFull[dayIdx]].map((period, periodIdx) => (
                  <TouchableOpacity
                    key={periodIdx}
                    onPress={() => handleCellPress(dayIdx, periodIdx)}
                    onLongPress={() => canEdit && handleToggleBreak(dayIdx, periodIdx)}
                    disabled={!canEdit}
                    activeOpacity={canEdit ? 0.7 : 1}
                  >
                    <View style={[
                      styles.gridCell,
                      styles.dataCell,
                      {
                        backgroundColor: period.isBreak
                          ? (isDarkTheme ? '#1a2a3a' : '#fef3c7')
                          : theme.background,
                        borderColor: theme.border
                      }
                    ]}>
                      {period.isBreak ? (
                        <Text style={[styles.breakTextSmall, { color: theme.textSecondary }]}>☕</Text>
                      ) : (
                        <>
                          <Text style={[styles.subjectTextSmall, { color: theme.text }]} numberOfLines={2}>
                            {period.subject || '-'}
                          </Text>
                          {period.room && (
                            <Text style={[styles.roomTextSmall, { color: theme.textSecondary }]} numberOfLines={1}>
                              {period.room}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {editingCell && canEdit && (
          <View style={styles.editModal}>
            <View style={[styles.editModalContent, {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border
            }]}>
              <Text style={[styles.editModalTitle, { color: theme.primary }]}>Edit Period</Text>
              <Text style={[styles.editModalSubtitle, { color: theme.textSecondary }]}>
                {days[editingCell.dayIdx]} - Period {editingCell.periodIdx + 1}
              </Text>

              <TextInput
                style={[styles.editInput, {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text
                }]}
                placeholder="Subject Name"
                placeholderTextColor={theme.textSecondary + '80'}
                value={editSubject}
                onChangeText={setEditSubject}
                autoFocus
              />

              <TextInput
                style={[styles.editInput, {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text
                }]}
                placeholder="Room Number"
                placeholderTextColor={theme.textSecondary + '80'}
                value={editRoom}
                onChangeText={setEditRoom}
              />

              <View style={styles.editModalButtons}>
                <TouchableOpacity onPress={handleSaveCell} style={[styles.editModalButton, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.editModalButtonText, { color: isDarkTheme ? '#0a1628' : '#ffffff' }]}>✓ Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingCell(null)} style={[styles.editModalButton, styles.editModalCancelButton, { backgroundColor: theme.border }]}>
                  <Text style={[styles.editModalButtonText, { color: theme.text }]}>✕ Cancel</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.editModalHint}>💡 Long press to toggle break</Text>
            </View>
          </View>
        )}
      </Animated.View>
    );
  }

  // Logout function
  const handleLogout = async () => {
    // Confirmation dialog to prevent accidental logout
    Alert.alert(
      '🚪 Logout',
      'Sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout', style: 'destructive',
          onPress: async () => {
            console.log('🚪 Logging out — cleaning up all services...');

            // 1. Stop timer service completely
            try {
              await OfflineTimerService.stopTimer('logout');
              OfflineTimerService.cleanup();
              console.log('✅ OfflineTimerService stopped and cleaned up');
            } catch (e) { console.warn('OfflineTimerService cleanup error:', e.message); }

            // 2. Disconnect socket
            try {
              if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
                console.log('✅ Socket disconnected');
              }
            } catch (e) { console.warn('Socket cleanup error:', e.message); }

            // 3. Deactivate keep awake
            try { deactivateKeepAwake('attendance-tracking'); } catch (_) { }

            // 4. Clear ALL AsyncStorage keys including semester/branch
            try {
              await AsyncStorage.multiRemove([
                ROLE_KEY, STUDENT_NAME_KEY, STUDENT_ID_KEY,
                USER_DATA_KEY, LOGIN_ID_KEY, DAILY_VERIFICATION_KEY,
                SEMESTER_KEY, BRANCH_KEY, CACHE_KEY, THEME_KEY
              ]);
              await SecureStorage.clearFaceData();
              await BSSIDStorage.clearSchedule();
              console.log('✅ All storage cleared');
            } catch (e) { console.warn('Storage clear error:', e.message); }

            // 5. Clear all intervals
            clearInterval(intervalRef.current);

            // 6. Reset ALL state to initial values
            setUserData(null);
            setLoginId('');
            setLoginPassword('');
            setLoggedInUserId('');
            setStudentName('');
            setStudentId(null);
            setSemester(null);
            setBranch(null);
            setSelectedRole(null);
            setTimetable(null);
            setStudents([]);
            setTodayAttendance({
              date: new Date(_appGetBootMs()).toDateString(),
              lectures: [], totalAttended: 0, totalClassTime: 0, dayPresent: false
            });
            setOfflineTimerState({
              isRunning: false, isPaused: false, timerSeconds: 0,
              currentLecture: null, isOnline: true, hasInternetConnection: true,
              isConnectedToAuthorizedWiFi: false, lastSyncTime: null,
              queuedSyncs: 0, pendingSyncCount: 0
            });
            setOfflineTimerInitialized(false);
            setActiveTab('home');
            setShowLogin(true);
            setThemeMode('warm'); // Reset theme to default
            console.log('✅ Logout complete');
          }
        }
      ]
    );
  };

  // Teacher action handler for random ring accept/reject
  const handleTeacherAction = async (randomRingId, studentId, action) => {
    try {
      console.log(`👨‍🏫 Teacher ${action} student`);
      console.log(`   Random Ring ID: ${randomRingId}`);
      console.log(`   Student ID: ${studentId}`);
      console.log(`   Action: ${action}`);

      if (!randomRingId) {
        console.error('❌ No randomRingId provided');
        alert('❌ Error: No active random ring found');
        return;
      }

      if (!studentId) {
        console.error('❌ No studentId provided');
        alert('❌ Error: Student ID not found');
        return;
      }

      console.log(POST_RANDOM_RING_TEACHER_ACTION);
      console.log(`📦 Request body:`, { randomRingId, studentId, action });

      const response = await fetch(POST_RANDOM_RING_TEACHER_ACTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          randomRingId,
          studentId,
          action
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`📥 Server response:`, result);

      if (result.success) {
        console.log(`✅ Student ${action} successfully`);
        alert(`✅ Student ${action} successfully`);

        // Update active random ring state
        setActiveRandomRing(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            selectedStudents: prev.selectedStudents.map(s =>
              (s.studentId === studentId || s.enrollmentNo === studentId)
                ? { ...s, teacherAction: action }
                : s
            )
          };
        });
      } else {
        const errorMsg = result.message || result.error || 'Unknown error';
        console.error(`❌ Server error: ${errorMsg}`);
        alert(`❌ Failed to ${action} student: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`❌ Error ${action} student:`, error);
      alert(`❌ Error ${action}ed student. Please check your connection.\n\nDetails: ${error.message}`);
      throw error; // Re-throw so the button handler can catch it
    }
  };

  // Show ViewRecords screen (full screen overlay)
  if (selectedRole === 'teacher' && showViewRecords) {
    return (
      <ViewRecords
        onBack={() => setShowViewRecords(false)}
        theme={theme}
      />
    );
  }

  // Show Notifications screen
  if (selectedRole === 'teacher' && showNotification) {
    return (
      <Notifications
        onBack={() => setShowNotification(false)}
        theme={theme}
        teacherId={userData?.employeeId}
      />
    );
  }

  // Show Updates screen
  if (selectedRole === 'teacher' && showUpdates) {
    return (
      <Updates
        onBack={() => setShowUpdates(false)}
        theme={theme}
      />
    );
  }

  // Show Help and Support screen
  if (selectedRole === 'teacher' && showHelpAndSupport) {
    return (
      <HelpAndSupport
        onBack={() => setShowHelpAndSupport(false)}
        theme={theme}
      />
    );
  }

  // Show Feedback screen
  if (selectedRole === 'teacher' && showFeedback) {
    return (
      <Feedback
        onBack={() => setShowFeedback(false)}
        theme={theme}
      />
    );
  }

  // Teacher Dashboard - NEW UI
  if (selectedRole === 'teacher' && activeTab === 'home') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <TeacherHeader
          userData={userData}
          isDark={isDarkTheme}
          onToggleTheme={toggleTheme}
          theme={theme}
          onViewRecords={() => setShowViewRecords(true)}
          onNotification={() => setShowNotification(true)}
          onUpdates={() => setShowUpdates(true)}
          onHelpAndSupport={() => setShowHelpAndSupport(true)}
          onFeedback={() => setShowFeedback(true)}
          onLogout={handleLogout}
        />
        {/* Current Lecture / Manual Selection Banner */}
        {currentClassInfo && (
          <View style={{
            backgroundColor: currentClassInfo.isManual ? theme.primary + '20' : theme.primary + '10',
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.border
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                  {currentClassInfo.isManual ? '📌 Manual Selection' : '📚 Current Lecture'}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {currentClassInfo.subject} • {currentClassInfo.branch} Sem {currentClassInfo.semester}
                  {!currentClassInfo.isManual && ` • ${currentClassInfo.startTime}-${currentClassInfo.endTime}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSemesterSelector(true)}
                style={{
                  backgroundColor: theme.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* WiFi Status Display (Development/Testing) */}
        {(__DEV__ || selectedRole === 'teacher') && currentClassInfo && (
          <View style={{
            backgroundColor: wifiDebugInfo.status.includes('AUTHORIZED') ? '#10b981' + '20' : '#ef4444' + '20',
            padding: 8,
            borderBottomWidth: 1,
            borderBottomColor: theme.border
          }}>
            <Text style={{
              color: wifiDebugInfo.status.includes('AUTHORIZED') ? '#10b981' : '#ef4444',
              fontSize: 11,
              fontWeight: '600',
              textAlign: 'center'
            }}>
              📶 WiFi: {wifiDebugInfo.status} • BSSID: {wifiDebugInfo.currentBSSID}
            </Text>
            {wifiDebugInfo.reason && (
              <Text style={{
                color: theme.textSecondary,
                fontSize: 10,
                textAlign: 'center',
                marginTop: 2
              }}>
                {wifiDebugInfo.reason} • {wifiDebugInfo.lastChecked}
              </Text>
            )}
          </View>
        )}

        {/* Semester Selector Button (when no lecture) */}
        {!currentClassInfo && (
          <View style={{
            backgroundColor: theme.card,
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.border
          }}>
            <TouchableOpacity
              onPress={() => setShowSemesterSelector(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8
              }}
            >
              <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>
                📚 Select Semester & Branch
              </Text>
            </TouchableOpacity>
          </View>
        )}

          <StudentList
            theme={theme}
            students={students}
            onStudentPress={(student) => {
              setSelectedStudent(student);
              fetchStudentDetails(student);
            }}
            activeRandomRing={activeRandomRing}
            onTeacherAction={handleTeacherAction}
            ListHeaderComponent={<StudentSearch theme={theme} students={students} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshingTeacher}
                onRefresh={onRefreshTeacher}
                colors={[theme.primary]}
                tintColor={theme.primary}
              />
            }
          />
        {/* Theme Picker Modal */}
        <Modal
          visible={showThemePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowThemePicker(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowThemePicker(false)}
          >
            <View style={{ backgroundColor: theme.cardBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}
              onStartShouldSetResponder={() => true}
            >
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>🎨 Choose Theme</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 16 }}>Pick a look that feels right</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {THEME_GROUPS.map((group) => (
                  <View key={group.label} style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                      {group.label}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {group.keys.map((key) => {
                        const t = THEMES[key];
                        const isActive = themeMode === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => selectTheme(key)}
                            style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: isActive ? 2 : 1, borderColor: isActive ? t.primary : t.border }}
                          >
                            <View style={{ backgroundColor: t.background, padding: 8, alignItems: 'center' }}>
                              <View style={{ width: '100%', backgroundColor: t.cardBackground, borderRadius: 6, padding: 5, marginBottom: 5, borderWidth: 1, borderColor: t.border }}>
                                <View style={{ width: '65%', height: 5, backgroundColor: t.primary, borderRadius: 3, marginBottom: 3 }} />
                                <View style={{ width: '45%', height: 3, backgroundColor: t.textSecondary, borderRadius: 2 }} />
                              </View>
                              <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
                            </View>
                            <View style={{ backgroundColor: t.cardBackground, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' }}>
                              <Text style={{ color: t.text, fontSize: 10, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{t.label}</Text>
                              {isActive && <Text style={{ color: t.primary, fontSize: 9, marginTop: 1 }}>✓ Active</Text>}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
        <BottomNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          theme={theme}
          userRole="teacher"
        />
        {/* Floating Random Ring Button */}
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 90,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.primary,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}
          onPress={() => setRandomRingDialogOpen(true)}
        >
          <Text style={{ fontSize: 24 }}>🔔</Text>
        </TouchableOpacity>
        {/* Random Ring Dialog */}
        <RandomRingDialog
          visible={randomRingDialogOpen}
          onClose={() => setRandomRingDialogOpen(false)}
          onConfirm={async (data) => {
            console.log('🔔 Random Ring confirmed:', data);
            try {
              const response = await fetch(POST_RANDOM_RING, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: data.type,
                  count: data.count,
                  teacherId: loginId,
                  teacherName: userData?.name,
                  semester: semester,
                  branch: branch
                })
              });

              const result = await response.json();
              if (result.success) {
                alert(`✅ Random Ring sent to ${result.selectedStudents?.length || 0} student(s)!`);
                console.log('✅ Random Ring successful:', result);

                // Track active random ring for accept/reject buttons
                setActiveRandomRing({
                  _id: result.randomRingId,
                  selectedStudents: result.selectedStudents.map(s => ({
                    studentId: s.id, // This is _id from MongoDB
                    enrollmentNo: s.enrollmentNo,
                    name: s.name,
                    teacherAction: 'pending',
                    verified: false
                  }))
                });

                console.log('📌 Active Random Ring set:', {
                  randomRingId: result.randomRingId,
                  studentCount: result.selectedStudents.length
                });
              } else {
                alert('❌ Failed to send Random Ring: ' + (result.message || result.error));
                console.error('❌ Random Ring failed:', result);
              }
            } catch (error) {
              console.error('❌ Error sending Random Ring:', error);
              alert('❌ Error sending Random Ring. Please check your connection.');
            }
            setRandomRingDialogOpen(false);
          }}
          theme={theme}
        />
        {/* Student Profile Dialog */}
        <StudentProfileDialog
          visible={!!selectedStudent}
          onClose={() => setSelectedStudent(null)}
          theme={theme}
          student={selectedStudent}
        />
        {/* Teacher Profile Dialog */}
        <TeacherProfileDialog
          visible={showProfile}
          onClose={() => setShowProfile(false)}
          theme={theme}
          teacherData={userData}
          onLogout={handleLogout}
        />
        {/* Semester Selector - Only for Teachers */}
        {selectedRole === 'teacher' && (
          <SemesterSelector
            visible={showSemesterSelector}
            onClose={() => setShowSemesterSelector(false)}
            isStudent={false}
            onSelect={(selection) => {
              setManualSelection(selection);

              // Update global semester/branch for manual selection
              if (selection.semester !== 'auto') {
                console.log(`📝 Manual selection: ${selection.branch} Semester ${selection.semester}`);
                setSemester(selection.semester);
                setBranch(selection.branch);
                // Persist so it survives app restarts
                AsyncStorage.setItem(SEMESTER_KEY, selection.semester).catch(() => {});
                AsyncStorage.setItem(BRANCH_KEY, selection.branch).catch(() => {});
                setCurrentClassInfo({
                  subject: 'Manual Selection',
                  branch: selection.branch,
                  semester: selection.semester,
                  isManual: true
                });
                // Immediately fetch students for the selected class
                fetchStudents(selection);
              } else {
                console.log(`🔄 Switched to auto mode - will use current class from timetable`);
                setSemester(null);
                setBranch(null);
                // Clear persisted manual selection when switching back to auto
                AsyncStorage.removeItem(SEMESTER_KEY).catch(() => {});
                AsyncStorage.removeItem(BRANCH_KEY).catch(() => {});
                setCurrentClassInfo(null);
                fetchStudents({ semester: 'auto', branch: null });
              }
            }}
            currentSelection={manualSelection}
            theme={theme}
          />
        )}
        {/* Offline Toast Message */}
        {isOffline && (
          <Animated.View style={{
            position: 'absolute',
            bottom: 100,
            left: 20,
            right: 20,
            backgroundColor: '#ef4444',
            padding: 16,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}>
            <Text style={{ fontSize: 24 }}>📡</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                App is offline
              </Text>
              <Text style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>
                Check your internet connection
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    );
  }

  // Teacher Calendar Screen
  if (selectedRole === 'teacher' && activeTab === 'calendar') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <CalendarScreen
          theme={theme}
          semester={semester}
          branch={branch}
          socketUrl={SOCKET_URL}
          isTeacher={true}
        />
        <BottomNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          theme={theme}
          userRole="teacher"
        />
      </View>
    );
  }

  // Teacher Timetable Screen
  if (selectedRole === 'teacher' && activeTab === 'timetable') {
    // Use semester/branch from state, fall back to manualSelection so timetable
    // is visible even when no active class is detected
    const timetableSemester = semester || (manualSelection.semester !== 'auto' ? manualSelection.semester : null);
    const timetableBranch   = branch  || manualSelection.branch || null;
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <TimetableScreen
          theme={theme}
          semester={timetableSemester}
          branch={timetableBranch}
          socketUrl={SOCKET_URL}
          canEdit={userData?.canEditTimetable || false}
          isTeacher={true}
          userData={userData}
          loginId={loggedInUserId}
          onLogout={handleLogout}
        />
        <BottomNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          theme={theme}
          userRole="teacher"
        />
      </View>
    );
  }

  // Teacher Dashboard - Old UI (fallback)
  if (selectedRole === 'teacher') {
    const teacherConfig = config?.teacherScreen || getDefaultConfig().teacherScreen;
    const canEditTimetable = userData?.canEditTimetable || false;

    // Calculate statistics with safety checks
    const totalStudents = students.length;
    const presentStudents = students.filter(s => s && s.status === 'present').length;
    const attendingStudents = students.filter(s => s && s.status === 'attending').length;
    const absentStudents = students.filter(s => s && s.status === 'absent').length;
    const attendancePercentage = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;

    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Compact Header */}
          <View style={{
            backgroundColor: theme.primary,
            paddingTop: 50,
            paddingBottom: 20,
            paddingHorizontal: 20,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <TouchableOpacity onPress={() => setShowProfile(true)} activeOpacity={0.8}>
                <View style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: '#fff',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: '#fff',
                  overflow: 'hidden',
                }}>
                  {userData?.photoUrl ? (
                    <Image
                      source={{ uri: userData.photoUrl }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 20, color: theme.primary, fontWeight: 'bold' }}>
                      {getInitials(userData?.name || 'Teacher')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>
                  {userData?.name || 'Teacher'}
                </Text>
                <Text style={{ fontSize: 13, color: '#fff', opacity: 0.9, marginTop: 2 }}>
                  {userData?.department || ''} Department
                </Text>
              </View>
              <TouchableOpacity onPress={toggleTheme} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20 }}>
                  {THEMES[themeMode]?.emoji || '🎨'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stats Grid - 2x2 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <View style={{
                flex: 1,
                minWidth: '47%',
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#fff' }}>{totalStudents}</Text>
                <Text style={{ fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 4 }}>Total</Text>
              </View>
              <View style={{
                flex: 1,
                minWidth: '47%',
                backgroundColor: 'rgba(0,255,136,0.2)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(0,255,136,0.3)',
              }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#00ff88' }}>{presentStudents}</Text>
                <Text style={{ fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 4 }}>Present</Text>
              </View>
              <View style={{
                flex: 1,
                minWidth: '47%',
                backgroundColor: 'rgba(255,170,0,0.2)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,170,0,0.3)',
              }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#ffaa00' }}>{attendingStudents}</Text>
                <Text style={{ fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 4 }}>Active</Text>
              </View>
              <View style={{
                flex: 1,
                minWidth: '47%',
                backgroundColor: 'rgba(255,68,68,0.2)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,68,68,0.3)',
              }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#ff4444' }}>{absentStudents}</Text>
                <Text style={{ fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 4 }}>Absent</Text>
              </View>
            </View>
          </View>

          {/* Quick Actions Row */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
            <TouchableOpacity
              onPress={() => setActiveTab('timetable')}
              activeOpacity={0.8}
              style={{ flex: 1 }}
            >
              <View style={{
                backgroundColor: theme.cardBackground,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: 2,
                borderColor: theme.primary,
              }}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>📅</Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                  {canEditTimetable ? 'Manage' : 'View'}
                </Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                  Timetable
                </Text>
              </View>
            </TouchableOpacity>

            {totalStudents > 0 && (
              <View style={{
                flex: 1,
                backgroundColor: theme.cardBackground,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: theme.border,
              }}>
                <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.primary }}>
                  {attendancePercentage}%
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                  Attendance
                </Text>
              </View>
            )}
          </View>

          {/* Student List */}
          <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>
                📋 Live Attendance
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                {students.length} student{students.length !== 1 ? 's' : ''}
              </Text>
            </View>
            {students.map((student) => {
              if (!student || !student._id) return null;

              const studentStatus = student.status || 'absent';
              const statusIcon = studentStatus === 'present' ? '✅' :
                studentStatus === 'attending' ? '⏱️' : '❌';
              const statusColor = teacherConfig?.statusColors?.[studentStatus] || '#00d9ff';

              return (
                <TouchableOpacity
                  key={student._id}
                  onPress={() => fetchStudentDetails(student)}
                  activeOpacity={0.7}
                  style={{ marginBottom: 12 }}
                >
                  <View style={{
                    backgroundColor: theme.cardBackground,
                    borderRadius: 12,
                    padding: 16,
                    borderLeftWidth: 4,
                    borderLeftColor: statusColor,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>
                          {statusIcon} {student.name || 'Unknown'}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                          {student.enrollmentNo || 'N/A'}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: statusColor + '20',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: statusColor,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: statusColor }}>
                          {studentStatus.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text }}>
                        {formatTime(student.timerValue || 0)}
                      </Text>
                      {student.isRunning && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff88', marginRight: 6 }} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#00ff88' }}>LIVE</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {students.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
                <Text style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 4 }}>
                  No students attending yet
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, opacity: 0.7, textAlign: 'center' }}>
                  Students will appear here when they start their session
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Student Detail Modal */}
        {selectedStudent && (
          <View style={styles.modalOverlay}>
            <Animated.View style={[styles.modalContent, {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
              transform: [{ scale: scaleAnim }]
            }]}>
              <ScrollView>
                {/* Header */}
                <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.modalTitle, { color: theme.primary }]}>📊 Student Details</Text>
                  <TouchableOpacity onPress={closeStudentDetails}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {loadingDetails ? (
                  <View style={styles.loadingContainer}>
                    <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
                  </View>
                ) : (
                  <>
                    {/* Student Info */}
                    <View style={[styles.detailSection, { borderBottomColor: theme.border + '40' }]}>
                      <Text style={[styles.sectionTitle, { color: theme.primary }]}>👤 Personal Information</Text>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Name:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{selectedStudent?.name || 'Unknown'}</Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Enrollment:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{studentDetails?.enrollmentNo || selectedStudent?.enrollmentNo || 'N/A'}</Text>
                      </View>
                      {studentDetails && (
                        <>
                          {studentDetails.email && (
                            <View style={styles.infoRow}>
                              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Email:</Text>
                              <Text style={[styles.infoValue, { color: theme.text }]}>{studentDetails.email}</Text>
                            </View>
                          )}
                          {studentDetails.course && (
                            <View style={styles.infoRow}>
                              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Course:</Text>
                              <Text style={[styles.infoValue, { color: theme.text }]}>{studentDetails.course}</Text>
                            </View>
                          )}
                          {studentDetails.semester && (
                            <View style={styles.infoRow}>
                              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Semester:</Text>
                              <Text style={[styles.infoValue, { color: theme.text }]}>{studentDetails.semester}</Text>
                            </View>
                          )}
                          {studentDetails.phone && (
                            <View style={styles.infoRow}>
                              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Phone:</Text>
                              <Text style={[styles.infoValue, { color: theme.text }]}>{studentDetails.phone}</Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>

                    {/* Current Status */}
                    <View style={[styles.detailSection, { borderBottomColor: theme.border + '40' }]}>
                      <Text style={[styles.sectionTitle, { color: theme.primary }]}>⏱️ Current Session</Text>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Status:</Text>
                        <Text style={[styles.infoValue, {
                          color: (selectedStudent?.status === 'present') ? (isDarkTheme ? '#00ff88' : '#059669') :
                            (selectedStudent?.status === 'attending') ? (isDarkTheme ? '#ffaa00' : '#d97706') : (isDarkTheme ? '#ff4444' : '#dc2626')
                        }]}>
                          {(selectedStudent?.status || 'absent').toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Timer:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{formatTime(selectedStudent?.timerValue || 0)}</Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Active:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{selectedStudent?.isRunning ? 'Yes ●' : 'No'}</Text>
                      </View>
                    </View>

                    {/* Attendance Statistics */}
                    {attendanceStats && attendanceStats.total !== undefined && (
                      <View style={[styles.detailSection, { borderBottomColor: theme.border + '40' }]}>
                        <Text style={[styles.sectionTitle, { color: theme.primary }]}>📈 Attendance Statistics</Text>
                        <View style={styles.statsGrid}>
                          <View style={[styles.statBox, {
                            backgroundColor: isDarkTheme ? '#0a1628' : '#f9fafb',
                            borderColor: theme.border
                          }]}>
                            <Text style={[styles.statNumber, { color: theme.primary }]}>{attendanceStats.total || 0}</Text>
                            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Days</Text>
                          </View>
                          <View style={[styles.statBox, {
                            backgroundColor: isDarkTheme ? '#0a1628' : '#f9fafb',
                            borderColor: theme.border
                          }]}>
                            <Text style={[styles.statNumber, { color: isDarkTheme ? '#00ff88' : '#059669' }]}>{attendanceStats.present || 0}</Text>
                            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Present</Text>
                          </View>
                          <View style={[styles.statBox, {
                            backgroundColor: isDarkTheme ? '#0a1628' : '#f9fafb',
                            borderColor: theme.border
                          }]}>
                            <Text style={[styles.statNumber, { color: isDarkTheme ? '#ff4444' : '#dc2626' }]}>{attendanceStats.absent || 0}</Text>
                            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Absent</Text>
                          </View>
                          <View style={[styles.statBox, {
                            backgroundColor: isDarkTheme ? '#0a1628' : '#f9fafb',
                            borderColor: theme.border
                          }]}>
                            <Text style={[styles.statNumber, { color: theme.primary }]}>{attendanceStats.percentage || 0}%</Text>
                            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Percentage</Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Attendance History */}
                    {attendanceRecords && attendanceRecords.length > 0 && (
                      <View style={[styles.detailSection, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.sectionTitle, { color: theme.primary }]}>📅 Recent Attendance (Last 30 Days)</Text>
                        {attendanceRecords.slice(0, 10).map((record, index) => {
                          if (!record || !record.date) return null;
                          return (
                            <View key={index} style={[styles.recordRow, { borderBottomColor: theme.border + '20' }]}>
                              <Text style={[styles.recordDate, { color: theme.text }]}>
                                {new Date(record.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </Text>
                              <Text style={[styles.recordStatus, {
                                color: record.status === 'present'
                                  ? (isDarkTheme ? '#00ff88' : '#059669')
                                  : (isDarkTheme ? '#ff4444' : '#dc2626')
                              }]}>
                                {record.status === 'present' ? '✅ Present' : '❌ Absent'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}

        {/* Profile Modal */}
        {showProfile && (
          <Modal
            transparent={true}
            visible={showProfile}
            animationType="fade"
            onRequestClose={() => setShowProfile(false)}
          >
            <View style={styles.modalOverlay}>
              <Animated.View style={[styles.profileModalContent, {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
                transform: [{ scale: profileScaleAnim }]
              }]}>
                <ScrollView>
                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.modalTitle, { color: theme.primary }]}>👤 Profile</Text>
                    <TouchableOpacity onPress={() => setShowProfile(false)}>
                      <Text style={styles.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Profile Avatar */}
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    <View style={{
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      backgroundColor: theme.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 4,
                      borderColor: theme.border,
                      marginBottom: 15,
                      overflow: 'hidden',
                    }}>
                      {userData?.photoUrl ? (
                        <Image
                          source={{ uri: userData.photoUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                          onError={(e) => console.log('❌ Profile modal photo error:', e.nativeEvent.error)}
                          onLoad={() => console.log('✅ Profile modal photo loaded')}
                        />
                      ) : (
                        <Text style={{ fontSize: 48, color: isDarkTheme ? '#0a1628' : '#ffffff', fontWeight: 'bold' }}>
                          {getInitials(userData?.name || 'User')}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text }}>
                      {userData?.name || 'User'}
                    </Text>
                    <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 5 }}>
                      {selectedRole === 'teacher' ? '👨‍🏫 Teacher' : '🎓 Student'}
                    </Text>
                  </View>

                  {/* Profile Information */}
                  <View style={[styles.detailSection, { borderBottomColor: theme.border + '40' }]}>
                    <Text style={[styles.sectionTitle, { color: theme.primary }]}>📋 Personal Information</Text>

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Name:</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.name || 'N/A'}</Text>
                    </View>

                    {selectedRole === 'teacher' ? (
                      <>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Employee ID:</Text>
                          <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.employeeId || loginId || 'N/A'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Department:</Text>
                          <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.department || 'N/A'}</Text>
                        </View>
                        {userData?.email && (
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Email:</Text>
                            <Text style={[styles.infoValue, { color: theme.text }]}>{userData.email}</Text>
                          </View>
                        )}
                        {userData?.phone && (
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Phone:</Text>
                            <Text style={[styles.infoValue, { color: theme.text }]}>{userData.phone}</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Enrollment No:</Text>
                          <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.enrollmentNo || loginId || 'N/A'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Course:</Text>
                          <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.course || branch || 'N/A'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Semester:</Text>
                          <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.semester || semester || 'N/A'}</Text>
                        </View>
                        {userData?.email && (
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Email:</Text>
                            <Text style={[styles.infoValue, { color: theme.text }]}>{userData.email}</Text>
                          </View>
                        )}
                        {userData?.phone && (
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Phone:</Text>
                            <Text style={[styles.infoValue, { color: theme.text }]}>{userData.phone}</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={{ padding: 20 }}>
                    <TouchableOpacity
                      style={[styles.logoutButton, { backgroundColor: '#ff4444' }]}
                      onPress={() => {
                        setShowProfile(false);
                        setTimeout(() => handleLogout(), 300);
                      }}
                    >
                      <Text style={styles.logoutButtonText}>🚪 Logout</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </Animated.View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  // Student Timer Screen
  const screen = config?.studentScreen || getDefaultConfig().studentScreen;
  const startPauseBtn = screen?.buttons?.[0] || getDefaultConfig().studentScreen.buttons[0];
  const resetBtn = screen?.buttons?.[1] || getDefaultConfig().studentScreen.buttons[1];

  // Calculate current status based on running state
  const currentStatus = isRunning ? 'attending' : 'absent';
  const statusColor = currentStatus === 'present' ? (isDarkTheme ? '#00ff88' : '#059669') :
    currentStatus === 'attending' ? (isDarkTheme ? '#ffaa00' : '#d97706') :
      (isDarkTheme ? '#ff4444' : '#dc2626');
  const statusText = currentStatus === 'present' ? '✅ Completed' :
    currentStatus === 'attending' ? '⏱️ In Progress' : '❌ Not Started';

  // Render Calendar Screen (Teachers) - Check FIRST
  if (activeTab === 'calendar' && selectedRole === 'teacher') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <CalendarScreen
          theme={theme}
          userData={userData}
          semester={semester}
          branch={branch}
          socketUrl={SOCKET_URL}
          isTeacher={true}
        />
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
        />
      </View>
    );
  }

  // Render Calendar Screen (Students) - Check SECOND
  if (activeTab === 'calendar' && selectedRole === 'student') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <CalendarScreen
          theme={theme}
          studentId={studentId}
          semester={semester}
          branch={branch}
          socketUrl={SOCKET_URL}
          todayAttendance={todayAttendance}
          isTimerRunning={offlineTimerState.isRunning}
        />
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
          notificationBadge={notificationBadge}
        />
      </View>
    );
  }

  // Render Timetable Screen (Teachers)
  if (activeTab === 'timetable' && selectedRole === 'teacher') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <TimetableScreen
          theme={theme}
          semester={semester}
          branch={branch}
          socketUrl={SOCKET_URL}
          canEdit={userData?.canEditTimetable || false}
          isTeacher={true}
          userData={userData}
          loginId={loggedInUserId}
          onLogout={handleLogout}
        />
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
          notificationBadge={notificationBadge}
        />
      </View>
    );
  }

  // OLD TABS REMOVED - Using modern 3-tab navigation (Home, Calendar, Timetable)
  // Notifications and Students tabs are now accessed via menu in TeacherHeader


  // Render Timetable Screen
  if (activeTab === 'timetable') {
    // Calculate canEdit based on current userData
    const canEditTimetable = selectedRole === 'teacher' && userData?.canEditTimetable === true;
    console.log('📋 Rendering TimetableScreen - canEdit:', canEditTimetable, '| userData.canEditTimetable:', userData?.canEditTimetable);

    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <TimetableScreen
          key={`timetable-${userData?.canEditTimetable}`} // Force re-render when permission changes
          theme={theme}
          semester={semester}
          branch={branch}
          socketUrl={SOCKET_URL}
          canEdit={canEditTimetable}
          isTeacher={selectedRole === 'teacher'}
          onRefreshPermissions={refreshUserProfile}
          userData={userData}
          loginId={loggedInUserId}
          onLogout={handleLogout}
        />
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
          notificationBadge={notificationBadge}
        />
      </View>
    );
  }

  // WiFi Test Screen (Development - Students only)
  if (activeTab === 'wifi' && selectedRole === 'student') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={theme.statusBar} />
        <TestBSSID theme={theme} />
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
          notificationBadge={notificationBadge}
        />
      </View>
    );
  }

// Home Screen (Timer) - STUDENTS ONLY
  if (selectedRole === 'student' && activeTab === 'home') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar style={theme.statusBar} />

        <ScrollView
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 110, paddingHorizontal: 20, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          onTouchStart={(e) => {
            // Close past period view if user taps anywhere (except on the modal itself)
            if (viewingPastPeriod) {
              closePastPeriodView();
            }
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshingStudent}
              onRefresh={onRefreshStudent}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        >
          {/* Header: Profile (left) - LetsBunk (center) - Theme (right) */}
          <View style={{
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 10,
          }}>
            {/* Profile Picture - Left */}
            <TouchableOpacity onPress={() => setShowLanyard(true)} activeOpacity={0.8}>
              <View style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: theme.primary,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: theme.border,
                overflow: 'hidden',
              }}>
                {userData?.photoUrl ? (
                  <Image
                    source={{ uri: userData.photoUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 20, color: isDarkTheme ? '#0a1628' : '#ffffff', fontWeight: 'bold' }}>
                    {getInitials(studentName || 'Student')}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* LetsBunk - Center */}
            <Text style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: theme.primary,
              letterSpacing: 1,
            }}>
              LetsBunk
            </Text>

            {/* Theme Toggle - Right */}
            <TouchableOpacity
              onPress={toggleTheme}
              style={{
                backgroundColor: theme.primary + '20',
                width: 50,
                height: 50,
                borderRadius: 25,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontSize: 20 }}>{THEMES[themeMode]?.emoji || '🎨'}</Text>
            </TouchableOpacity>
          </View>

          {/* Title Section - REMOVED per user request */}



          {/* Current Period Banner - shown above timer when running */}
          {(offlineTimerState.isRunning && offlineTimerState.currentLecture) || offlinePeriod ? (() => {
            // Always prefer offline timetable as source of truth
            const p = offlinePeriod;
            const fb = offlineTimerState.currentLecture || {};
            const subject = p?.subject || fb.subject || 'Current Period';
            const teacher = p?.teacher || p?.teacherName || fb.teacher || '';
            const room = p?.room || fb.room || '';
            const startTime = p?.startTime || fb.startTime || '';
            const endTime = p?.endTime || fb.endTime || '';
            const periodNum = p?.period || null;
            const isLive = offlineTimerState.isRunning;

            return (
              <View style={{
                width: '100%',
                maxWidth: 400,
                backgroundColor: isLive ? '#22c55e18' : theme.cardBackground,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderWidth: 1.5,
                borderColor: isLive ? '#22c55e' : theme.border,
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Text style={{ fontSize: 20 }}>📚</Text>
                <View style={{ flex: 1 }}>
                  {/* Subject name from offline timetable */}
                  <Text style={{
                    color: isLive ? '#22c55e' : theme.text,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.3,
                  }}>
                    {subject}
                  </Text>
                  {/* Teacher, Room, Time + Period number */}
                  <Text style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    marginTop: 2,
                  }}>
                    {[
                      teacher && `👤 ${teacher}`,
                      room && `🚪 ${room}`,
                      startTime && endTime && `⏰ ${startTime} – ${endTime}${periodNum ? `  •  Period ${periodNum}` : ''}`,
                    ].filter(Boolean).join('   ')}
                  </Text>
                </View>
                {isLive && (
                  <View style={{
                    backgroundColor: '#22c55e',
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>LIVE</Text>
                  </View>
                )}
              </View>
            );
          })() : null}

{/* Circular Timer - Visual timetable display */}
          <CircularTimer
            theme={theme}
            timetable={timetable}
            currentDay={currentDay}
            currentPeriodNumber={currentPeriodNumber}
            onSegmentPress={handleSegmentPress}
            segmentTimerData={segmentTimerData}
          />

          {/* Show current period information */}
          {currentClassInfo ? (
            <>

              {/* WiFi Bypass Button (Development/Testing) */}
              {(__DEV__ || selectedRole === 'teacher') && (
                <View style={{ alignItems: 'center', marginTop: 15, gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      backgroundColor: theme.primary + '20',
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: theme.primary,
                    }}
                    onPress={() => {
                      console.log('🧪 WiFi bypass button pressed');
                      setWifiDebugInfo({
                        status: 'AUTHORIZED (SIMULATED)',
                        currentBSSID: 'Simulated for testing',
                        expectedBSSID: 'Not required',
                        room: currentClassInfo?.room || 'Test room',
                        lastChecked: new Date().toLocaleTimeString()
                      });
                      alert('✅ WiFi Bypass Activated\n\nWiFi validation has been bypassed for testing purposes.\n\nYou can now start attendance tracking.');
                    }}
                  >
                    <Text style={{
                      color: theme.primary,
                      fontSize: 12,
                      fontWeight: '600',
                      textAlign: 'center'
                    }}>
                      📶 Bypass WiFi Check
                    </Text>
                  </TouchableOpacity>

                  {/* BSSID Diagnostic Button */}
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      backgroundColor: '#10b981' + '20',
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: '#10b981',
                    }}
                    onPress={async () => {
                      console.log('🔍 BSSID diagnostic button pressed');

                      try {
                        // Import NativeWiFiService
                        const NativeWiFiService = require('./NativeWiFiService').default;

                        // Run comprehensive WiFi validation
                        const result = await NativeWiFiService.validateWiFiWithPermissions();

                        let message = '📶 BSSID Detection Results:\n\n';
                        message += `✅ Success: ${result.success ? 'YES' : 'NO'}\n`;
                        message += `📡 Current BSSID: ${result.currentBSSID}\n`;
                        message += `📶 SSID: ${result.ssid || 'Unknown'}\n`;
                        message += `📊 Signal: ${result.rssi || 0} dBm\n`;
                        message += `🔐 Permissions: ${result.hasPermissions ? 'Granted' : 'Denied'}\n`;
                        message += `📱 WiFi Enabled: ${result.wifiEnabled ? 'YES' : 'NO'}\n`;

                        if (!result.success && result.error) {
                          message += `\n❌ Error: ${result.error}`;
                        }

                        // Also update debug info
                        setWifiDebugInfo({
                          status: result.success ? 'DETECTED' : 'FAILED',
                          currentBSSID: result.currentBSSID,
                          expectedBSSID: 'Diagnostic mode',
                          room: currentClassInfo?.room || 'Test',
                          lastChecked: new Date().toLocaleTimeString(),
                          reason: result.error || 'Diagnostic check'
                        });

                        alert(message);

                      } catch (error) {
                        console.error('❌ BSSID diagnostic error:', error);
                        alert(`❌ Diagnostic Error:\n\n${error.message}`);
                      }
                    }}
                  >
                    <Text style={{
                      color: '#10b981',
                      fontSize: 12,
                      fontWeight: '600',
                      textAlign: 'center'
                    }}>
                      🔍 Check BSSID
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: theme.cardBackground,
              borderRadius: 20,
              padding: 30,
              alignItems: 'center',
              marginVertical: 20,
              borderWidth: 2,
              borderColor: theme.border,
            }}>
              <Text style={{ fontSize: 48, marginBottom: 15 }}>🕐</Text>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: theme.text,
                marginBottom: 10,
                textAlign: 'center'
              }}>
                No Lectures Right Now
              </Text>
              <Text style={{
                fontSize: 14,
                color: theme.textSecondary,
                textAlign: 'center',
                lineHeight: 20
              }}>
                Attendance tracking is only available during lecture hours. Please check your timetable for class timings.
              </Text>
            </View>
          )}



          {/* Random Ring Banner — student must respond */}
          {randomRingData && (
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: randomRingData.isRejection ? '#7f1d1d' : '#4c1d95',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              borderWidth: 2,
              borderColor: randomRingData.isRejection ? '#ef4444' : '#a78bfa',
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>🔔</Text>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 4 }}>
                {randomRingData.isRejection ? 'Presence Rejected' : 'Random Ring!'}
              </Text>
              <Text style={{ fontSize: 12, color: '#e0d7ff', textAlign: 'center', marginBottom: 12 }}>
                {randomRingData.isRejection
                  ? 'Teacher rejected your presence. Face verification required within 5 minutes.'
                  : 'Your teacher is verifying attendance. Confirm presence or verify your face.'}
              </Text>
              {!randomRingData.isRejection && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#ffffff', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, flex: 1, alignItems: 'center' }}
                    onPress={async () => {
                      try {
                        const res = await fetch(POST_ATTENDANCE_RANDOM_RING_RESPONSE, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            studentId,
                            randomRingId: randomRingData.randomRingId,
                            responseTime: new Date(_appGetBootMs()).toISOString(),
                          })
                        });
                        const result = await res.json();
                        if (result.success) {
                          setRandomRingData(prev => prev ? { ...prev, responded: true } : null);
                        } else {
                          alert('❌ Failed: ' + (result.error || 'Unknown error'));
                        }
                      } catch (e) {
                        alert('❌ Network error. Try again.');
                      }
                    }}
                  >
                    <Text style={{ color: '#4c1d95', fontWeight: 'bold', fontSize: 13 }}>✋ I'm Here</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20, flex: 1, alignItems: 'center' }}
                    onPress={handleRandomRingFaceVerify}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>📸 Verify Face</Text>
                  </TouchableOpacity>
                </View>
              )}
              {randomRingData.responded && (
                <Text style={{ color: '#86efac', fontSize: 12, marginTop: 8 }}>✅ Response sent — waiting for teacher</Text>
              )}
              {randomRingData.isRejection && (
                <TouchableOpacity
                  style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 28, marginTop: 4 }}
                  onPress={handleRandomRingFaceVerify}
                >
                  <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>📸 Verify Face</Text>
                </TouchableOpacity>
)}
            </View>
          )}

          {/* Past Period Detail Modal - Shown when user taps a past segment */}
          {viewingPastPeriod && pastPeriodData && (
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={closePastPeriodView}
              style={{ width: '100%', alignItems: 'center' }}
            >
              <View style={{
                width: '100%',
                maxWidth: 400,
                backgroundColor: theme.cardBackground,
                borderRadius: 12,
                padding: 20,
                borderWidth: 2,
                borderColor: pastPeriodData.present ? '#22c55e' : (pastPeriodData.isFuture ? theme.border : '#ef4444'),
                marginTop: 15,
              }}>
                {/* Timer Header */}
                <Text style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: theme.primary,
                  textAlign: 'center',
                  marginBottom: 15,
                }}>
                  🕐 {pastPeriodData.period} • {pastPeriodData.subject}
                </Text>

                <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center', marginBottom: 15 }}>
                  📍 {pastPeriodData.room} • 🕐 {pastPeriodData.time}
                </Text>

                {/* Timer Display */}
                <View style={{
                  backgroundColor: theme.background,
                  borderRadius: 15,
                  padding: 20,
                  marginBottom: 15,
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: pastPeriodData.present ? '#22c55e' : (pastPeriodData.isFuture ? theme.border : '#ef4444'),
                }}>
                  <Text style={{
                    fontSize: 48,
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    color: pastPeriodData.present ? '#22c55e' : (pastPeriodData.isFuture ? theme.text : '#ef4444'),
                    textAlign: 'center',
                  }}>
                    {Math.floor((pastPeriodData.attended || 0) / 3600).toString().padStart(2, '0')}:
                    {Math.floor(((pastPeriodData.attended || 0) % 3600) / 60).toString().padStart(2, '0')}:
                    {((pastPeriodData.attended || 0) % 60).toString().padStart(2, '0')}
                  </Text>
                  <Text style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    textAlign: 'center',
                    marginTop: 5,
                  }}>
                    {pastPeriodData.isFuture ? 'Period has not started yet' : `${Math.floor((pastPeriodData.attended || 0) / 60)} minutes attended`}
                  </Text>
                </View>

                {/* Attendance Stats */}
                {!pastPeriodData.isFuture && !pastPeriodData.notFound && (
                  <View style={{ backgroundColor: theme.background, borderRadius: 8, padding: 15 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: pastPeriodData.present ? '#22c55e' : '#ef4444' }}>
                        {pastPeriodData.present ? '✅ Present' : '❌ Absent'}
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text }}>
                        {pastPeriodData.percentage}%
                      </Text>
                    </View>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>Attended</Text>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                          {Math.floor(pastPeriodData.attended / 60)}m {pastPeriodData.attended % 60}s
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>Total Period</Text>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                          {Math.floor(pastPeriodData.total / 60)}m {pastPeriodData.total % 60}s
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
                
                {pastPeriodData.notFound && (
                  <View style={{ backgroundColor: theme.background, borderRadius: 8, padding: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                      ⚠️ No attendance data recorded for this period
                    </Text>
                  </View>
                )}

                {/* Tip */}
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 15, textAlign: 'center' }}>
                  💡 Tap anywhere to return to live timer
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Offline Timer Controls - NEW TIMER SYSTEM */}
          {offlineTimerInitialized && !currentClassInfo && !viewingPastPeriod && (
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: theme.cardBackground,
              borderRadius: 12,
              padding: 28,
              borderWidth: 2,
              borderColor: theme.border,
              marginTop: 15,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text, textAlign: 'center', marginBottom: 8 }}>
                yayyy!! NO class currently
              </Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center' }}>
                Your next class will appear here automatically when it starts.
              </Text>
            </View>
          )}
          {currentClassInfo && offlineTimerInitialized && !viewingPastPeriod && (
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: theme.cardBackground,
              borderRadius: 12,
              padding: 20,
              borderWidth: 2,
              borderColor: offlineTimerState.isRunning ? '#22c55e' : theme.border,
              marginTop: 15,
            }}>
              {/* Timer Header */}
              <Text style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: theme.primary,
                textAlign: 'center',
                marginBottom: 15,
              }}>
                🕐 Offline Timer System
              </Text>

              {/* Timer Display */}
              <View style={{
                backgroundColor: theme.background,
                borderRadius: 15,
                padding: 20,
                marginBottom: 15,
                alignItems: 'center',
                borderWidth: 2,
                borderColor: offlineTimerState.isRunning ? '#22c55e' : theme.border,
              }}>
                {(() => {
                  // Cap displayed seconds to the lecture duration so timer never shows > period length
                  const periodSrcDisplay = offlinePeriod || offlineTimerState.currentLecture;
                  const maxSecs = (() => {
                    if (periodSrcDisplay?.startTime && periodSrcDisplay?.endTime) {
                      const [sh, sm] = periodSrcDisplay.startTime.split(':').map(Number);
                      const [eh, em] = periodSrcDisplay.endTime.split(':').map(Number);
                      const dur = ((eh * 60 + em) - (sh * 60 + sm)) * 60;
                      if (dur > 0) return dur;
                    }
                    return null; // no cap if no period info
                  })();
                  const displaySecs = maxSecs !== null
                    ? Math.min(offlineTimerState.timerSeconds || 0, maxSecs)
                    : (offlineTimerState.timerSeconds || 0);
                  return (
                    <>
                      <Text style={{
                        fontSize: 48,
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        color: offlineTimerState.isRunning ? '#22c55e' : theme.text,
                        textAlign: 'center',
                      }}>
                        {Math.floor(displaySecs / 3600).toString().padStart(2, '0')}:
                        {Math.floor((displaySecs % 3600) / 60).toString().padStart(2, '0')}:
                        {(displaySecs % 60).toString().padStart(2, '0')}
                      </Text>
                      <Text style={{
                        fontSize: 12,
                        color: theme.textSecondary,
                        textAlign: 'center',
                        marginTop: 5,
                      }}>
                        {displaySecs > 0 ? `${Math.floor(displaySecs / 60)} minutes attended` : 'Ready to start'}
                      </Text>
                    </>
                  );
                })()}
              </View>

              {/* Attendance Threshold Progress */}
              {(() => {
                const pctRequired = offlineTimerState.attendanceThreshold || 75;
                const periodNum = offlinePeriod?.period || offlineTimerState.currentLecture?.period || null;

                // Source of truth for period times
                const periodSrc = offlinePeriod || offlineTimerState.currentLecture;

                // Compute total period duration in seconds — NO cap
                const totalSecs = (() => {
                  if (periodSrc?.startTime && periodSrc?.endTime) {
                    const [sh, sm] = periodSrc.startTime.split(':').map(Number);
                    const [eh, em] = periodSrc.endTime.split(':').map(Number);
                    const dur = ((eh * 60 + em) - (sh * 60 + sm)) * 60;
                    if (dur > 0) return dur;
                  }
                  return 60 * 60; // fallback 60 min
                })();

                // Time remaining until period ends (wall-clock based)
                const periodEndRemainSecs = (() => {
                  if (!periodSrc?.endTime) return null;
                  try {
                    const now = new Date();
                    const [eh, em] = periodSrc.endTime.split(':').map(Number);
                    const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0).getTime();
                    const diff = Math.floor((endMs - now.getTime()) / 1000);
                    return diff > 0 ? diff : 0;
                  } catch { return null; }
                })();

                // Threshold = pctRequired% of total duration
                const threshold = Math.ceil(totalSecs * pctRequired / 100);
                const attended = offlineTimerState.timerSeconds || 0;
                // 100% = full period duration
                const pct = Math.min(100, Math.round((attended / totalSecs) * 100));
                const reached = offlineTimerState.attendanceStatus === 'present' || attended >= threshold;
                const remainingSecs = Math.max(0, threshold - attended);

                // Format seconds → "Xh Ym" or "Ym" or "Xs"
                const fmtTime = (secs) => {
                  if (secs <= 0) return '0 min';
                  const h = Math.floor(secs / 3600);
                  const m = Math.floor((secs % 3600) / 60);
                  const s = secs % 60;
                  if (h > 0 && m > 0) return `${h}h ${m}m`;
                  if (h > 0) return `${h}h`;
                  if (m > 0) return `${m} min`;
                  return `${s} sec`;
                };

                const totalFmt = fmtTime(totalSecs);
                const attendedFmt = fmtTime(attended);
                const remainFmt = fmtTime(remainingSecs);
                const thresholdFmt = fmtTime(threshold);
                const periodEndFmt = periodEndRemainSecs !== null ? fmtTime(periodEndRemainSecs) : null;

                return (
                  <View style={{ backgroundColor: theme.background, borderRadius: 10, padding: 12, marginBottom: 15 }}>
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                        {periodNum ? `P${periodNum} · ` : ''}{pctRequired}% attendance required
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: reached ? '#22c55e' : '#f59e0b' }}>
                        {reached ? '✅ Present' : `${pct}%`}
                      </Text>
                    </View>

                    {/* Progress bar — 100% = full period, marker at attendance threshold */}
                    <View style={{ height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden', marginBottom: 2 }}>
                      <View style={{ height: 8, width: `${pct}%`, backgroundColor: reached ? '#22c55e' : '#f59e0b', borderRadius: 4 }} />
                    </View>
                    {/* Threshold marker */}
                    <View style={{ position: 'relative', height: 12, marginBottom: 6 }}>
                      <View style={{
                        position: 'absolute',
                        left: `${pctRequired}%`,
                        top: 0,
                        width: 2,
                        height: 10,
                        backgroundColor: '#ef4444',
                        borderRadius: 1,
                      }} />
                      <Text style={{
                        position: 'absolute',
                        left: `${pctRequired}%`,
                        top: 0,
                        fontSize: 9,
                        color: '#ef4444',
                        fontWeight: '700',
                        marginLeft: 3,
                      }}>{pctRequired}%</Text>
                    </View>

                    {/* Period total duration + need to attend */}
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>
                      📅 Period: <Text style={{ fontWeight: '600', color: theme.text }}>{totalFmt}</Text>
                      {'  '}·{'  '}Need <Text style={{ fontWeight: '600', color: theme.text }}>{thresholdFmt}</Text> to be present
                    </Text>

                    {/* Period ends in */}
                    {periodEndFmt !== null && (
                      <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>
                        🕐 Period ends in: <Text style={{ fontWeight: '600', color: periodEndRemainSecs < 600 ? '#ef4444' : theme.text }}>{periodEndFmt}</Text>
                        {periodSrc?.endTime ? <Text style={{ color: theme.textSecondary }}> ({periodSrc.endTime})</Text> : null}
                      </Text>
                    )}

                    {/* Attended / remaining to mark present */}
                    {reached ? (
                      <Text style={{ fontSize: 11, color: '#22c55e', fontWeight: '600', textAlign: 'center' }}>
                        ✅ Attended {attendedFmt} — marked present
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '600', textAlign: 'center' }}>
                        ⏱ Attended {attendedFmt} · Need {remainFmt} more to be marked present
                      </Text>
                    )}
                  </View>
                );
              })()}
              <View style={{ backgroundColor: theme.background, borderRadius: 10, padding: 12, marginBottom: 15 }}>

                {/* Status row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Status:</Text>
                  <Text style={{
                    fontSize: 12, fontWeight: 'bold',
                    color: offlineTimerState.isRunning
                      ? (offlineTimerState.isPaused ? '#f59e0b' : '#22c55e') : '#ef4444'
                  }}>
                    {offlineTimerState.isRunning
                      ? (offlineTimerState.isPaused ? '⏸️ Paused' : '▶️ Running') : '⏹️ Stopped'}
                  </Text>
                </View>

                {/* Connection row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Connection:</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontSize: 12, fontWeight: 'bold',
                      color: offlineTimerState.hasInternetConnection && offlineTimerState.isConnectedToAuthorizedWiFi
                        ? '#22c55e' : offlineTimerState.isConnectedToAuthorizedWiFi ? '#f59e0b' : '#ef4444'
                    }}>
                      {offlineTimerState.hasInternetConnection && offlineTimerState.isConnectedToAuthorizedWiFi
                        ? '🌐 Online' : offlineTimerState.isConnectedToAuthorizedWiFi ? '📱 Offline' : '❌ No WiFi'}
                    </Text>
                    {offlineTimerState.pendingSyncCount > 0 && (
                      <Text style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>
                        {offlineTimerState.pendingSyncCount} pending sync{offlineTimerState.pendingSyncCount > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Security Status — from actual verification state */}
                {offlineTimerState.isRunning && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginBottom: 4 }}>
                      Security Status
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <Text style={{ fontSize: 10, color: offlineTimerState.isConnectedToAuthorizedWiFi ? '#22c55e' : '#ef4444' }}>
                        📶 WiFi {offlineTimerState.isConnectedToAuthorizedWiFi ? '✓' : '✗'}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#22c55e' }}>👤 Face ✓</Text>
                      <Text style={{ fontSize: 10, color: offlineTimerState.isConnectedToAuthorizedWiFi ? '#22c55e' : '#ef4444' }}>
                        📍 Location {offlineTimerState.isConnectedToAuthorizedWiFi ? '✓' : '✗'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Current period info from offline schedule */}
                {(() => {
                  const p = offlinePeriod || offlineTimerState.currentLecture;
                  if (!p) return null;
                  return (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text, textAlign: 'center' }}>
                        📚 {p.subject}{p.period ? ` (Period ${p.period})` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginTop: 2 }}>
                        {[
                          p.room && `🚪 ${p.room}`,
                          (p.teacher || p.teacherName) && `👤 ${p.teacher || p.teacherName}`,
                          p.startTime && p.endTime && `⏰ ${p.startTime}–${p.endTime}`,
                        ].filter(Boolean).join('  ')}
                      </Text>
                    </View>
                  );
                })()}

                {/* Last sync time */}
                {offlineTimerState.lastSyncTime > 0 && (
                  <Text style={{ fontSize: 10, color: theme.textSecondary, textAlign: 'center', marginTop: 6 }}>
                    Last sync: {(() => {
                      try {
                        // lastSyncTime is boot-elapsed ms — convert to wall clock
                        const bootNow = _appGetBootMs();
                        const elapsedSinceSync = bootNow - offlineTimerState.lastSyncTime;
                        const wallTime = new Date(Date.now() - elapsedSinceSync);
                        return wallTime.toLocaleTimeString();
                      } catch { return '—'; }
                    })()}
                  </Text>
                )}
              </View>

              {/* Timer Control Button - show when there's an active period */}
              {((currentClassInfo && currentClassInfo.currentLecture !== 'Break') || 
                (offlinePeriod && offlinePeriod.subject && !offlinePeriod.isBreak)) && (
                <TouchableOpacity
                  style={{
                    backgroundColor: offlineTimerState.isRunning ? '#ef4444' : '#22c55e',
                    borderRadius: 12,
                    padding: 15,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 3.84,
                    elevation: 5,
                  }}
                  onPress={handleTimerStartStop}
                >
                  <Text style={{
                    color: '#ffffff',
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}>
                    {offlineTimerState.isRunning ? '⏹️ STOP TIMER' : '🔐 START TIMER'}
                  </Text>
                  {!offlineTimerState.isRunning && (
                    <Text style={{
                      color: '#ffffff',
                      fontSize: 11,
                      marginTop: 5,
                      opacity: 0.9,
                      textAlign: 'center',
                    }}>
                      Requires WiFi + Face verification
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Leave Day Message - Matches frontend_home.md */}
          {!currentClassInfo && (
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: theme.cardBackground,
              borderRadius: 12,
              padding: 14,
              borderWidth: 2,
              borderColor: theme.border,
              marginTop: 10,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center' }}>
                🏖️ It's a leave
              </Text>
            </View>
          )}

          {/* Today's Attendance Summary */}
          {todayAttendance.lectures.length > 0 && (
            <View style={{
              marginTop: 10,
              width: '100%',
              maxWidth: 400,
              backgroundColor: theme.cardBackground,
              borderRadius: 12,
              padding: 14,
              borderWidth: 2,
              borderColor: theme.border,
            }}>
              <Text style={{ color: theme.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
                📊 Today's Attendance
              </Text>

              {/* Overall Stats */}
              <View style={{
                backgroundColor: todayAttendance.dayPresent ? '#22c55e20' : '#ef444420',
                borderRadius: 8,
                padding: 10,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: todayAttendance.dayPresent ? '#22c55e' : '#ef4444'
              }}>
                <Text style={{
                  color: todayAttendance.dayPresent ? '#22c55e' : '#ef4444',
                  fontSize: 13,
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  {todayAttendance.dayPresent ? '✅ Present' : '❌ Absent'} • {todayAttendance.dayPercentage}%
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 3 }}>
                  {formatTimeHMS(todayAttendance.totalAttended * 60)} attended / {formatTimeHMS(todayAttendance.totalClassTime * 60)} total
                </Text>
              </View>

{/* Per Lecture Breakdown */}
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
                Lectures:
              </Text>
              {todayAttendance.lectures.map((lecture, index) => (
                <View key={index} style={{
                  backgroundColor: theme.background,
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: lecture.present ? '#22c55e' : '#ef4444'
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 }}>
                      {lecture.period || `P${index + 1}`}. {lecture.subject}
                    </Text>
                    <Text style={{
                      color: lecture.present ? '#22c55e' : '#ef4444',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}>
                      {lecture.present ? '✓' : '✗'} {lecture.percentage}%
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 2 }}>
                    {formatTimeHMS(lecture.attended * 60)} / {formatTimeHMS(lecture.total * 60)} • {lecture.startTime}-{lecture.endTime}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Overall Attendance Stats */}
          {(() => {
            const stats = getAttendanceStats();
            return stats.totalDays > 0 && (
              <View style={{
                marginTop: 10,
                width: '100%',
                maxWidth: 400,
                backgroundColor: theme.cardBackground,
                borderRadius: 12,
                padding: 14,
                borderWidth: 2,
                borderColor: theme.border,
              }}>
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
                  📈 Overall Attendance
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Days Attended:</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                    {stats.presentDays} / {stats.totalDays}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Attendance:</Text>
                  <Text style={{
                    color: stats.attendancePercentage >= 75 ? '#22c55e' : '#ef4444',
                    fontSize: 12,
                    fontWeight: 'bold'
                  }}>
                    {stats.attendancePercentage}%
                  </Text>
                </View>
              </View>
            );
          })()}


        </ScrollView>

        {/* Profile Modal */}
        {showProfile && (
          <Modal
            transparent={true}
            visible={showProfile}
            animationType="fade"
            onRequestClose={() => setShowProfile(false)}
          >
            <View style={styles.modalOverlay}>
              <Animated.View style={[styles.profileModalContent, {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
                transform: [{ scale: profileScaleAnim }]
              }]}>
                <ScrollView>
                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.modalTitle, { color: theme.primary }]}>👤 Profile</Text>
                    <TouchableOpacity onPress={() => setShowProfile(false)}>
                      <Text style={styles.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Profile Avatar */}
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    <View style={{
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      backgroundColor: theme.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 4,
                      borderColor: theme.border,
                      marginBottom: 15,
                      overflow: 'hidden',
                    }}>
                      {userData?.photoUrl ? (
                        <Image
                          source={{ uri: userData.photoUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                          onError={(e) => console.log('❌ Student profile modal photo error:', e.nativeEvent.error)}
                          onLoad={() => console.log('✅ Student profile modal photo loaded')}
                        />
                      ) : (
                        <Text style={{ fontSize: 48, color: isDarkTheme ? '#0a1628' : '#ffffff', fontWeight: 'bold' }}>
                          {getInitials(userData?.name || studentName || 'User')}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text }}>
                      {userData?.name || studentName || 'User'}
                    </Text>
                    <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 5 }}>
                      🎓 Student
                    </Text>
                  </View>

                  {/* Profile Information */}
                  <View style={[styles.detailSection, { borderBottomColor: theme.border + '40' }]}>
                    <Text style={[styles.sectionTitle, { color: theme.primary }]}>📋 Personal Information</Text>

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Name:</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.name || studentName || 'N/A'}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Enrollment No:</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.enrollmentNo || loginId || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Course:</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.course || branch || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Semester:</Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{userData?.semester || semester || 'N/A'}</Text>
                    </View>
                    {userData?.email && (
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Email:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{userData.email}</Text>
                      </View>
                    )}
                    {userData?.phone && (
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Phone:</Text>
                        <Text style={[styles.infoValue, { color: theme.text }]}>{userData.phone}</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={{ padding: 20 }}>
                    <TouchableOpacity
                      style={[styles.logoutButton, { backgroundColor: '#ff4444' }]}
                      onPress={() => {
                        setShowProfile(false);
                        setTimeout(() => handleLogout(), 300);
                      }}
                    >
                      <Text style={styles.logoutButtonText}>🚪 Logout</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </Animated.View>
            </View>
          </Modal>
        )}

        {/* Face Verification Modal - REMOVED */}

        {/* Lanyard Card */}
        <LanyardCard
          visible={showLanyard}
          onClose={() => setShowLanyard(false)}
          userData={userData}
          theme={theme}
          onOpenFullProfile={() => {
            setShowLanyard(false);
            setTimeout(() => setShowProfile(true), 300);
          }}
        />



        {/* Floating Brand Button - Only on Home tab */}
        {activeTab === 'home' && (
          <FloatingBrandButton theme={{ ...theme, isDark: isDarkTheme }} />
        )}

        {/* Offline Toast Message */}
        {isOffline && (
          <Animated.View style={{
            position: 'absolute',
            bottom: 100,
            left: 20,
            right: 20,
            backgroundColor: '#ef4444',
            padding: 16,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}>
            <Text style={{ fontSize: 24 }}>📡</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                App is offline
              </Text>
              <Text style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>
                Check your internet connection
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Theme Picker Modal */}
        <Modal
          visible={showThemePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowThemePicker(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowThemePicker(false)}
          >
            <View style={{ backgroundColor: theme.cardBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}
              onStartShouldSetResponder={() => true}
            >
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>🎨 Choose Theme</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 16 }}>Pick a look that feels right</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {THEME_GROUPS.map((group) => (
                  <View key={group.label} style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                      {group.label}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {group.keys.map((key) => {
                        const t = THEMES[key];
                        const isActive = themeMode === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => selectTheme(key)}
                            style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: isActive ? 2 : 1, borderColor: isActive ? t.primary : t.border }}
                          >
                            <View style={{ backgroundColor: t.background, padding: 8, alignItems: 'center' }}>
                              <View style={{ width: '100%', backgroundColor: t.cardBackground, borderRadius: 6, padding: 5, marginBottom: 5, borderWidth: 1, borderColor: t.border }}>
                                <View style={{ width: '65%', height: 5, backgroundColor: t.primary, borderRadius: 3, marginBottom: 3 }} />
                                <View style={{ width: '45%', height: 3, backgroundColor: t.textSecondary, borderRadius: 2 }} />
                              </View>
                              <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
                            </View>
                            <View style={{ backgroundColor: t.cardBackground, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' }}>
                              <Text style={{ color: t.text, fontSize: 10, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{t.label}</Text>
                              {isActive && <Text style={{ color: t.primary, fontSize: 9, marginTop: 1 }}>✓ Active</Text>}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Bottom Navigation */}
        <BottomNavigation
          theme={theme}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={selectedRole}
          notificationBadge={notificationBadge}
        />

        {/* Party Popper — shown when attendance threshold is reached */}
        {showPartyPopper && <PartyPopper />}

        {/* Toast notifications */}
        <ToastContainer />
      </View>
    );
  }
}

// ── Party Popper component ────────────────────────────────────────────────────
const EMOJIS = ['🎉', '🎊', '✨', '🌟', '💥', '🎈', '🥳', '⭐', '🎆', '🎇'];
const PARTICLE_COUNT = 18;

function PartyPopper() {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      anim: new Animated.Value(0),
      angle: (i / PARTICLE_COUNT) * 2 * Math.PI,
      emoji: EMOJIS[i % EMOJIS.length],
      dist: 120 + Math.random() * 80,
      size: 18 + Math.floor(Math.random() * 14),
    }))
  ).current;

  useEffect(() => {
    const anim = Animated.stagger(30, particles.map(p =>
      Animated.sequence([
        Animated.timing(p.anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(p.anim, { toValue: 0, duration: 600, delay: 800, useNativeDriver: true }),
      ])
    ));
    anim.start();
    return () => {
      anim.stop();
      particles.forEach(p => p.anim.stopAnimation());
    };
  }, []);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      {/* Central badge */}
      <Animated.View style={{ alignItems: 'center', opacity: particles[0].anim, transform: [{ scale: particles[0].anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.3, 1] }) }] }}>
        <View style={{ backgroundColor: '#22c55e', borderRadius: 50, paddingHorizontal: 24, paddingVertical: 12, shadowColor: '#22c55e', shadowOpacity: 0.8, shadowRadius: 20, elevation: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>🎉 Attendance Marked!</Text>
        </View>
      </Animated.View>

      {/* Burst particles */}
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            fontSize: p.size,
            opacity: p.anim,
            transform: [
              { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] }) },
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist - 40] }) },
              { scale: p.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1.2, 0.8] }) },
            ],
          }}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  loginForm: {
    width: '100%',
    backgroundColor: '#0d1f3c',
    borderRadius: 20,
    padding: 30,
    borderWidth: 2,
    borderColor: '#00d9ff',
  },
  loginLabel: {
    color: '#00d9ff',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  loginInput: {
    backgroundColor: '#0a1628',
    borderWidth: 2,
    borderColor: '#00d9ff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    color: '#00f5ff',
  },
  loginError: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 15,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 30,
    width: '100%',
  },
  loginButtonInner: {
    backgroundColor: '#00f5ff',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 10,
  },
  loginButtonText: {
    color: '#0a1628',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginHint: {
    color: '#00d9ff80',
    fontSize: 12,
    marginTop: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  teacherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  themeButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginTop: 5,
  },
  themeButtonText: {
    fontSize: 18,
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginTop: 5,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  statCard: {
    backgroundColor: '#0d1f3c',
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 70,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00f5ff',
  },
  statLabel: {
    fontSize: 11,
    color: '#00d9ff',
    marginTop: 4,
  },
  percentageContainer: {
    backgroundColor: '#0d1f3c',
    borderWidth: 2,
    borderColor: '#00d9ff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginBottom: 15,
    alignItems: 'center',
  },
  percentageText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00f5ff',
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#00d9ff',
    marginBottom: 10,
  },
  listHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00f5ff',
  },
  listHeaderSubtext: {
    fontSize: 12,
    color: '#00d9ff80',
    marginTop: 3,
  },
  studentId: {
    fontSize: 12,
    color: '#00d9ff80',
    marginTop: 3,
  },
  studentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  runningIndicator: {
    fontSize: 12,
    color: '#00ff88',
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 15,
  },
  emptySubtext: {
    color: '#00d9ff80',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  tapHint: {
    color: '#00d9ff80',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0d1f3c',
    borderRadius: 20,
    width: '100%',
    maxHeight: '90%',
    borderWidth: 2,
    borderColor: '#00d9ff',
  },
  profileModalContent: {
    backgroundColor: '#0d1f3c',
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    borderWidth: 2,
    borderColor: '#00d9ff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#00d9ff',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00f5ff',
  },
  modalClose: {
    fontSize: 28,
    color: '#ff4444',
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#00d9ff',
    fontSize: 16,
  },
  detailSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#00d9ff40',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00f5ff',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    color: '#00d9ff',
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '48%',
    backgroundColor: '#0a1628',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00d9ff',
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#00d9ff20',
  },
  recordDate: {
    color: '#00d9ff',
    fontSize: 14,
  },
  recordStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  glowText: {
    fontWeight: 'bold',
    marginBottom: 10,
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 30,
  },
  roleButton: {
    width: 140,
    height: 160,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIcon: {
    fontSize: 60,
    marginBottom: 15,
  },
  roleText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  inputContainer: {
    width: '100%',
    borderWidth: 2,
    borderRadius: 15,
    padding: 15,
    marginBottom: 30,
    elevation: 10,
  },
  input: {
    fontSize: 20,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#00f5ff',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 15,
    elevation: 10,
  },
  submitButtonText: {
    color: '#0a1628',
    fontSize: 18,
    fontWeight: 'bold',
  },
  studentNameDisplay: {
    fontSize: 18,
    color: '#00d9ff',
    marginBottom: 30,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 15,
    minWidth: 120,
    alignItems: 'center',
    elevation: 10,
  },
  buttonText: {
    fontWeight: 'bold',
  },
  studentList: {
    width: '100%',
    flex: 1,
  },
  studentListContent: {
    paddingBottom: 20,
  },
  studentCard: {
    borderWidth: 2,
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 10,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  studentName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00f5ff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0a1628',
  },
  timerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00d9ff',
    textAlign: 'center',
  },
  emptyText: {
    color: '#00d9ff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  timetableHeader: {
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#00d9ff',
  },
  timetableScrollHorizontal: {
    flex: 1,
    width: '100%',
  },
  timetableGrid: {
    padding: 10,
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridCell: {
    borderWidth: 1,
    borderColor: '#00d9ff',
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 60,
  },
  cornerCell: {
    width: 70,
    backgroundColor: '#0d1f3c',
  },
  cornerText: {
    color: '#00d9ff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerCell: {
    width: 90,
    backgroundColor: '#0d1f3c',
  },
  periodHeaderText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timeText: {
    color: '#00bfff',
    fontSize: 9,
    marginTop: 2,
  },
  dayCell: {
    width: 70,
    backgroundColor: '#0d1f3c',
  },
  dayText: {
    color: '#00f5ff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dataCell: {
    width: 90,
    backgroundColor: '#0a1628',

  },
  breakCell: {
    backgroundColor: '#1a2a3a',
  },
  subjectTextSmall: {
    color: '#00f5ff',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  roomTextSmall: {
    color: '#00d9ff',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  breakTextSmall: {
    color: '#00bfff',
    fontSize: 20,
  },
  editModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editModalContent: {
    backgroundColor: '#0d1f3c',
    borderRadius: 15,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: '#00d9ff',
  },
  editModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00f5ff',
    textAlign: 'center',
    marginBottom: 5,
  },
  editModalSubtitle: {
    fontSize: 14,
    color: '#00d9ff',
    textAlign: 'center',
    marginBottom: 20,
  },
  editInput: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#00d9ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    color: '#00f5ff',
    fontSize: 16,
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  editModalButton: {
    flex: 1,
    backgroundColor: '#00f5ff',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  editModalCancelButton: {
    backgroundColor: '#ff4444',
  },
  editModalButtonText: {
    color: '#0a1628',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editModalHint: {
    fontSize: 11,
    color: '#00d9ff',
    textAlign: 'center',
    marginTop: 15,
  },
});
