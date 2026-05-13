import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal,
    Platform, Dimensions, TextInput, RefreshControl,
} from 'react-native';
import { CalendarIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon, RefreshIcon } from './Icons';
import { getServerTime } from './ServerTime';

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
    // subject mode: per-period navigation
    const [allPeriods,        setAllPeriods]         = useState([]);   // ['P1','P3',…]
    const [currentPeriodIdx,  setCurrentPeriodIdx]   = useState(0);
    // student drill-down
    const [drillStudent,      setDrillStudent]       = useState(null); // student object with lectures
    const [drillSubjectStats, setDrillSubjectStats]  = useState([]);   // per-subject bubbles
    // modal filter/search/pagination
    const [modalFilter,       setModalFilter]        = useState('all'); // 'all' | 'present' | 'absent'
    const [modalSearch,       setModalSearch]        = useState('');
    const [modalPage,         setModalPage]          = useState(1);
    const MODAL_PAGE_SIZE = 25;

    // Reset page to 1 whenever filter or search changes
    useEffect(() => { setModalPage(1); }, [modalFilter, modalSearch]);

    // ── effects ───────────────────────────────────────────────────────────────
    // ── shared fetch helper with timeout ─────────────────────────────────────
    const [fetchError, setFetchError] = useState(null);

    const apiFetch = async (url, timeoutMs = 10000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            return await res.json();
        } catch (err) {
            clearTimeout(timer);
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
            const data  = await apiFetch(`${socketUrl}/api/holidays/range?startDate=${start}&endDate=${end}`);
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
    const fetchTeacherMonthData = async (forceRefresh = false) => {
        if (!semester || !branch) {
            setFetchError('Select a semester and branch to view attendance.');
            setLoading(false);
            return;
        }
        const year  = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const cacheKey = `${semester}||${branch}||${year}||${month}`;

        if (!forceRefresh) {
            const cached = cacheGet(monthDataCacheRef, cacheKey);
            if (cached) {
                setAttendanceData(cached.dateMap);
                setMonthStats(cached.stats);
                return;
            }
        }

        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch(
                `${socketUrl}/api/attendance/records?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}&year=${year}&month=${month}`
            );
            if (data.success && data.records) {
                const dateMap = {};
                let mp = 0, ma = 0;
                data.records.forEach(r => {
                    const d   = new Date(new Date(r.date).getTime() + 5.5 * 60 * 60 * 1000);
                    const key = d.toDateString();
                    if (!dateMap[key]) dateMap[key] = { present: 0, absent: 0, total: 0 };
                    if (r.status === 'present') { dateMap[key].present++; mp++; }
                    else                        { dateMap[key].absent++;  ma++; }
                    dateMap[key].total++;
                });
                const stats = { present: mp, absent: ma, total: mp + ma };
                cacheSet(monthDataCacheRef, cacheKey, { dateMap, stats });
                setAttendanceData(dateMap);
                setMonthStats(stats);
            } else {
                setFetchError(null);
                setAttendanceData({});
                setMonthStats({ present: 0, absent: 0, total: 0 });
            }
        } catch (err) {
            setFetchError(`Failed to load attendance: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── teacher: subject list — cached, only fetches once per semester/branch ──
    const subjectListCacheRef = React.useRef({});

    // ── smart cache refs (TTL = 5 min) ───────────────────────────────────────
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const monthDataCacheRef    = React.useRef({}); // key: "sem||branch||year||month" → {data, ts}
    const subjectDatesCacheRef = React.useRef({}); // key: "sem||branch||subject||year||month" → {data, ts}
    const dateTapCacheRef      = React.useRef({}); // key: "sem||branch||date" → {students, allPeriods, ts}
    const dateTapSubjCacheRef  = React.useRef({}); // key: "sem||branch||date||subject" → {students, allPeriods, ts}

    const cacheGet = (ref, key) => {
        const entry = ref.current[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL_MS) { delete ref.current[key]; return null; }
        return entry.data;
    };
    const cacheSet = (ref, key, data) => { ref.current[key] = { data, ts: Date.now() }; };
    const cacheClear = (ref, keyPrefix) => {
        Object.keys(ref.current).forEach(k => { if (k.startsWith(keyPrefix)) delete ref.current[k]; });
    };
    const fetchSubjectList = async () => {
        const cacheKey = `${semester}||${branch}`;
        if (subjectListCacheRef.current[cacheKey]) {
            setSubjectList(subjectListCacheRef.current[cacheKey]);
            setSelectedSubject(prev => prev || subjectListCacheRef.current[cacheKey][0] || '');
            return;
        }
        try {
            const data = await apiFetch(`${socketUrl}/api/attendance/subjects?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`);
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
    const fetchSubjectDates = async (forceRefresh = false) => {
        if (!selectedSubject) return;
        const year  = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const cacheKey = `${semester}||${branch}||${selectedSubject}||${year}||${month}`;

        if (!forceRefresh) {
            const cached = cacheGet(subjectDatesCacheRef, cacheKey);
            if (cached) {
                setActiveDates(new Set(cached));
                return;
            }
        }

        setLoading(true);
        setFetchError(null);
        try {
            const data = await apiFetch(
                `${socketUrl}/api/attendance/subject-dates?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}&subject=${encodeURIComponent(selectedSubject)}`
            );
            if (data.success) {
                cacheSet(subjectDatesCacheRef, cacheKey, data.dates);
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
            const month = currentDate.getMonth() + 1; // 1-based
            const data = await apiFetch(
                `${socketUrl}/api/attendance/records?studentId=${encodeURIComponent(studentId)}&year=${year}&month=${month}`
            );
            if (data.success && data.records) {
                const aMap = {}, rMap = {};
                data.records.forEach(r => {
                    // Convert to IST date string to match calendar cell keys (device is IST)
                    const d   = new Date(new Date(r.date).getTime() + 5.5 * 60 * 60 * 1000);
                    const key = d.toDateString();
                    r.totalAttended  = Number(r.totalAttended)  || 0;
                    r.totalClassTime = Number(r.totalClassTime) || 0;
                    r.dayPercentage  = Number(r.dayPercentage)  || 0;
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

    // ── date click handlers ───────────────────────────────────────────────────
    const showDateDetails = (date) => {
        if (!date) return;
        setSelectedDate(date);
        if (isTeacher) {
            // Reset stale state before opening so the skeleton always shows first
            setStudentsOnDate([]);
            setAllPeriods([]);
            setCurrentPeriodIdx(0);
            setDrillStudent(null);
            setModalFilter('all');
            setModalSearch('');
            setModalPage(1);
            setLoadingStudents(true);   // set true BEFORE opening modal — no blank flash
            setShowDetailsModal(true);
            if (filterMode === 'subject' && selectedSubject) {
                fetchStudentsForDateSubject(date);
            } else if (filterMode === 'day') {
                fetchStudentsForDate(date);
            } else {
                // subject mode but no subject selected yet — show empty gracefully
                setLoadingStudents(false);
            }
        } else {
            const key     = date.toDateString();
            const record  = attendanceRecords[key];
            const holiday = holidays[key];
            if (record || holiday) {
                setSelectedDateDetails({ ...record, holiday });
                setShowDetailsModal(true);
            }
        }
    };

    // teacher day-mode: fetch student list for a date
    const fetchStudentsForDate = async (date) => {
        if (!semester || !branch) {
            setLoadingStudents(false);
            return;
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const cacheKey = `${semester}||${branch}||${dateStr}`;

        const cached = cacheGet(dateTapCacheRef, cacheKey);
        if (cached) {
            setStudentsOnDate(cached.students);
            setAllPeriods([]);
            setCurrentPeriodIdx(0);
            setLoadingStudents(false);
            return;
        }

        try {
            const data = await apiFetch(
                `${socketUrl}/api/attendance/date/${dateStr}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`
            );
            const students = data.success ? (data.students || []) : [];
            cacheSet(dateTapCacheRef, cacheKey, { students });
            setStudentsOnDate(students);
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
        if (!semester || !branch || !selectedSubject) {
            setLoadingStudents(false);
            return;
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const cacheKey = `${semester}||${branch}||${dateStr}||${selectedSubject}`;

        const cached = cacheGet(dateTapSubjCacheRef, cacheKey);
        if (cached) {
            setStudentsOnDate(cached.students);
            setAllPeriods(cached.allPeriods);
            setCurrentPeriodIdx(0);
            setLoadingStudents(false);
            return;
        }

        try {
            const data = await apiFetch(
                `${socketUrl}/api/attendance/date/${dateStr}/subject/${encodeURIComponent(selectedSubject)}?semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`
            );
            if (data.success) {
                const students   = data.students   || [];
                const allPeriods = data.allPeriods || [];
                cacheSet(dateTapSubjCacheRef, cacheKey, { students, allPeriods });
                setStudentsOnDate(students);
                setAllPeriods(allPeriods);
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
    // Pre-convert activeDates Set to IST YYYY-MM-DD strings for O(1) lookup
    const activeDateStrings = React.useMemo(() => {
        const toISTDateStr = (d) => {
            const ist = new Date(new Date(d).getTime() + 5.5 * 60 * 60 * 1000);
            return ist.toISOString().split('T')[0];
        };
        const s = new Set();
        activeDates.forEach(iso => s.add(toISTDateStr(iso)));
        return s;
    }, [activeDates]);

    const isActiveDate = (date) => {
        if (!date) return false;
        if (!isTeacher) return !!attendanceData[date.toDateString()];
        if (filterMode === 'day') return !!attendanceData[date.toDateString()];
        const toISTDateStr = (d) => {
            const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            return ist.toISOString().split('T')[0];
        };
        return activeDateStrings.has(toISTDateStr(date));
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
                if (status === 'present') present++;
                else if (status === 'absent') absent++;
                // 'active' = in-progress today, don't count yet
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
                                // Force-refresh: clear relevant cache entries first
                                const year  = currentDate.getFullYear();
                                const month = currentDate.getMonth() + 1;
                                if (filterMode === 'subject' && selectedSubject) {
                                    cacheClear(subjectDatesCacheRef, `${semester}||${branch}||${selectedSubject}`);
                                    cacheClear(dateTapSubjCacheRef, `${semester}||${branch}`);
                                    fetchSubjectDates(true);
                                } else {
                                    cacheClear(monthDataCacheRef, `${semester}||${branch}||${year}||${month}`);
                                    cacheClear(dateTapCacheRef, `${semester}||${branch}`);
                                    fetchTeacherMonthData(true);
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

                            {/* Teacher day-mode: present student count badge */}
                            {isTeacher && filterMode === 'day' && stats && !holiday && (
                                <View style={[styles.teacherDateBadge, { backgroundColor: stats.present > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                                    <Text style={[styles.teacherDateCount, { color: stats.present > 0 ? '#10b981' : '#ef4444' }]}>
                                        {stats.present}
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
                                    <View style={[styles.legendDot, { backgroundColor: 'rgba(0,217,255,0.25)' }]} />
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>Has data</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>Badge = present students</Text>
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

            {/* ── Details Modal — only mounted when needed ── */}
            {showDetailsModal && (
            <Modal
                visible={showDetailsModal}
                transparent
                animationType="none"
                presentationStyle="overFullScreen"
                statusBarTranslucent={true}
                onRequestClose={() => { setShowDetailsModal(false); setDrillStudent(null); setLoadingStudents(false); }}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
                        {/* Modal header */}
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.text, flex: 1, marginRight: 12 }]}>
                                {selectedDate.toDateString()}
                                {isTeacher && filterMode === 'subject' && selectedSubject
                                    ? ` — ${selectedSubject}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => { setShowDetailsModal(false); setDrillStudent(null); setLoadingStudents(false); }}>
                                <XIcon size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* ── Teacher view ── */}
                        {isTeacher ? (
                            <View style={{ flex: 1, minHeight: 300 }}>
                            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 20 }}>
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
                                                <View style={[styles.skeletonAvatar, { backgroundColor: theme.border }]} />
                                                <View style={{ flex: 1, gap: 8 }}>
                                                    <View style={[styles.skeletonLine, { width: '55%', height: 14, backgroundColor: theme.border }]} />
                                                    <View style={[styles.skeletonLine, { width: '35%', height: 11, backgroundColor: theme.border }]} />
                                                </View>
                                                <View style={[styles.skeletonBadge, { backgroundColor: theme.border }]} />
                                            </View>
                                        ))}
                                    </View>
                                ) : studentsOnDate.length === 0 ? (
                                    <View style={styles.noDataContainer}>
                                        <Text style={{ fontSize: 36, marginBottom: 10 }}>📭</Text>
                                        <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                                            No attendance session was held on this date.
                                        </Text>
                                    </View>
                                ) : (() => {
                                    // ── Derived counts ────────────────────────────────────────────
                                    const getStatus = (s) => {
                                        if (filterMode === 'subject' && allPeriods.length > 0)
                                            return s.periods?.[currentPeriodIdx]?.status || 'absent';
                                        return s.status || 'absent';
                                    };
                                    const presentCount = studentsOnDate.filter(s => getStatus(s) === 'present').length;
                                    const absentCount  = studentsOnDate.length - presentCount;
                                    const rate         = studentsOnDate.length > 0
                                        ? Math.round((presentCount / studentsOnDate.length) * 100) : 0;
                                    const rateColor    = rate >= 75 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';

                                    // ── Filter + search ───────────────────────────────────────────
                                    const filtered = studentsOnDate.filter(s => {
                                        const st = getStatus(s);
                                        if (modalFilter === 'present' && st !== 'present') return false;
                                        if (modalFilter === 'absent'  && st !== 'absent')  return false;
                                        if (modalSearch.trim()) {
                                            const q = modalSearch.trim().toLowerCase();
                                            const name = (s.name || s.studentName || '').toLowerCase();
                                            const enr  = (s.enrollmentNo || '').toLowerCase();
                                            if (!name.includes(q) && !enr.includes(q)) return false;
                                        }
                                        return true;
                                    });

                                    return (
                                        <>
                                            {/* ── Summary card with rate bar ── */}
                                            <View style={[styles.summaryCard, { backgroundColor: theme.background }]}>
                                                <View style={styles.summaryRow}>
                                                    <View style={styles.summaryItem}>
                                                        <Text style={[styles.summaryValue, { color: '#10b981' }]}>{presentCount}</Text>
                                                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Present</Text>
                                                    </View>
                                                    <View style={styles.summaryItem}>
                                                        <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{absentCount}</Text>
                                                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Absent</Text>
                                                    </View>
                                                    <View style={styles.summaryItem}>
                                                        <Text style={[styles.summaryValue, { color: rateColor }]}>{rate}%</Text>
                                                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Rate</Text>
                                                    </View>
                                                </View>
                                                {/* Attendance rate bar */}
                                                <View style={[styles.rateBarBg, { backgroundColor: theme.border }]}>
                                                    <View style={[styles.rateBarFill, {
                                                        width: `${rate}%`,
                                                        backgroundColor: rateColor
                                                    }]} />
                                                </View>
                                            </View>

                                            {/* ── Chevron period navigator (subject mode only) ── */}
                                            {filterMode === 'subject' && allPeriods.length > 1 && (
                                                <View style={[styles.periodNav, { borderColor: theme.border }]}>
                                                    <TouchableOpacity
                                                        style={[styles.chevronBtn, currentPeriodIdx === 0 && styles.chevronDisabled]}
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
                                                        style={[styles.chevronBtn, currentPeriodIdx === allPeriods.length - 1 && styles.chevronDisabled]}
                                                        onPress={() => setCurrentPeriodIdx(i => Math.min(allPeriods.length - 1, i + 1))}
                                                        disabled={currentPeriodIdx === allPeriods.length - 1}
                                                    >
                                                        <ChevronRight color={currentPeriodIdx === allPeriods.length - 1 ? '#555' : theme.primary} size={22} />
                                                    </TouchableOpacity>
                                                </View>
                                            )}

                                            {/* ── Filter tabs ── */}
                                            <View style={[styles.modalFilterRow, { borderColor: theme.border }]}>
                                                {[
                                                    { key: 'all',     label: `All (${studentsOnDate.length})` },
                                                    { key: 'present', label: `Present (${presentCount})` },
                                                    { key: 'absent',  label: `Absent (${absentCount})` },
                                                ].map(tab => (
                                                    <TouchableOpacity
                                                        key={tab.key}
                                                        style={[styles.modalFilterTab,
                                                            modalFilter === tab.key && {
                                                                backgroundColor: tab.key === 'present' ? 'rgba(16,185,129,0.15)'
                                                                    : tab.key === 'absent' ? 'rgba(239,68,68,0.12)'
                                                                    : 'rgba(0,217,255,0.12)',
                                                                borderColor: tab.key === 'present' ? '#10b981'
                                                                    : tab.key === 'absent' ? '#ef4444'
                                                                    : theme.primary,
                                                            }
                                                        ]}
                                                        onPress={() => setModalFilter(tab.key)}
                                                    >
                                                        <Text style={[styles.modalFilterText, {
                                                            color: modalFilter === tab.key
                                                                ? (tab.key === 'present' ? '#10b981' : tab.key === 'absent' ? '#ef4444' : theme.primary)
                                                                : theme.textSecondary,
                                                            fontWeight: modalFilter === tab.key ? '700' : '500'
                                                        }]}>{tab.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {/* ── Search box ── */}
                                            <View style={[styles.modalSearchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                                <Text style={{ color: theme.textSecondary, fontSize: 14, marginRight: 8 }}>🔍</Text>
                                                <TextInput
                                                    style={[styles.modalSearchInput, { color: theme.text }]}
                                                    placeholder="Search name or enrollment…"
                                                    placeholderTextColor={theme.textSecondary}
                                                    value={modalSearch}
                                                    onChangeText={setModalSearch}
                                                    autoCorrect={false}
                                                    autoCapitalize="none"
                                                />
                                                {modalSearch.length > 0 && (
                                                    <TouchableOpacity onPress={() => setModalSearch('')}>
                                                        <Text style={{ color: theme.textSecondary, fontSize: 16, paddingLeft: 6 }}>✕</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            {/* ── Student list ── */}
                                            {(() => {
                                                const totalPages = Math.ceil(filtered.length / MODAL_PAGE_SIZE);
                                                const safePage   = Math.min(modalPage, Math.max(1, totalPages));
                                                const pageSlice  = filtered.slice(
                                                    (safePage - 1) * MODAL_PAGE_SIZE,
                                                    safePage * MODAL_PAGE_SIZE
                                                );
                                                const start = (safePage - 1) * MODAL_PAGE_SIZE + 1;
                                                const end   = Math.min(safePage * MODAL_PAGE_SIZE, filtered.length);

                                                return (
                                                    <>
                                                        {/* List header */}
                                                        <View style={styles.listHeaderRow}>
                                                            <Text style={[styles.studentsTitle, { color: theme.text, marginBottom: 0 }]}>
                                                                {filtered.length === studentsOnDate.length
                                                                    ? `Students (${studentsOnDate.length})`
                                                                    : `${filtered.length} of ${studentsOnDate.length} students`}
                                                            </Text>
                                                            {filtered.length > 0 && (
                                                                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                                                                    {start}–{end}
                                                                </Text>
                                                            )}
                                                        </View>

                                                        {filtered.length === 0 ? (
                                                            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                                                                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>No students match this filter.</Text>
                                                            </View>
                                                        ) : (
                                                            <>
                                                                {pageSlice.map((student, i) => {
                                                                    const periodRecord = filterMode === 'subject' && allPeriods.length > 0
                                                                        ? student.periods?.[currentPeriodIdx]
                                                                        : null;
                                                                    const status    = periodRecord ? periodRecord.status : student.status;
                                                                    const isPresent = status === 'present';
                                                                    const initials  = (student.name || student.studentName || '?')[0].toUpperCase();
                                                                    const lecs      = student.lectures || [];
                                                                    const lPresent  = lecs.filter(l => l.status === 'present').length;

                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={student.enrollmentNo || i}
                                                                            activeOpacity={0.7}
                                                                            onPress={() => {
                                                                                const drillLecs = filterMode === 'subject' && allPeriods.length > 0
                                                                                    ? allPeriods.map((p, pi) => {
                                                                                        const pr = student.periods?.[pi];
                                                                                        return { period: p, subject: selectedSubject,
                                                                                                 status: pr?.status || 'absent',
                                                                                                 verificationType: pr?.verificationType,
                                                                                                 room: pr?.room, teacher: pr?.teacher };
                                                                                      })
                                                                                    : lecs;
                                                                                setDrillStudent({ ...student, name: student.name || student.studentName, lectures: drillLecs });
                                                                            }}
                                                                        >
                                                                            <View style={[styles.studentCard, {
                                                                                backgroundColor: isPresent ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.04)',
                                                                                borderLeftColor: isPresent ? '#10b981' : '#ef4444',
                                                                                borderColor: isPresent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.12)',
                                                                                borderWidth: 1
                                                                            }]}>
                                                                                <View style={[styles.scAvatar, {
                                                                                    backgroundColor: isPresent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.12)'
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
                                                                                    backgroundColor: isPresent ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)'
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

                                                                {/* ── Pagination controls ── */}
                                                                {totalPages > 1 && (
                                                                    <View style={[styles.paginationRow, { borderColor: theme.border }]}>
                                                                        <TouchableOpacity
                                                                            style={[styles.pageBtn, safePage === 1 && styles.pageBtnDisabled]}
                                                                            onPress={() => setModalPage(1)}
                                                                            disabled={safePage === 1}
                                                                        >
                                                                            <Text style={{ color: safePage === 1 ? '#555' : theme.primary, fontSize: 13 }}>«</Text>
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity
                                                                            style={[styles.pageBtn, safePage === 1 && styles.pageBtnDisabled]}
                                                                            onPress={() => setModalPage(p => Math.max(1, p - 1))}
                                                                            disabled={safePage === 1}
                                                                        >
                                                                            <Text style={{ color: safePage === 1 ? '#555' : theme.primary, fontSize: 13 }}>‹</Text>
                                                                        </TouchableOpacity>

                                                                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' }}>
                                                                            Page {safePage} of {totalPages}
                                                                        </Text>

                                                                        <TouchableOpacity
                                                                            style={[styles.pageBtn, safePage === totalPages && styles.pageBtnDisabled]}
                                                                            onPress={() => setModalPage(p => Math.min(totalPages, p + 1))}
                                                                            disabled={safePage === totalPages}
                                                                        >
                                                                            <Text style={{ color: safePage === totalPages ? '#555' : theme.primary, fontSize: 13 }}>›</Text>
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity
                                                                            style={[styles.pageBtn, safePage === totalPages && styles.pageBtnDisabled]}
                                                                            onPress={() => setModalPage(totalPages)}
                                                                            disabled={safePage === totalPages}
                                                                        >
                                                                            <Text style={{ color: safePage === totalPages ? '#555' : theme.primary, fontSize: 13 }}>»</Text>
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                )}
                                                            </>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </>
                                    );
                                })()}
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
                                        <View style={{ flex: 1, marginHorizontal: 8, minWidth: 0 }}>
                                            <Text style={[styles.modalTitle, { color: theme.text, fontSize: 15 }]} numberOfLines={1}>
                                                {drillStudent.name || 'Unknown'}
                                            </Text>
                                            <Text style={[styles.studentId, { color: theme.textSecondary }]} numberOfLines={1}>
                                                {drillStudent.enrollmentNo || ''}
                                            </Text>
                                        </View>
                                        <TouchableOpacity onPress={() => { setDrillStudent(null); setShowDetailsModal(false); }}>
                                            <XIcon size={22} color={theme.text} />
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView style={[styles.modalBody, { flex: 1 }]}>
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
                                            return (
                                                <View key={i} style={[styles.ltRow, {
                                                    borderBottomColor: theme.border,
                                                    borderBottomWidth: i < drillStudent.lectures.length - 1 ? 1 : 0
                                                }]}>
                                                    <View style={[styles.ltDot, { backgroundColor: isP ? '#10b981' : '#ef4444' }]} />
                                                    <View style={[styles.ltPeriodBadge, { backgroundColor: 'rgba(0,217,255,0.1)' }]}>
                                                        <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>{l.period || '—'}</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{l.subject || 'Unknown'}</Text>
                                                        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                                                            {[l.teacher && `👨‍🏫 ${l.teacher}`, l.room && `📍 ${l.room}`, l.verificationType && `🔐 ${l.verificationType}`].filter(Boolean).join('  ')}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.ltStatus, {
                                                        backgroundColor: isP ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
                                                    }]}>
                                                        <Text style={{ color: isP ? '#10b981' : '#ef4444', fontWeight: '700', fontSize: 12 }}>
                                                            {isP ? '✓' : '✗'}
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
                                                                const color = isP ? '#10b981' : '#ef4444';
                                                                const shortName = (lec.subject || '').length > 5 ? (lec.subject || '').substring(0, 4) + '…' : (lec.subject || pid);
                                                                return (
                                                                    <View key={pid} style={[styles.bubbleWrap, { borderColor: color }]}>
                                                                        <Text style={{ color, fontSize: 8, fontWeight: '700', textAlign: 'center', lineHeight: 11 }} numberOfLines={1}>{shortName}</Text>
                                                                        <Text style={{ color, fontSize: 9, fontWeight: '700', lineHeight: 12 }}>{pid}</Text>
                                                                        <Text style={{ color, fontSize: 10, lineHeight: 12 }}>{isP ? '✓' : '✗'}</Text>
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
                                                ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                                            <Text style={[styles.overallStatusText,
                                                { color: selectedDateDetails.status === 'present' ? '#10b981' : '#ef4444' }]}>
                                                {selectedDateDetails.status === 'present' ? '✅ Present' : '❌ Absent'}
                                            </Text>
                                            {selectedDateDetails.totalClassTime > 0 && (
                                                <Text style={[styles.overallTime, { color: theme.textSecondary }]}>
                                                    {selectedDateDetails.totalAttended} min / {selectedDateDetails.totalClassTime} min
                                                </Text>
                                            )}
                                        </View>
                                        {selectedDateDetails.lectures?.length > 0 && (
                                            <>
                                                <Text style={[styles.lecturesTitle, { color: theme.text }]}>Lectures</Text>
                                                {selectedDateDetails.lectures.map((lec, i) => (
                                                    <View key={i} style={[styles.lectureCard,
                                                        { backgroundColor: theme.background,
                                                          borderLeftColor: lec.present ? '#10b981' : '#ef4444' }]}>
                                                        <View style={styles.lectureHeader}>
                                                            <Text style={[styles.lectureSubject, { color: theme.text }]}>
                                                                {lec.subject || 'Class'}
                                                            </Text>
                                                            <View style={{ alignItems: 'flex-end' }}>
                                                                <Text style={[styles.lectureStatus,
                                                                    { color: lec.present ? '#10b981' : '#ef4444' }]}>
                                                                    {lec.present ? '✓' : '✗'} {lec.percentage || 0}%
                                                                </Text>
                                                                {(lec.total > 0 || lec.attended > 0) && (
                                                                    <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 2 }}>
                                                                        {Math.floor((lec.attended || 0) / 60)} min / {Math.floor((lec.total || 0) / 60)} min
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
            )}
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
        borderRadius: 8,
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
    modalOverlay:  {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
        // statusBarTranslucent makes the modal cover the full screen including
        // the status bar. We don't add any bottom padding here — the sheet
        // itself handles safe-area insets so it never hides behind the nav bar.
        paddingBottom: 0,
        zIndex: 9999,
        elevation: 9999,
    },
    modalContent:  {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        // Fixed height so inner flex:1 children resolve correctly.
        // A ScrollView inside a view with only maxHeight (no height) collapses to 0.
        height: Dimensions.get('window').height * 0.88,
        width: '100%',
        overflow: 'hidden',
        zIndex: 10000,
        elevation: 10000,
        // Pad the bottom so content clears the Android gesture/nav bar.
        paddingBottom: Platform.OS === 'android' ? 16 : 0,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    },
    modalTitle:   { fontSize: 16, fontWeight: 'bold' },
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
        width: 64, height: 64, borderRadius: 32,
        borderWidth: 2, justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },

    // ── student detail (own attendance) ──────────────────────────────────────
    overallStatus:     { padding: 16, borderRadius: 12, marginBottom: 16 },
    overallStatusText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    overallTime:       { fontSize: 12, textAlign: 'center', marginTop: 4 },
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

    // ── modal filter tabs + search ────────────────────────────────────────────
    modalFilterRow: {
        flexDirection: 'row', gap: 8, marginBottom: 12,
        paddingBottom: 12, borderBottomWidth: 1,
    },
    modalFilterTab: {
        flex: 1, paddingVertical: 7, borderRadius: 20,
        alignItems: 'center', borderWidth: 1,
        borderColor: 'transparent', backgroundColor: 'rgba(128,128,128,0.08)',
    },
    modalFilterText: { fontSize: 12 },
    modalSearchBox: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 10, borderWidth: 1, marginBottom: 14,
    },
    modalSearchInput: { flex: 1, fontSize: 14, padding: 0 },

    // ── rate bar ──────────────────────────────────────────────────────────────
    rateBarBg:   { height: 6, borderRadius: 3, marginTop: 14, overflow: 'hidden' },
    rateBarFill: { height: 6, borderRadius: 3 },

    // ── pagination ────────────────────────────────────────────────────────────
    listHeaderRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10,
    },
    paginationRow: {
        flexDirection: 'row', alignItems: 'center',
        marginTop: 12, paddingTop: 12, borderTopWidth: 1,
    },
    pageBtn: {
        width: 36, height: 36, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    pageBtnDisabled: { opacity: 0.35 },
});
