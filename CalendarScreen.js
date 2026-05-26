import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal,
    Platform, Dimensions, TextInput, RefreshControl,
} from 'react-native';
import io from 'socket.io-client';
import { CalendarIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon, RefreshIcon } from './Icons';
import { getServerTime } from './ServerTime';

import { GET_ATTENDANCE_RECORDS, GET_ATTENDANCE_BY_DATE, GET_ATTENDANCE_BY_DATE_SUBJECT, GET_ATTENDANCE_SUBJECTS, GET_ATTENDANCE_SUBJECT_DATES, GET_HOLIDAYS_RANGE, GET_STUDENT_ATTENDANCE_DATES, GET_STUDENT_ATTENDANCE_BY_DATE, GET_STUDENT_ATTENDANCE_SUBJECT_STATS } from './constants/apiEndpoints';
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── Chevron icons (inline so no extra dep) ──────────────────────────────────
const ChevronLeft  = ({ color = '#fff', size = 20 }) => (
    <Text style={{ color, fontSize: size, lineHeight: size + 4 }}>‹</Text>
);
const ChevronRight = ({ color = '#fff', size = 20 }) => (
    <Text style={{ color, fontSize: size, lineHeight: size + 4 }}>›</Text>
);

export default function CalendarScreen({
    theme, studentId, semester, branch, socketUrl, isTeacher = false, userData, todayAttendance, isTimerRunning = false
}) {
    const getInitialDate = () => {
        try { return getServerTime().nowDate(); } catch { return new Date(); }
    };

    // ── shared state ──────────────────────────────────────────────────────────
    const [currentDate,       setCurrentDate]       = useState(getInitialDate());
    const [selectedDate,      setSelectedDate]       = useState(getInitialDate());
    const [attendanceData,    setAttendanceData]     = useState({});   // dateKey → status/stats
    const [attendanceRecords, setAttendanceRecords]  = useState({});   // dateKey → full record (student)
    const [loading,           setLoading]            = useState(false);
    const [monthStats,        setMonthStats]         = useState({ present: 0, absent: 0, total: 0 });
    const [showDetailsModal,  setShowDetailsModal]   = useState(false);
    const [selectedDateDetails, setSelectedDateDetails] = useState(null);
    const [holidays,          setHolidays]           = useState({});

    // ── teacher filter state ──────────────────────────────────────────────────
    const [filterMode,        setFilterMode]         = useState('day');     // 'day' | 'subject'
    const [subjectList,       setSubjectList]        = useState([]);
    const [selectedSubject,   setSelectedSubject]    = useState('');
    const [activeDates,       setActiveDates]        = useState(new Set()); // ISO strings

    // ── teacher date-click state ──────────────────────────────────────────────
    const [studentsOnDate,    setStudentsOnDate]     = useState([]);
    const [loadingStudents,   setLoadingStudents]    = useState(false);
    const [studentsCache,     setStudentsCache]      = useState({});   // dateStr -> processed students list
    // subject mode: per-period navigation
    const [allPeriods,        setAllPeriods]         = useState([]);   // ['P1','P3',…]
    const [currentPeriodIdx,  setCurrentPeriodIdx]   = useState(0);
    // student drill-down
    const [drillStudent,      setDrillStudent]       = useState(null); // student object with lectures
    const [drillSubjectStats, setDrillSubjectStats]  = useState([]);   // per-subject bubbles
    const [visibleStudentsCount, setVisibleStudentsCount] = useState(20);
    const [modalTimerOffset, setModalTimerOffset] = useState(0);

    // ── Live timer for modal ──
    useEffect(() => {
        let interval;
        if (showDetailsModal && isToday(selectedDate)) {
            interval = setInterval(() => {
                setModalTimerOffset(prev => prev + 1);
            }, 1000);
        } else {
            setModalTimerOffset(0);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [showDetailsModal, selectedDate]);

    // ── Real-time Socket Listener ──
    useEffect(() => {
        if (!socketUrl || !showDetailsModal) return;

        const socket = io(socketUrl, {
            transports: ['websocket'],
            reconnection: true
        });

        socket.on('student_timer_sync', (data) => {
            // data: { enrollmentNo, timerSeconds, isRunning, status, date }
            const todayStr = isToday(selectedDate) ? selectedDate.toDateString() : null;
            const eventDate = new Date(data.date).toDateString();

            // Check if this update is for the student we are currently viewing
            const currentEnrollment = isTeacher ? drillStudent?.enrollmentNo : studentId;

            if (data.enrollmentNo === currentEnrollment && eventDate === todayStr) {
                console.log(`📡 [SOCKET] Real-time timer update for ${data.enrollmentNo}: ${data.timerSeconds}s`);
                
                // Update selectedDateDetails
                setSelectedDateDetails(prev => {
                    if (!prev) return prev;
                    
                    // Update the incoming period, but never downgrade a persisted/synced value
                    // with a stale live socket payload. Final Mongo data remains canonical.
                    const updatedLectures = (prev.lectures || []).map(lec => {
                        const isTargetPeriod = data.activePeriod && lec.period === data.activePeriod;
                        const isCurrentActive = lec.status === 'active';
                        if (isTargetPeriod || isCurrentActive) {
                            const incomingSeconds = Number(data.timerSeconds) || 0;
                            const currentSeconds = Number(lec.attended) || 0;
                            return {
                                ...lec,
                                attended: Math.max(currentSeconds, incomingSeconds),
                                actualAttended: Math.max(Number(lec.actualAttended) || 0, incomingSeconds),
                                status: data.status || lec.status
                            };
                        }
                        return lec;
                    });
                    
                    // Recalculate total attended minutes from all lectures
                    const totalAttendedSec = updatedLectures.reduce((sum, l) => sum + (l.attended || 0), 0);
                    const totalAttendedMin = Math.floor(totalAttendedSec / 60);

                    return { 
                        ...prev, 
                        status: data.status, 
                        totalAttended: totalAttendedMin,
                        lectures: updatedLectures
                    };
                });

                // Reset offset since we just got a fresh sync
                setModalTimerOffset(0);
                
                // If teacher is viewing, update drillStudent too
                if (isTeacher && drillStudent) {
                    setDrillStudent(prev => {
                        if (!prev) return prev;
                        const updated = { ...prev, status: data.status };
                        if (updated.lectures) {
                            updated.lectures = updated.lectures.map(lec => {
                                const isTargetPeriod = data.activePeriod && lec.period === data.activePeriod;
                                const isCurrentActive = lec.status === 'active';
                                if (isTargetPeriod || isCurrentActive) {
                                    const incomingSeconds = Number(data.timerSeconds) || 0;
                                    const currentSeconds = Number(lec.attended) || 0;
                                    return {
                                        ...lec,
                                        attended: Math.max(currentSeconds, incomingSeconds),
                                        actualAttended: Math.max(Number(lec.actualAttended) || 0, incomingSeconds),
                                        status: data.status || lec.status
                                    };
                                }
                                return lec;
                            });
                        }
                        return updated;
                    });
                }
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [socketUrl, showDetailsModal, selectedDate, studentId, isTeacher, drillStudent?.enrollmentNo]);

    // ── memoized stats ────────────────────────────────────────────────────────
    const modalSummary = useMemo(() => {
        if (!studentsOnDate.length) return { present: 0, absent: 0, total: 0 };
        let present = 0;
        let absent = 0;
        studentsOnDate.forEach(s => {
            const status = filterMode === 'subject' && allPeriods.length > 0
                ? s.periods?.[currentPeriodIdx]?.status
                : s.status;
            if (status === 'present') present++;
            else absent++;
        });
        return { present, absent, total: studentsOnDate.length };
    }, [studentsOnDate, filterMode, allPeriods, currentPeriodIdx]);

    // ── effects ───────────────────────────────────────────────────────────────
    // ── shared fetch helper with timeout ─────────────────────────────────────
    const [fetchError, setFetchError] = useState(null);

    const apiFetch = async (url, timeoutMs = 15000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            console.log(`🌐 [NETWORK] Fetching: ${url}`);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            console.log(`📡 [NETWORK] Response ${res.status} from: ${url}`);
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            return await res.json();
        } catch (err) {
            clearTimeout(timer);
            console.error(`❌ [NETWORK] Failed to fetch ${url}: ${err.message}`);
            if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
            throw err;
        }
    };

    useEffect(() => {
        if (isTeacher) {
            if (filterMode === 'day') {
                fetchTeacherMonthData();
            } else if (filterMode === 'subject' && selectedSubject) {
                fetchSubjectDates();
            }
        } else {
            fetchMonthAttendance();
        }
        fetchHolidays();
    }, [currentDate, studentId, semester, branch, filterMode, selectedSubject]);

    // Clear cache when semester or branch changes
    useEffect(() => {
        setStudentsCache({});
    }, [semester, branch]);

    // Load subject list when teacher switches to subject mode
    useEffect(() => {
        if (isTeacher && filterMode === 'subject') {
            if (semester && branch) fetchSubjectList();
        }
    }, [filterMode, isTeacher, semester, branch]);

    // ── holiday fetch — silent fail, non-critical ─────────────────────────────
    const fetchHolidays = async () => {
        try {
            const year  = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const start = new Date(year, month, 1).toISOString();
            const end   = new Date(year, month + 1, 0).toISOString();
            const data  = await apiFetch(`${GET_HOLIDAYS_RANGE}?startDate=${start}&endDate=${end}`);
            if (data.success && data.holidays) {
                const map = {};
                data.holidays.forEach(h => {
                    // Convert to IST date string
                    const d = new Date(new Date(h.date).getTime() + 5.5 * 60 * 60 * 1000);
                    map[d.toDateString()] = h;
                });
                setHolidays(map);
            }
        } catch (_) {
            // Holidays are non-critical — silently ignore
        }
    };

    // ── teacher: day mode ─────────────────────────────────────────────────────
    const fetchTeacherMonthData = async () => {
        if (!semester || !branch) {
            setFetchError('Select a semester and branch to view attendance.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setFetchError(null);
        try {
            const year  = currentDate.getFullYear();
            const month = currentDate.getMonth();
            // Start of month (UTC 00:00:00)
            const start = new Date(year, month, 1).toISOString();
            // End of month (UTC 23:59:59)
            const end   = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

            const data = await apiFetch(`${GET_ATTENDANCE_RECORDS}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}&startDate=${start}&endDate=${end}`, 25000);
            if (data.success && Array.isArray(data.records)) {
                const dateMap = {};
                let mp = 0;
                let ma = 0;
                data.records.forEach(r => {
                    // Convert to IST date string to match calendar cell keys (device is IST)
                    const d = new Date(new Date(r.date).getTime() + 5.5 * 60 * 60 * 1000);
                    const key = d.toDateString();
                    if (!dateMap[key]) dateMap[key] = { present: 0, absent: 0, total: 0 };
                    if (r.status === 'present') { dateMap[key].present++; mp++; }
                    else { dateMap[key].absent++; ma++; }
                    dateMap[key].total++;
                });
                setAttendanceData(dateMap);
                setMonthStats({ present: mp, absent: ma, total: mp + ma });
            } else {
                setFetchError('No attendance data found for this class.');
            }
        } catch (err) {
            setFetchError(`Failed to load attendance: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── teacher: subject list — cached, only fetches once per semester/branch ──
    const subjectListCacheRef = React.useRef({});
    const fetchSubjectList = async () => {
        const cacheKey = `${semester}||${branch}`;
        if (subjectListCacheRef.current[cacheKey]) {
            setSubjectList(subjectListCacheRef.current[cacheKey]);
            setSelectedSubject(prev => prev || subjectListCacheRef.current[cacheKey][0] || '');
            return;
        }
        try {
            const data = await apiFetch(`${GET_ATTENDANCE_SUBJECTS}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`);
            if (data.success && data.subjects?.length > 0) {
                subjectListCacheRef.current[cacheKey] = data.subjects;
                setSubjectList(data.subjects);
                setSelectedSubject(prev => prev || data.subjects[0]);
            } else {
                setSubjectList([]);
            }
        } catch (err) {
            console.warn('Subject list fetch failed:', err.message);
            setSubjectList([]);
        }
    };

    // ── teacher: subject mode — fetch active dates ────────────────────────────
    const fetchSubjectDates = async () => {
        if (!selectedSubject) return;
        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch(
                `${GET_ATTENDANCE_SUBJECT_DATES}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}&subject=${encodeURIComponent(selectedSubject)}`
            );
            if (data.success) {
                setActiveDates(new Set(data.dates));
            } else {
                setActiveDates(new Set());
                setFetchError('No scheduled dates found for this subject.');
            }
        } catch (err) {
            setFetchError(`Failed to load subject dates: ${err.message}`);
            setActiveDates(new Set());
        } finally {
            setLoading(false);
        }
    };

    // ── student: month attendance ─────────────────────────────────────────────
    const fetchMonthAttendance = async () => {
        if (!studentId) return;
        setLoading(true);
        setFetchError(null);
        try {
            const year  = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const start = new Date(year, month, 1).toISOString();
            const end   = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

            const data = await apiFetch(`${GET_STUDENT_ATTENDANCE_DATES(studentId)}?startDate=${start}&endDate=${end}`, 25000);
            const recordsToProcess = data.dates || data.records;
            if (data.success && Array.isArray(recordsToProcess)) {
                const aMap = {};
                const rMap = {};
                recordsToProcess.forEach(r => {
                    // Convert to IST date string to match calendar cell keys (device is IST)
                    const d = new Date(new Date(r.date).getTime() + 5.5 * 60 * 60 * 1000);
                    const key = d.toDateString();
                    r.totalAttended = Number(r.totalAttended) || 0;
                    r.totalClassTime = Number(r.totalClassTime) || 0;
                    r.dayPercentage = Number(r.dayPercentage) || 0;
                    aMap[key] = r.status;
                    rMap[key] = r;
                });
                // Merge today's live attendance from local state
                if (todayAttendance && todayAttendance.lectures && todayAttendance.lectures.length > 0) {
                    const todayKey = todayAttendance.date;
                    // Show today as active/present if timer is running OR day is marked present
                    if (todayAttendance.dayPresent || isTimerRunning) {
                        const liveStatus = todayAttendance.dayPresent ? 'present' : 'active';
                        aMap[todayKey] = liveStatus;
                        rMap[todayKey] = {
                            date: todayKey,
                            status: liveStatus,
                            totalAttended: todayAttendance.totalAttended,
                            totalClassTime: todayAttendance.totalClassTime,
                            lectures: todayAttendance.lectures
                        };
                    }
                }
                setAttendanceData(aMap);
                setAttendanceRecords(rMap);
                // Month stats computed in render from currentDate — see attendancePct below
            } else {
                setFetchError('No attendance records found.');
            }
        } catch (err) {
            setFetchError(`Failed to load attendance: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // student: fetch specific date details
    const fetchStudentDateDetails = async (date, specificStudent = null) => {
        const targetEnrollment = specificStudent ? specificStudent.enrollmentNo : studentId;
        if (!targetEnrollment) return;
        setLoadingStudents(true);
        try {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            // Fetch record + subject stats in parallel
            const [recordData, statsData] = await Promise.all([
                apiFetch(GET_STUDENT_ATTENDANCE_BY_DATE(targetEnrollment, dateStr)),
                apiFetch(GET_STUDENT_ATTENDANCE_SUBJECT_STATS(targetEnrollment))
            ]);

            if (recordData.success && recordData.record) {
                const holiday = holidays[date.toDateString()];
                if (specificStudent) {
                    setDrillStudent({ ...specificStudent, ...recordData.record, holiday });
                } else {
                    setSelectedDateDetails({ ...recordData.record, holiday });
                }
            }
            if (statsData.success) {
                setDrillSubjectStats(statsData.subjects || []);
            }
            setShowDetailsModal(true);
        } catch (err) {
            console.warn('fetchStudentDateDetails failed:', err.message);
            // Fallback to month-view record if fresh fetch fails
            const key = date.toDateString();
            const record = attendanceRecords[key];
            const holiday = holidays[key];
            if (specificStudent) {
                setDrillStudent({ ...specificStudent, ...(record || {}), holiday });
            } else if (record || holiday) {
                setSelectedDateDetails({ ...record, holiday });
            }
        } finally {
            setLoadingStudents(false);
        }
    };

    // ── date click handlers ───────────────────────────────────────────────────
    const showDateDetails = (date) => {
        if (!date) return;
        setSelectedDate(date);
        if (isTeacher) {
            if (filterMode === 'subject' && selectedSubject) {
                fetchStudentsForDateSubject(date);
            } else {
                fetchStudentsForDate(date);
            }
            setShowDetailsModal(true);
        } else {
            fetchStudentDateDetails(date);
            setShowDetailsModal(true);
        }
    };

    // teacher day-mode: fetch student list for a date
    const fetchStudentsForDate = async (date) => {
        if (!semester || !branch) return;
        setLoadingStudents(true);
        setStudentsOnDate([]); // optimistic clear
        try {
            // Use IST date parts to match how badges are indexed (consistency)
            // badge key logic in fetchTeacherMonthData uses (UTC + 5.5).toDateString()
            // We do the same here to ensure we are looking for the same logical day.
            const istDate = new Date(date.getTime());
            const y = istDate.getFullYear();
            const m = String(istDate.getMonth() + 1).padStart(2, '0');
            const d = String(istDate.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            // 1. Check cache first for instant loading
            if (studentsCache[dateStr]) {
                setStudentsOnDate(studentsCache[dateStr]);
                setVisibleStudentsCount(20);
                setCurrentPeriodIdx(0);
                setLoadingStudents(false);
                return;
            }

            const data = await apiFetch(
                GET_ATTENDANCE_BY_DATE(dateStr) + `?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`
            );
            // Pre-calculate present count to optimize render loop
            const processed = (data.students || []).map(s => ({
                ...s,
                presentCount: (s.lectures || []).filter(l => l.status === 'present').length
            }));
            setStudentsOnDate(processed);
            setStudentsCache(prev => ({ ...prev, [dateStr]: processed }));
            setVisibleStudentsCount(20); // reset pagination
            setAllPeriods([]);
            setCurrentPeriodIdx(0);
        } catch (err) {
            console.warn('fetchStudentsForDate failed:', err.message);
            setStudentsOnDate([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    // teacher subject-mode: fetch per-period student list for a date+subject
    const fetchStudentsForDateSubject = async (date) => {
        if (!semester || !branch || !selectedSubject) return;
        setLoadingStudents(true);
        setStudentsOnDate([]); // optimistic clear
        try {
            // Use local date parts to build YYYY-MM-DD — avoids UTC offset shifting the date
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            // 1. Check cache (note: subject mode uses a different cache key pattern if needed, 
            // but for simplicity we'll just check date+subject)
            const cacheKey = `${dateStr}_${selectedSubject}`;
            if (studentsCache[cacheKey]) {
                setStudentsOnDate(studentsCache[cacheKey]);
                setVisibleStudentsCount(20);
                setAllPeriods([]); // we'd need to cache periods too if we want full subject-mode cache
                setLoadingStudents(false);
                // For now, we'll only cache the list, but subject mode is less frequent
            }

            const data = await apiFetch(
                GET_ATTENDANCE_BY_DATE_SUBJECT(dateStr, selectedSubject) + `?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`
            );
            if (data.success) {
                // Pre-calculate present count to optimize render loop
                const processed = (data.students || []).map(s => ({
                    ...s,
                    presentCount: (s.lectures || []).filter(l => l.status === 'present').length
                }));
                setStudentsOnDate(processed);
                setVisibleStudentsCount(20); // reset pagination
                setAllPeriods(data.allPeriods || []);
                setCurrentPeriodIdx(0);
            } else {
                setStudentsOnDate([]);
                setAllPeriods([]);
            }
        } catch (err) {
            console.warn('fetchStudentsForDateSubject failed:', err.message);
            setStudentsOnDate([]);
            setAllPeriods([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    // ── calendar helpers ──────────────────────────────────────────────────────
    const getDaysInMonth = (date) => {
        const year  = date.getFullYear();
        const month = date.getMonth();
        const first = new Date(year, month, 1).getDay();
        const last  = new Date(year, month + 1, 0).getDate();
        const days  = [];
        for (let i = 0; i < first; i++) days.push(null);
        for (let d = 1; d <= last; d++) days.push(new Date(year, month, d));
        return days;
    };

    const changeMonth = (dir) => {
        const d = new Date(currentDate);
        d.setMonth(d.getMonth() + dir);
        setCurrentDate(d);
    };

    const isToday = (date) => {
        if (!date) return false;
        try { return date.toDateString() === getServerTime().nowDate().toDateString(); }
        catch { return date.toDateString() === new Date().toDateString(); }
    };

    // Is this date highlighted in the current filter mode?
    const isActiveDate = (date) => {
        if (!date) return false;
        if (!isTeacher) return !!attendanceData[date.toDateString()];
        if (filterMode === 'day') return !!attendanceData[date.toDateString()];
        // subject mode: dates from server are stored as IST midnight UTC strings e.g. "2026-05-05T18:30:00.000Z"
        // which equals IST date May 06. Convert both sides to IST YYYY-MM-DD for comparison.
        const toISTDateStr = (d) => {
            const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            return ist.toISOString().split('T')[0]; // "2026-05-06"
        };
        const cellDateStr = toISTDateStr(date);
        for (const iso of activeDates) {
            const isoDate = new Date(iso);
            if (toISTDateStr(isoDate) === cellDateStr) return true;
        }
        return false;
    };

    const getHoliday = (date) => date ? holidays[date.toDateString()] : null;

    const days = getDaysInMonth(currentDate);

    // Compute month stats for the currently viewed month from attendanceData
    const currentMonthStats = React.useMemo(() => {
        const yr = currentDate.getFullYear();
        const mo = currentDate.getMonth();
        let present = 0, absent = 0;
        Object.entries(attendanceData).forEach(([key, val]) => {
            const d = new Date(key);
            if (d.getFullYear() === yr && d.getMonth() === mo) {
                const status = typeof val === 'string' ? val : val?.status;
                // Only 'present' (threshold crossed) counts — 'active' is still in progress
                if (status === 'present') present++;
                else absent++;
            }
        });
        return { present, absent, total: present + absent };
    }, [attendanceData, currentDate]);

    // For teacher mode, monthStats is set directly from fetch; for student use computed
    const displayStats = isTeacher ? monthStats : currentMonthStats;
    const attendancePct = displayStats.total > 0
        ? ((displayStats.present / displayStats.total) * 100).toFixed(1) : 0;

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                if (isTeacher) {
                  filterMode === 'subject' ? fetchSubjectDates() : fetchTeacherMonthData(true);
                } else {
                  fetchMonthAttendance();
                }
              }}
              colors={[theme?.primary || '#00f5ff']}
              tintColor={theme?.primary || '#00f5ff'}
            />
          }
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <CalendarIcon size={28} color={theme.primary} />
                    <Text style={[styles.title, { color: theme.primary }]}>Attendance Calendar</Text>
                    <TouchableOpacity
                        onPress={() => {
                            if (isTeacher) {
                                if (filterMode === 'subject' && selectedSubject) {
                                    fetchSubjectDates();
                                } else {
                                    fetchTeacherMonthData();
                                }
                            } else {
                                fetchMonthAttendance();
                            }
                        }}
                        style={styles.refreshButton}
                    >
                        <RefreshIcon size={20} color={theme.primary} />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {isTeacher ? 'Class attendance overview' : 'Your attendance history'}
                </Text>
            </View>

            {/* ── Teacher filter bar ── */}
            {isTeacher && (
                <View style={[styles.filterBar, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                    {/* Semester chip */}
                    <View style={[styles.filterChip, { borderColor: theme.border }]}>
                        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Semester</Text>
                        <Text style={[styles.filterValue, { color: theme.text }]}>{semester || '—'}</Text>
                    </View>

                    {/* Branch chip */}
                    <View style={[styles.filterChip, { borderColor: theme.border }]}>
                        <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Branch</Text>
                        <Text style={[styles.filterValue, { color: theme.text }]}>{branch || '—'}</Text>
                    </View>

                    {/* Mode toggle: Day / Subject */}
                    <View style={styles.modeToggle}>
                        {['day', 'subject'].map(mode => (
                            <TouchableOpacity
                                key={mode}
                                style={[
                                    styles.modeBtn,
                                    filterMode === mode && { backgroundColor: theme.primary }
                                ]}
                                onPress={() => {
                                setFilterMode(mode);
                                // Reset subject selection when switching modes to avoid stale data
                                if (mode !== filterMode) setSelectedSubject('');
                            }}
                            >
                                <Text style={[
                                    styles.modeBtnText,
                                    { color: filterMode === mode ? '#000' : theme.textSecondary }
                                ]}>
                                    {mode === 'day' ? '📅 Day' : '📚 Subject'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Subject picker — only in subject mode */}
                    {filterMode === 'subject' && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                            {subjectList.length === 0 ? (
                                <Text style={[styles.filterLabel, { color: theme.textSecondary, padding: 8 }]}>
                                    Loading subjects…
                                </Text>
                            ) : subjectList.map(s => (
                                <TouchableOpacity
                                    key={s}
                                    style={[
                                        styles.subjectChip,
                                        { borderColor: theme.border },
                                        selectedSubject === s && { backgroundColor: theme.primary, borderColor: theme.primary }
                                    ]}
                                    onPress={() => setSelectedSubject(s)}
                                >
                                    <Text style={[
                                        styles.subjectChipText,
                                        { color: selectedSubject === s ? '#000' : theme.text }
                                    ]}>{s}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            )}

            {/* Month stats */}
            <View style={[styles.statsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#10b981' }]}>{displayStats.present}</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Present</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#ef4444' }]}>{displayStats.absent}</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Absent</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: theme.primary }]}>{attendancePct}%</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rate</Text>
                    </View>
                </View>
            </View>

            {/* Month navigation */}
            <View style={[styles.monthNav, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton}>
                    <ArrowLeftIcon size={24} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.monthText, { color: theme.text }]}>
                    {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton}>
                    <ArrowRightIcon size={24} color={theme.primary} />
                </TouchableOpacity>
            </View>

            {/* Calendar grid */}
            <View style={[styles.calendar, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <View style={styles.dayHeaders}>
                    {DAYS.map(d => (
                        <View key={d} style={styles.dayHeader}>
                            <Text style={[styles.dayHeaderText, { color: theme.textSecondary }]}>{d}</Text>
                        </View>
                    ))}
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={theme.primary} />
                    </View>
                ) : fetchError ? (
                    <View style={styles.loadingContainer}>
                        <Text style={{ color: '#ef4444', textAlign: 'center', fontSize: 13 }}>⚠️ {fetchError}</Text>
                        <TouchableOpacity
                            onPress={() => isTeacher ? (filterMode === 'subject' ? fetchSubjectDates() : fetchTeacherMonthData()) : fetchMonthAttendance()}
                            style={{ marginTop: 10, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,217,255,0.1)' }}>
                            <Text style={{ color: theme.primary, fontSize: 13 }}>🔄 Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : Object.keys(attendanceData).length === 0 && !isTeacher ? (
                    <View style={styles.loadingContainer}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>📅</Text>
                        <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 14 }}>
                            No attendance recorded yet.{'\n'}Your history will appear here once classes begin.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.daysGrid}>
                        {days.map((date, idx) => {
                            const rawVal = date ? attendanceData[date.toDateString()] : null;
                            // rawVal is a string for student ('present'/'absent'/'active')
                            // or an object for teacher ({ present:N, absent:N, total:N })
                            const rawStatus = typeof rawVal === 'string' ? rawVal : null;
                            const isPresent = rawStatus === 'present';
                            const isActive  = rawStatus === 'active';
                            const isAbsent  = rawStatus === 'absent';
                            // Teacher: cell is "active" (has data) if attendanceData has an entry for this date
                            const active    = isTeacher ? isActiveDate(date) : (date ? (isPresent || isActive || isAbsent) : false);
                            // Teacher: derive a display status from the aggregated counts
                            const teacherHasData = isTeacher && rawVal && typeof rawVal === 'object' && rawVal.total > 0;
                            const holiday = getHoliday(date);
                            const today   = isToday(date);
                            const stats   = isTeacher && filterMode === 'day'
                                ? (typeof rawVal === 'object' ? rawVal : null)
                                : null;

                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[
                                        styles.dayCell,
                                        !date && styles.emptyCell,
                                        today   && styles.todayCell,
                                        // Student: color by individual status
                                        !isTeacher && isPresent && !holiday && styles.presentCell,
                                        !isTeacher && isActive  && !holiday && styles.activeCell,
                                        !isTeacher && isAbsent  && !holiday && styles.absentCell,
                                        // Teacher: highlight any day that has attendance data
                                        isTeacher && teacherHasData && !holiday && styles.teacherDataCell,
                                        holiday && styles.holidayCell,
                                    ]}
                                    onPress={() => date && showDateDetails(date)}
                                    disabled={!date}
                                >
                                    {date && (
                                        <>
                                            <Text style={[
                                                styles.dayNumber, { color: theme.text },
                                                today   && styles.todayText,
                                                active  && styles.statusText,
                                                holiday && styles.holidayText,
                                            ]}>
                                                {date.getDate()}
                                            </Text>

                                            {/* Holiday badge */}
                                            {holiday && (
                                                <View style={[styles.holidayBadge, { backgroundColor: holiday.color }]}>
                                                    <Text style={styles.holidayEmoji}>
                                                        {holiday.type === 'holiday' ? '🏖️' : holiday.type === 'exam' ? '📝' : '🎉'}
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Teacher day-mode: total student count badge */}
                                            {isTeacher && filterMode === 'day' && stats && !holiday && (
                                                <View style={styles.teacherDateBadge}>
                                                    <Text style={[styles.teacherDateCount, { color: theme.primary }]}>
                                                        {stats.total}
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Teacher subject-mode: dot to show subject was held */}
                                            {isTeacher && filterMode === 'subject' && active && !holiday && (
                                                <View style={[styles.subjectDot, { backgroundColor: theme.primary }]} />
                                            )}

                                            {/* Student: present/absent/active icon */}
                                            {!isTeacher && (isPresent || isActive || isAbsent) && !holiday && (
                                                <View style={styles.statusIcon}>
                                                    {isPresent
                                                        ? <CheckIcon size={10} color="#10b981" />
                                                        : isActive
                                                        ? <XIcon    size={10} color="#f59e0b" />
                                                        : <XIcon    size={10} color="#ef4444" />}
                                                </View>
                                            )}
                                        </>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>

            {/* Legend */}
            <View style={[styles.legend, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <Text style={[styles.legendTitle, { color: theme.text }]}>Legend</Text>
                <View style={styles.legendItems}>
                    {isTeacher ? (
                        filterMode === 'day' ? (
                            <>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: 'rgba(16,185,129,0.15)' }]} />
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>Has data</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>Badge = total students</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>{selectedSubject || 'Subject'} held</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>Tap date → per-period list</Text>
                                </View>
                            </>
                        )
                    ) : (
                        <>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Present</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Absent</Text>
                            </View>
                        </>
                    )}
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: 'rgba(0,217,255,0.1)' }]} />
                        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Today</Text>
                    </View>
                </View>
            </View>

            {/* ── Details Modal ── */}
            <Modal
                visible={showDetailsModal}
                transparent
                animationType="slide"
                onRequestClose={() => { setShowDetailsModal(false); setDrillStudent(null); }}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
                        {/* Modal header */}
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>
                                {selectedDate.toDateString()}
                                {isTeacher && filterMode === 'subject' && selectedSubject
                                    ? ` — ${selectedSubject}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => { setShowDetailsModal(false); setDrillStudent(null); }}>
                                <XIcon size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* ── Teacher view ── */}
                        {isTeacher ? (
                            <View style={{ flex: 1, minHeight: 400 }}>
                            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                                {loadingStudents ? (
                                    /* ── Skeleton placeholder while data loads ── */
                                    <View>
                                        {/* Summary skeleton */}
                                        <View style={[styles.summaryCard, { backgroundColor: theme.background }]}>
                                            <View style={[styles.skeletonLine, { width: 80, height: 14, marginBottom: 12, backgroundColor: theme.border }]} />
                                            <View style={styles.summaryRow}>
                                                {[0,1,2].map(i => (
                                                    <View key={i} style={styles.summaryItem}>
                                                        <View style={[styles.skeletonLine, { width: 36, height: 28, borderRadius: 6, backgroundColor: theme.border }]} />
                                                        <View style={[styles.skeletonLine, { width: 48, height: 11, marginTop: 6, backgroundColor: theme.border }]} />
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                        {/* Student card skeletons */}
                                        {[0,1,2,3,4].map(i => (
                                            <View key={i} style={[styles.skeletonCard, {
                                                backgroundColor: theme.cardBackground,
                                                borderColor: theme.border,
                                                opacity: 1 - i * 0.15
                                            }]}>
                                                {/* Avatar */}
                                                <View style={[styles.skeletonAvatar, { backgroundColor: theme.border }]} />
                                                {/* Name + enrollment */}
                                                <View style={{ flex: 1, gap: 8 }}>
                                                    <View style={[styles.skeletonLine, { width: '55%', height: 14, backgroundColor: theme.border }]} />
                                                    <View style={[styles.skeletonLine, { width: '35%', height: 11, backgroundColor: theme.border }]} />
                                                </View>
                                                {/* Status badge */}
                                                <View style={[styles.skeletonBadge, { backgroundColor: theme.border }]} />
                                            </View>
                                        ))}
                                    </View>
                                ) : studentsOnDate.length === 0 ? (
                                    <View style={styles.noDataContainer}>
                                        <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                                            No attendance records for this date.
                                        </Text>
                                    </View>
                                ) : (
                                    <>
                                        {/* Summary */}
                                        <View style={[styles.summaryCard, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.summaryTitle, { color: theme.text }]}>📊 Summary</Text>
                                            <View style={styles.summaryRow}>
                                                {[
                                                    { label: 'Present', color: '#10b981', value: modalSummary.present },
                                                    { label: 'Absent',  color: '#ef4444', value: modalSummary.absent },
                                                    { label: 'Total',   color: theme.primary, value: modalSummary.total },
                                                ].map(item => (
                                                    <View key={item.label} style={styles.summaryItem}>
                                                        <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                                                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>

                                        {/* ── Chevron period navigator (subject mode only) ── */}
                                        {filterMode === 'subject' && allPeriods.length > 1 && (
                                            <View style={[styles.periodNav, { borderColor: theme.border }]}>
                                                <TouchableOpacity
                                                    style={[styles.chevronBtn,
                                                        currentPeriodIdx === 0 && styles.chevronDisabled]}
                                                    onPress={() => setCurrentPeriodIdx(i => Math.max(0, i - 1))}
                                                    disabled={currentPeriodIdx === 0}
                                                >
                                                    <ChevronLeft color={currentPeriodIdx === 0 ? '#555' : theme.primary} size={22} />
                                                </TouchableOpacity>

                                                <Text style={[styles.periodNavText, { color: theme.text }]}>
                                                    {allPeriods[currentPeriodIdx]}
                                                    {'  '}
                                                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                                        ({currentPeriodIdx + 1} of {allPeriods.length})
                                                    </Text>
                                                </Text>

                                                <TouchableOpacity
                                                    style={[styles.chevronBtn,
                                                        currentPeriodIdx === allPeriods.length - 1 && styles.chevronDisabled]}
                                                    onPress={() => setCurrentPeriodIdx(i => Math.min(allPeriods.length - 1, i + 1))}
                                                    disabled={currentPeriodIdx === allPeriods.length - 1}
                                                >
                                                    <ChevronRight color={currentPeriodIdx === allPeriods.length - 1 ? '#555' : theme.primary} size={22} />
                                                </TouchableOpacity>
                                            </View>
                                        )}

                        {/* Student list */}
                                        <Text style={[styles.studentsTitle, { color: theme.text }]}>
                                            Students ({studentsOnDate.length})
                                        </Text>
                                        {studentsOnDate.slice(0, visibleStudentsCount).map((student, i) => {
                                            const periodRecord = filterMode === 'subject' && allPeriods.length > 0
                                                ? student.periods?.[currentPeriodIdx]
                                                : null;
                                            const status    = periodRecord ? periodRecord.status : student.status;
                                            const isPresent = status === 'present';
                                            const initials  = (student.name || student.studentName || '?')[0].toUpperCase();
                                            const lecs      = student.lectures || [];
                                            const lPresent  = student.presentCount || 0;

                                            return (
                                                <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => {
                                                    fetchStudentDateDetails(selectedDate, student);
                                                }}>
                                                    <View style={[styles.studentCard, {
                                                        backgroundColor: isPresent ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                                                        borderLeftColor: isPresent ? '#10b981' : '#ef4444',
                                                        borderColor: isPresent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                                                        borderWidth: 1
                                                    }]}>
                                                        <View style={[styles.scAvatar, {
                                                            backgroundColor: isPresent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'
                                                        }]}>
                                                            <Text style={{ color: isPresent ? '#10b981' : '#ef4444', fontWeight: '700', fontSize: 15 }}>{initials}</Text>
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.studentName, { color: theme.text }]}>
                                                                {student.name || student.studentName || 'Unknown'}
                                                            </Text>
                                                            <Text style={[styles.studentId, { color: theme.textSecondary }]}>
                                                                {student.enrollmentNo || '—'}
                                                                {lecs.length > 0 ? `  ·  ${lPresent}/${lecs.length} lectures` : ''}
                                                            </Text>
                                                        </View>
                                                        <View style={[styles.scBadge, {
                                                            backgroundColor: isPresent ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
                                                        }]}>
                                                            <Text style={{ color: isPresent ? '#10b981' : '#ef4444', fontWeight: '700', fontSize: 13 }}>
                                                                {isPresent ? '✓' : '✗'}
                                                            </Text>
                                                        </View>
                                                        <Text style={{ color: theme.textSecondary, fontSize: 16, marginLeft: 4 }}>›</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}

                                        {studentsOnDate.length > visibleStudentsCount && (
                                            <TouchableOpacity 
                                                style={[styles.loadMoreBtn, { borderColor: theme.border, backgroundColor: theme.background + '50' }]}
                                                onPress={() => setVisibleStudentsCount(prev => prev + 30)}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={[styles.loadMoreText, { color: theme.primary }]}>
                                                    Load More ({studentsOnDate.length - visibleStudentsCount} remaining)
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </>
                                )}
                            </ScrollView>

                            {/* ── Drill-down: student lecture detail ── */}
                            {drillStudent && (
                                <View style={[StyleSheet.absoluteFillObject,
                                    { backgroundColor: theme.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20 }]}>
                                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setDrillStudent(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ color: theme.primary, fontSize: 18 }}>‹</Text>
                                            <Text style={{ color: theme.primary, fontSize: 14 }}>Back</Text>
                                        </TouchableOpacity>
                                        <View style={{ flex: 1, marginHorizontal: 8 }}>
                                            <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                                                {drillStudent.name || 'Unknown'}
                                            </Text>
                                            <Text style={[styles.studentId, { color: theme.textSecondary }]}>
                                                {drillStudent.enrollmentNo || ''}
                                            </Text>
                                        </View>
                                        <TouchableOpacity onPress={() => { setDrillStudent(null); setShowDetailsModal(false); }}>
                                            <XIcon size={22} color={theme.text} />
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView style={styles.modalBody}>
                                        {/* Stats row */}
                                        {(() => {
                                            const lecs   = drillStudent.lectures || [];
                                            const pLec   = lecs.filter(l => l.status === 'present').length;
                                            const pct    = lecs.length > 0 ? Math.round((pLec / lecs.length) * 100) : (drillStudent.status === 'present' ? 100 : 0);
                                            const color  = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                                            return (
                                                <View style={[styles.summaryCard, { backgroundColor: theme.background, marginBottom: 16 }]}>
                                                    <View style={styles.summaryRow}>
                                                        {[
                                                            { label: 'Present', color: '#10b981', value: pLec },
                                                            { label: 'Absent',  color: '#ef4444', value: lecs.length - pLec },
                                                            { label: 'Rate',    color,            value: `${pct}%` },
                                                        ].map(item => (
                                                            <View key={item.label} style={styles.summaryItem}>
                                                                <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                                                                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                </View>
                                            );
                                        })()}

                                        {/* Lecture timeline */}
                                        {(drillStudent.lectures || []).length === 0 ? (
                                            <View style={{ alignItems: 'center', padding: 30 }}>
                                                <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
                                                <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>No lecture data for this day</Text>
                                            </View>
                                        ) : (drillStudent.lectures || []).map((l, i) => {
                                            const isP = l.status === 'present';
                                            const isActive = l.status === 'active';
                                            return (
                                                <View key={i} style={[styles.ltRow, {
                                                    borderBottomColor: theme.border,
                                                    borderBottomWidth: i < drillStudent.lectures.length - 1 ? 1 : 0
                                                }]}>
                                                    <View style={[styles.ltDot, { backgroundColor: isP ? '#10b981' : isActive ? '#f59e0b' : '#ef4444' }]} />
                                                    <View style={[styles.ltPeriodBadge, { backgroundColor: 'rgba(0,217,255,0.1)' }]}>
                                                        <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>{l.period || '—'}</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{l.subject || 'Unknown'}</Text>
                                                        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                                                            {[l.teacher && `👨‍🏫 ${l.teacher}`, l.room && `📍 ${l.room}`, l.verificationType && `🔐 ${l.verificationType}`].filter(Boolean).join('  ')}
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                                                        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                                                           {Math.floor(((l.attended || 0) + (isActive ? modalTimerOffset : 0)) / 60)}m / {Math.floor((l.total || 0) / 60)}m
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.ltStatus, {
                                                        backgroundColor: isP ? 'rgba(16,185,129,0.15)' : isActive ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'
                                                    }]}>
                                                        <Text style={{ color: isP ? '#10b981' : isActive ? '#f59e0b' : '#ef4444', fontWeight: '700', fontSize: 12 }}>
                                                            {isP ? '✓' : isActive ? '⌛' : '✗'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        })}

                                        {/* Period bubbles row */}
                                        {(() => {
                                            const maxPeriod = Math.max(8, ...(drillStudent.lectures || []).map(l => parseInt((l.period || 'P0').replace('P','')) || 0));
                                            const slots = Array.from({ length: maxPeriod }, (_, i) => {
                                                const pid = `P${i + 1}`;
                                                const lec = (drillStudent.lectures || []).find(l => l.period === pid);
                                                return { pid, lec };
                                            });
                                            return (
                                                <View style={{ marginTop: 16 }}>
                                                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 10 }}>Periods</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                        <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 4 }}>
                                                            {slots.map(({ pid, lec }) => {
                                                                if (!lec) {
                                                                    return (
                                                                        <View key={pid} style={[styles.bubbleWrap, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                                                                            <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '700' }}>{pid}</Text>
                                                                        </View>
                                                                    );
                                                                }
                                                                const isP   = lec.status === 'present';
                                                                const isActive = lec.status === 'active';
                                                                const color = isP ? '#10b981' : isActive ? '#f59e0b' : '#ef4444';
                                                                const shortName = (lec.subject || '').length > 5 ? (lec.subject || '').substring(0, 4) + '…' : (lec.subject || pid);
                                                                
                                                                const totalSecs = (lec.attended || 0) + (isActive ? modalTimerOffset : 0);
                                                                const displayMin = Math.floor(totalSecs / 60);

                                                                return (
                                                                    <View key={pid} style={[styles.bubbleWrap, { borderColor: color }]}>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{shortName}</Text>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '600' }}>{pid}</Text>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '700' }}>{displayMin}m</Text>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    </ScrollView>
                                                </View>
                                            );
                                        })()}
                                    </ScrollView>
                                </View>
                            )}
                            </View>
                        ) : (
                            /* ── Student view ── */
                            <ScrollView style={styles.modalBody}>
                                {selectedDateDetails?.holiday && (
                                    <View style={[styles.holidayInfo,
                                        { borderColor: selectedDateDetails.holiday.color,
                                          backgroundColor: selectedDateDetails.holiday.color + '22' }]}>
                                        <Text style={styles.holidayInfoEmoji}>
                                            {selectedDateDetails.holiday.type === 'holiday' ? '🏖️'
                                                : selectedDateDetails.holiday.type === 'exam' ? '📝' : '🎉'}
                                        </Text>
                                        <Text style={[styles.holidayInfoName, { color: theme.text }]}>
                                            {selectedDateDetails.holiday.name}
                                        </Text>
                                        <Text style={[styles.holidayInfoDesc, { color: theme.textSecondary }]}>
                                            {selectedDateDetails.holiday.description}
                                        </Text>
                                    </View>
                                )}
                                {selectedDateDetails?.status && (
                                    <>
                                        <View style={[styles.overallStatus,
                                            { backgroundColor: selectedDateDetails.status === 'present'
                                                ? 'rgba(16,185,129,0.15)' : (selectedDateDetails.status === 'active' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)') }]}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                                                <Text style={[styles.overallStatusText,
                                                    { color: selectedDateDetails.status === 'present' ? '#10b981' : (selectedDateDetails.status === 'active' ? '#f59e0b' : '#ef4444') }]}>
                                                    {selectedDateDetails.status === 'present' ? '✅ Present' 
                                                        : (selectedDateDetails.status === 'active' ? '⏳ Active' : '❌ Absent')}
                                                </Text>
                                                {selectedDateDetails.status === 'active' && (
                                                    <View style={styles.liveBadge}>
                                                        <View style={styles.liveDot} />
                                                        <Text style={styles.liveText}>LIVE SYNC</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {selectedDateDetails.totalClassTime > 0 && (
                                                <Text style={[styles.overallTime, { color: theme.textSecondary }]}>
                                                    {Math.floor(((selectedDateDetails.totalAttended || 0) * 60 + (selectedDateDetails.status === 'active' ? modalTimerOffset : 0)) / 60)} min / {selectedDateDetails.totalClassTime} min
                                                </Text>
                                            )}
                                            {selectedDateDetails.status === 'active' && (
                                                <Text style={styles.syncedByStudent}>
                                                    ⚡ Synced by student timer
                                                </Text>
                                            )}
                                        </View>
                                        
                                        {/* Period bubbles for student */}
                                        {(() => {
                                            const lecs = selectedDateDetails.lectures || [];
                                            const maxPeriod = Math.max(8, ...lecs.map(l => parseInt((l.period || 'P0').replace('P','')) || 0));
                                            const slots = Array.from({ length: maxPeriod }, (_, i) => {
                                                const pid = `P${i + 1}`;
                                                const lec = lecs.find(l => l.period === pid);
                                                return { pid, lec };
                                            });
                                            return (
                                                <View style={{ marginBottom: 20 }}>
                                                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 10 }}>Periods</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                        <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 4 }}>
                                                            {slots.map(({ pid, lec }) => {
                                                                if (!lec) {
                                                                    return (
                                                                        <View key={pid} style={[styles.bubbleWrap, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                                                                            <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '700' }}>{pid}</Text>
                                                                        </View>
                                                                    );
                                                                }
                                                                const isP = lec.status === 'present';
                                                                const isActive = lec.status === 'active';
                                                                const color = isP ? '#10b981' : isActive ? '#f59e0b' : '#ef4444';
                                                                const shortName = (lec.subject || '').length > 5 ? (lec.subject || '').substring(0, 4) + '…' : (lec.subject || pid);
                                                                
                                                                const totalSecs = (lec.attended || 0) + (isActive ? modalTimerOffset : 0);
                                                                const displayMin = Math.floor(totalSecs / 60);

                                                                return (
                                                                    <View key={pid} style={[styles.bubbleWrap, { borderColor: color }]}>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{shortName}</Text>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '600' }}>{pid}</Text>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '700' }}>{displayMin}m</Text>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    </ScrollView>
                                                </View>
                                            );
                                        })()}

                                        {selectedDateDetails.lectures?.length > 0 && (
                                            <>
                                                <Text style={[styles.lecturesTitle, { color: theme.text }]}>Lectures</Text>
                                                {selectedDateDetails.lectures.map((lec, i) => (
                                                    <View key={i} style={[styles.lectureCard,
                                                        { backgroundColor: theme.background,
                                                          borderLeftColor: lec.present ? '#10b981' : (lec.status === 'active' ? '#f59e0b' : '#ef4444') }]}>
                                                        <View style={styles.lectureHeader}>
                                                            <Text style={[styles.lectureSubject, { color: theme.text }]}>
                                                                {lec.subject || 'Class'}
                                                            </Text>
                                                            <View style={{ alignItems: 'flex-end' }}>
                                                                <Text style={[styles.lectureStatus,
                                                                    { color: lec.present ? '#10b981' : (lec.status === 'active' ? '#f59e0b' : '#ef4444') }]}>
                                                                    {lec.present ? '✓ Present' : (lec.status === 'active' ? '⌛ Active' : '✗ Absent')}
                                                                </Text>
                                                                {(lec.total > 0 || (lec.attended || 0) > 0) && (
                                                                    <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 2 }}>
                                                                        {Math.floor(((lec.attended || 0) + (lec.status === 'active' ? modalTimerOffset : 0)) / 60)}m / {Math.floor((lec.total || 0) / 60)}m
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </View>
                                                        {lec.room && (
                                                            <Text style={[styles.lectureRoom, { color: theme.textSecondary }]}>
                                                                📍 {lec.room}
                                                            </Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </>
                                        )}
                                    </>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container:       { flex: 1 },
    header:          { padding: 20, paddingTop: 60 },
    titleRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
    refreshButton:   { padding: 8 },
    title:           { fontSize: 28, fontWeight: 'bold' },
    subtitle:        { fontSize: 14 },

    // ── filter bar ────────────────────────────────────────────────────────────
    filterBar: {
        marginHorizontal: 20, marginBottom: 12,
        padding: 14, borderRadius: 14, borderWidth: 1, gap: 10,
    },
    filterChip: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 6, paddingHorizontal: 10,
        borderRadius: 8, borderWidth: 1,
    },
    filterLabel:  { fontSize: 11 },
    filterValue:  { fontSize: 13, fontWeight: '600' },
    modeToggle:   { flexDirection: 'row', gap: 8 },
    modeBtn: {
        flex: 1, paddingVertical: 8, borderRadius: 8,
        alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.15)',
    },
    modeBtnText:  { fontSize: 13, fontWeight: '600' },
    subjectScroll:{ marginTop: 4 },
    subjectChip: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 20, borderWidth: 1, marginRight: 8,
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    subjectChipText: { fontSize: 13, fontWeight: '500' },

    // ── stats ─────────────────────────────────────────────────────────────────
    statsCard: { margin: 20, marginTop: 10, padding: 20, borderRadius: 16, borderWidth: 1 },
    statsRow:  { flexDirection: 'row', justifyContent: 'space-around' },
    statItem:  { alignItems: 'center' },
    statValue: { fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
    statLabel: { fontSize: 12 },

    // ── month nav ─────────────────────────────────────────────────────────────
    monthNav: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginHorizontal: 20, padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16,
    },
    navButton:  { padding: 8 },
    monthText:  { fontSize: 18, fontWeight: 'bold' },

    // ── calendar grid ─────────────────────────────────────────────────────────
    calendar:       { margin: 20, marginTop: 0, borderRadius: 16, borderWidth: 1, padding: 16 },
    dayHeaders:     { flexDirection: 'row', marginBottom: 12 },
    dayHeader:      { flex: 1, alignItems: 'center' },
    dayHeaderText:  { fontSize: 12, fontWeight: 'bold' },
    daysGrid:       { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: {
        width: '14.28%', aspectRatio: 1,
        justifyContent: 'center', alignItems: 'center',
        borderRadius: 8, marginBottom: 4,
    },
    emptyCell:      { backgroundColor: 'transparent' },
    todayCell:      { backgroundColor: 'rgba(0,217,255,0.1)' },
    presentCell:    { backgroundColor: 'rgba(16,185,129,0.15)' },
    activeCell:     { backgroundColor: 'rgba(245,158,11,0.15)' },  // orange — timer running, below threshold
    absentCell:     { backgroundColor: 'rgba(239,68,68,0.10)' },   // red — class day but student was absent
    teacherDataCell:{ backgroundColor: 'rgba(0,217,255,0.08)', borderColor: 'rgba(0,217,255,0.25)', borderWidth: 1 }, // teacher: day has attendance data
    holidayCell:    { backgroundColor: 'rgba(255,107,107,0.1)', borderColor: '#ff6b6b', borderWidth: 1 },
    dayNumber:      { fontSize: 14, fontWeight: '500' },
    todayText:      { fontWeight: 'bold' },
    statusText:     { fontWeight: 'bold' },
    holidayText:    { color: '#ff6b6b', fontWeight: 'bold' },
    holidayBadge: {
        position: 'absolute', top: 2, right: 2,
        width: 16, height: 16, borderRadius: 8,
        justifyContent: 'center', alignItems: 'center',
    },
    holidayEmoji:   { fontSize: 8 },
    statusIcon:     { position: 'absolute', bottom: 4 },
    teacherDateBadge: {
        position: 'absolute', bottom: 2, right: 2,
        backgroundColor: 'rgba(0,217,255,0.2)', borderRadius: 8,
        paddingHorizontal: 4, paddingVertical: 2, minWidth: 16, alignItems: 'center',
    },
    teacherDateCount: { fontSize: 8, fontWeight: 'bold' },
    subjectDot: {
        position: 'absolute', bottom: 4,
        width: 6, height: 6, borderRadius: 3,
    },

    // ── legend ────────────────────────────────────────────────────────────────
    legend: { margin: 20, marginTop: 0, padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 100 },
    legendTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
    legendItems: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 },
    legendItem:  { flexDirection: 'row', alignItems: 'center' },
    legendDot:   { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
    legendText:  { fontSize: 12 },

    // ── loading / empty ───────────────────────────────────────────────────────
    loadingContainer: { padding: 40, alignItems: 'center' },
    loadingText:      { marginTop: 12, fontSize: 14 },
    noDataContainer:  { padding: 40, alignItems: 'center', justifyContent: 'center' },
    noDataText:       { fontSize: 14, textAlign: 'center', marginBottom: 8 },

    // ── skeleton placeholders ─────────────────────────────────────────────────
    skeletonLine:   { borderRadius: 4, marginBottom: 2 },
    skeletonCard:   {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, marginBottom: 10, borderRadius: 10, borderWidth: 1,
    },
    skeletonAvatar: { width: 40, height: 40, borderRadius: 20 },
    skeletonBadge:  { width: 28, height: 28, borderRadius: 14 },

    // ── modal ─────────────────────────────────────────────────────────────────
    modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent:  { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', flex: 1 },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    },
    modalTitle:   { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 12 },
    modalBody:    { padding: 20 },

    // ── period chevron nav ────────────────────────────────────────────────────
    periodNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 10, paddingHorizontal: 16,
        borderRadius: 12, borderWidth: 1, marginBottom: 16,
    },
    chevronBtn:     { padding: 8 },
    chevronDisabled:{ opacity: 0.3 },
    periodNavText:  { fontSize: 16, fontWeight: 'bold' },

    // ── summary ───────────────────────────────────────────────────────────────
    summaryCard:   { padding: 16, borderRadius: 12, marginBottom: 16 },
    summaryTitle:  { fontSize: 14, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
    summaryRow:    { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem:   { alignItems: 'center' },
    summaryValue:  { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
    summaryLabel:  { fontSize: 11 },

    // ── student cards ─────────────────────────────────────────────────────────
    studentsTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
    studentCard:   { padding: 12, borderRadius: 10, marginBottom: 8, borderLeftWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 10 },
    studentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    studentName:   { fontSize: 14, fontWeight: '600' },
    studentId:     { fontSize: 11, marginTop: 2 },
    statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusBadgeText: { fontSize: 11, fontWeight: 'bold' },

    // ── avatar card ───────────────────────────────────────────────────────────
    scAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    scBadge:  { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

    // ── lecture timeline ──────────────────────────────────────────────────────
    ltRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    ltDot:         { width: 10, height: 10, borderRadius: 5 },
    ltPeriodBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, minWidth: 28, alignItems: 'center' },
    ltStatus:      { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },

    // ── subject bubbles ───────────────────────────────────────────────────────
    bubbleWrap: {
        width: 60, height: 60, borderRadius: 30,
        borderWidth: 2, justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },

    // ── student detail (own attendance) ──────────────────────────────────────
    overallStatus:     { padding: 16, borderRadius: 12, marginBottom: 16 },
    overallStatusText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    overallTime:       { fontSize: 12, textAlign: 'center', marginTop: 4 },
    syncedByStudent:   { fontSize: 10, textAlign: 'center', marginTop: 4, color: '#f59e0b', fontStyle: 'italic', opacity: 0.8 },
    liveBadge: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.2)',
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
    liveText: { fontSize: 8, fontWeight: 'bold', color: '#f59e0b' },
    lecturesTitle:     { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
    lectureCard:       { padding: 12, borderRadius: 8, marginBottom: 10, borderLeftWidth: 3 },
    lectureHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    lectureSubject:    { fontSize: 14, fontWeight: '600' },
    lectureStatus:     { fontSize: 12, fontWeight: 'bold' },
    lectureRoom:       { fontSize: 10, marginTop: 2 },
    holidayInfo: {
        padding: 16, borderRadius: 12, marginBottom: 16,
        alignItems: 'center', borderWidth: 2,
    },
    holidayInfoEmoji: { fontSize: 40, marginBottom: 8 },
    holidayInfoName:  { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    holidayInfoDesc:  { fontSize: 13, textAlign: 'center' },

    loadMoreBtn: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    loadMoreText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
});
