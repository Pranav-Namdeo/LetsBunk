import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal
} from 'react-native';
import { CalendarIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from './Icons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

import { getServerTime } from './ServerTime';

export default function CalendarScreen({ theme, studentId, semester, branch, socketUrl, isTeacher = false }) {
    // Use server time for calendar
    const getInitialDate = () => {
        try {
            const serverTime = getServerTime();
            return serverTime.nowDate();
        } catch {
            return new Date();
        }
    };
    
    const [currentDate, setCurrentDate] = useState(getInitialDate());
    const [selectedDate, setSelectedDate] = useState(getInitialDate());
    const [attendanceData, setAttendanceData] = useState({});
    const [attendanceRecords, setAttendanceRecords] = useState({});
    const [loading, setLoading] = useState(false);
    const [monthStats, setMonthStats] = useState({ present: 0, absent: 0, total: 0 });
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedDateDetails, setSelectedDateDetails] = useState(null);
    const [holidays, setHolidays] = useState({});
    
    // Teacher-specific states
    const [studentsOnDate, setStudentsOnDate] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    useEffect(() => {
        console.log('📱 CalendarScreen mounted with props:', {
            studentId,
            semester,
            branch,
            socketUrl,
            isTeacher,
            currentMonth: currentDate.toDateString()
        });
        if (isTeacher) {
            fetchTeacherMonthData();
        } else {
            fetchMonthAttendance();
        }
        fetchHolidays();
    }, [currentDate, studentId, semester, branch]);

    const fetchHolidays = async () => {
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            const response = await fetch(`${socketUrl}/api/holidays/range?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`);
            const data = await response.json();

            if (data.success && data.holidays) {
                const holidayMap = {};
                data.holidays.forEach(holiday => {
                    const date = new Date(holiday.date).toDateString();
                    holidayMap[date] = holiday;
                });
                setHolidays(holidayMap);
            }
        } catch (error) {
            console.log('Error fetching holidays:', error);
        }
    };

    const fetchTeacherMonthData = async () => {
        if (!semester || !branch) {
            console.log('⚠️ No semester/branch provided for teacher calendar');
            return;
        }

        console.log('📅 Fetching teacher data for:', semester, branch);
        setLoading(true);
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            // Fetch ALL attendance records for this semester/branch (no date filter)
            const url = `${socketUrl}/api/attendance/records?semester=${semester}&branch=${branch}`;
            console.log('📡 Fetching ALL attendance data from:', url);

            const response = await fetch(url);
            const data = await response.json();

            console.log('📊 Teacher attendance data received:', data);

            if (data.success && data.records) {
                // Group records by date and count present/absent
                const dateMap = {};
                let monthPresent = 0, monthAbsent = 0;
                
                data.records.forEach(record => {
                    const recordDate = new Date(record.date);
                    const date = recordDate.toDateString();
                    if (!dateMap[date]) {
                        dateMap[date] = { present: 0, absent: 0, total: 0 };
                    }
                    if (record.status === 'present') dateMap[date].present++;
                    else if (record.status === 'absent') dateMap[date].absent++;
                    dateMap[date].total++;
                    
                    // Count for current month only (for stats display)
                    if (recordDate.getMonth() === currentDate.getMonth() && 
                        recordDate.getFullYear() === currentDate.getFullYear()) {
                        if (record.status === 'present') monthPresent++;
                        else if (record.status === 'absent') monthAbsent++;
                    }
                });

                console.log('✅ Processed teacher data - Current month:', { present: monthPresent, absent: monthAbsent });
                console.log('✅ Total records loaded:', data.records.length);
                setAttendanceData(dateMap);
                
                // Calculate month stats (current month only)
                setMonthStats({ 
                    present: monthPresent, 
                    absent: monthAbsent, 
                    total: monthPresent + monthAbsent 
                });
            } else {
                console.log('❌ No records found');
                setAttendanceData({});
                setMonthStats({ present: 0, absent: 0, total: 0 });
            }
        } catch (error) {
            console.log('❌ Error fetching teacher data:', error);
            setAttendanceData({});
            setMonthStats({ present: 0, absent: 0, total: 0 });
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthAttendance = async () => {
        if (!studentId) {
            console.log('⚠️ No studentId provided to CalendarScreen');
            console.log('Props received:', { studentId, semester, branch, socketUrl });
            return;
        }

        console.log('📅 Fetching attendance for student:', studentId);
        console.log('📋 Semester:', semester, 'Branch:', branch);
        setLoading(true);
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            // Fetch ALL attendance data (no date filter) to show complete history
            const url = `${socketUrl}/api/attendance/records?studentId=${studentId}`;
            console.log('📡 Fetching ALL attendance data from:', url);

            const response = await fetch(url);
            const data = await response.json();

            console.log('📊 Attendance data received:', data);

            if (data.success && data.records) {
                const attendanceMap = {};
                const recordsMap = {};
                let present = 0, absent = 0;
                let monthPresent = 0, monthAbsent = 0;

                data.records.forEach(record => {
                    const recordDate = new Date(record.date);
                    const date = recordDate.toDateString();
                    attendanceMap[date] = record.status;

                    // Ensure lectures array exists and has proper structure
                    if (!record.lectures || !Array.isArray(record.lectures)) {
                        record.lectures = [];
                    }

                    // Ensure numeric fields exist
                    record.totalAttended = record.totalAttended || 0;
                    record.totalClassTime = record.totalClassTime || 0;
                    record.dayPercentage = record.dayPercentage || 0;

                    recordsMap[date] = record;

                    // Count for current month only (for stats display)
                    if (recordDate.getMonth() === currentDate.getMonth() && 
                        recordDate.getFullYear() === currentDate.getFullYear()) {
                        if (record.status === 'present') monthPresent++;
                        else if (record.status === 'absent') monthAbsent++;
                    }
                });

                console.log('✅ Processed attendance - Current month:', { present: monthPresent, absent: monthAbsent });
                console.log('✅ Total records loaded:', data.records.length);
                setAttendanceData(attendanceMap);
                setAttendanceRecords(recordsMap);
                setMonthStats({ present: monthPresent, absent: monthAbsent, total: monthPresent + monthAbsent });
            } else {
                console.log('❌ Failed to fetch attendance or no records:', data);
                setAttendanceData({});
                setAttendanceRecords({});
                setMonthStats({ present: 0, absent: 0, total: 0 });
            }
        } catch (error) {
            console.log('❌ Error fetching attendance:', error);
            setAttendanceData({});
            setAttendanceRecords({});
            setMonthStats({ present: 0, absent: 0, total: 0 });
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];

        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    };

    const changeMonth = (direction) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(currentDate.getMonth() + direction);
        setCurrentDate(newDate);
    };

    const getAttendanceStatus = (date) => {
        if (!date) return null;
        const dateKey = date.toDateString();
        if (isTeacher) {
            // For teachers, return if there's any data for this date
            return attendanceData[dateKey] ? 'present' : null;
        }
        return attendanceData[dateKey];
    };
    
    const getDateStats = (date) => {
        if (!date || !isTeacher) return null;
        return attendanceData[date.toDateString()];
    };

    const getHoliday = (date) => {
        if (!date) return null;
        return holidays[date.toDateString()];
    };

    const fetchStudentsForDate = async (date) => {
        if (!isTeacher || !semester || !branch) return;
        
        setLoadingStudents(true);
        try {
            const dateStr = date.toISOString().split('T')[0];
            const url = `${socketUrl}/api/attendance/date/${dateStr}?semester=${semester}&branch=${branch}`;
            console.log('📊 Fetching students for date:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('👥 Students data:', data);
            
            if (data.success && data.students) {
                setStudentsOnDate(data.students);
            } else {
                setStudentsOnDate([]);
            }
        } catch (error) {
            console.log('❌ Error fetching students:', error);
            setStudentsOnDate([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    const showDateDetails = (date) => {
        if (!date) return;
        const dateKey = date.toDateString();
        
        setSelectedDate(date);
        
        if (isTeacher) {
            // Teacher view: show students for this date
            fetchStudentsForDate(date);
            setShowDetailsModal(true);
        } else {
            // Student view: show their own attendance
            const record = attendanceRecords[dateKey];
            const holiday = holidays[dateKey];

            console.log('📅 Showing details for:', dateKey);
            console.log('📋 Record:', record);
            console.log('🏖️ Holiday:', holiday);

            if (record || holiday) {
                setSelectedDateDetails({ ...record, holiday });
                setShowDetailsModal(true);
            } else {
                console.log('⚠️ No attendance record or holiday for this date');
            }
        }
    };

    const isToday = (date) => {
        if (!date) return false;
        try {
            const serverTime = getServerTime();
            const today = serverTime.nowDate();
            return date.toDateString() === today.toDateString();
        } catch {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }
    };

    const isSelected = (date) => {
        if (!date) return false;
        return date.toDateString() === selectedDate.toDateString();
    };

    const days = getDaysInMonth(currentDate);
    const attendancePercentage = monthStats.total > 0
        ? ((monthStats.present / monthStats.total) * 100).toFixed(1)
        : 0;

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <CalendarIcon size={28} color={theme.primary} />
                    <Text style={[styles.title, { color: theme.primary }]}>Attendance Calendar</Text>
                </View>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Track your attendance history
                </Text>
            </View>

            {/* Month Stats Card */}
            <View style={[styles.statsCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#10b981' }]}>{monthStats.present}</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Present</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#ef4444' }]}>{monthStats.absent}</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Absent</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: theme.primary }]}>{attendancePercentage}%</Text>
                        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rate</Text>
                    </View>
                </View>
            </View>

            {/* Month Navigation */}
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

            {/* Calendar Grid */}
            <View style={[styles.calendar, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                {/* Day Headers */}
                <View style={styles.dayHeaders}>
                    {DAYS.map(day => (
                        <View key={day} style={styles.dayHeader}>
                            <Text style={[styles.dayHeaderText, { color: theme.textSecondary }]}>{day}</Text>
                        </View>
                    ))}
                </View>

                {/* Calendar Days */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={theme.primary} />
                    </View>
                ) : (
                    <View style={styles.daysGrid}>
                        {days.map((date, index) => {
                            const status = getAttendanceStatus(date);
                            const dateStats = getDateStats(date);
                            const holiday = getHoliday(date);
                            const today = isToday(date);
                            const selected = isSelected(date);
                            const hasData = isTeacher ? dateStats : status;

                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.dayCell,
                                        !date && styles.emptyCell,
                                        today && styles.todayCell,
                                        selected && { borderColor: theme.primary, borderWidth: 2 },
                                        hasData && styles.presentCell,
                                        holiday && styles.holidayCell,
                                    ]}
                                    onPress={() => date && showDateDetails(date)}
                                    disabled={!date}
                                >
                                    {date && (
                                        <>
                                            <Text style={[
                                                styles.dayNumber,
                                                { color: theme.text },
                                                today && styles.todayText,
                                                hasData && styles.statusText,
                                                holiday && styles.holidayText
                                            ]}>
                                                {date.getDate()}
                                            </Text>
                                            {holiday && (
                                                <View style={[styles.holidayBadge, { backgroundColor: holiday.color }]}>
                                                    <Text style={styles.holidayEmoji}>
                                                        {holiday.type === 'holiday' ? '🏖️' : holiday.type === 'exam' ? '📝' : '🎉'}
                                                    </Text>
                                                </View>
                                            )}
                                            {isTeacher && dateStats && !holiday && (
                                                <View style={styles.teacherDateBadge}>
                                                    <Text style={[styles.teacherDateCount, { color: theme.primary }]}>
                                                        {dateStats.total}
                                                    </Text>
                                                </View>
                                            )}
                                            {!isTeacher && status && !holiday && (
                                                <View style={styles.statusIcon}>
                                                    {status === 'present' ? (
                                                        <CheckIcon size={10} color="#10b981" />
                                                    ) : (
                                                        <XIcon size={10} color="#ef4444" />
                                                    )}
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
                <Text style={[styles.legendTitle, { color: theme.text }]}>Legend:</Text>
                <View style={styles.legendItems}>
                    {isTeacher ? (
                        <>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Has Data</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Today</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                                    Number = Total Students
                                </Text>
                            </View>
                        </>
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
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Today</Text>
                            </View>
                        </>
                    )}
                </View>
            </View>

            {/* Details Modal */}
            <Modal
                visible={showDetailsModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowDetailsModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>
                                {selectedDate.toDateString()}
                            </Text>
                            <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                                <XIcon size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {isTeacher ? (
                            /* Teacher View: Show Students List */
                            <ScrollView style={styles.modalBody}>
                                {loadingStudents ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="large" color={theme.primary} />
                                        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                                            Loading students...
                                        </Text>
                                    </View>
                                ) : studentsOnDate.length > 0 ? (
                                    <>
                                        {/* Summary Stats */}
                                        <View style={[styles.summaryCard, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.summaryTitle, { color: theme.text }]}>
                                                📊 Attendance Summary
                                            </Text>
                                            <View style={styles.summaryRow}>
                                                <View style={styles.summaryItem}>
                                                    <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                                                        {studentsOnDate.filter(s => s.status === 'present').length}
                                                    </Text>
                                                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                        Present
                                                    </Text>
                                                </View>
                                                <View style={styles.summaryItem}>
                                                    <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
                                                        {studentsOnDate.filter(s => s.status === 'absent').length}
                                                    </Text>
                                                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                        Absent
                                                    </Text>
                                                </View>
                                                <View style={styles.summaryItem}>
                                                    <Text style={[styles.summaryValue, { color: theme.primary }]}>
                                                        {studentsOnDate.length}
                                                    </Text>
                                                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                        Total
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        {/* Students List */}
                                        <Text style={[styles.studentsTitle, { color: theme.text }]}>
                                            Students ({studentsOnDate.length}):
                                        </Text>
                                        {studentsOnDate.map((student, index) => (
                                            <View
                                                key={index}
                                                style={[
                                                    styles.studentCard,
                                                    {
                                                        backgroundColor: theme.background,
                                                        borderLeftColor: student.status === 'present' ? '#10b981' : '#ef4444'
                                                    }
                                                ]}
                                            >
                                                <View style={styles.studentHeader}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.studentName, { color: theme.text }]}>
                                                            {student.name || 'Unknown Student'}
                                                        </Text>
                                                        <Text style={[styles.studentId, { color: theme.textSecondary }]}>
                                                            ID: {student.studentId || 'N/A'}
                                                        </Text>
                                                    </View>
                                                    <View style={[
                                                        styles.statusBadge,
                                                        { backgroundColor: student.status === 'present' ? '#10b98120' : '#ef444420' }
                                                    ]}>
                                                        <Text style={[
                                                            styles.statusBadgeText,
                                                            { color: student.status === 'present' ? '#10b981' : '#ef4444' }
                                                        ]}>
                                                            {student.status === 'present' ? '✓ Present' : '✗ Absent'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                {student.percentage !== undefined && (
                                                    <Text style={[styles.studentPercentage, { color: theme.textSecondary }]}>
                                                        📊 Attendance: {student.percentage}%
                                                    </Text>
                                                )}
                                                {student.totalAttended !== undefined && student.totalClassTime !== undefined && (
                                                    <Text style={[styles.studentTime, { color: theme.textSecondary }]}>
                                                        ⏱️ {student.totalAttended} min / {student.totalClassTime} min
                                                    </Text>
                                                )}
                                            </View>
                                        ))}
                                    </>
                                ) : (
                                    <View style={styles.noDataContainer}>
                                        <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                                            📚 No attendance data available for this date
                                        </Text>
                                        <Text style={[styles.noDataSubtext, { color: theme.textSecondary }]}>
                                            Students may not have been marked yet
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                        ) : (
                            /* Student View: Show Their Own Attendance */
                            selectedDateDetails && (
                            <ScrollView style={styles.modalBody}>
                                {/* Holiday Info (if applicable) */}
                                {selectedDateDetails.holiday && (
                                    <View style={[
                                        styles.holidayInfo,
                                        { backgroundColor: selectedDateDetails.holiday.color + '20', borderColor: selectedDateDetails.holiday.color }
                                    ]}>
                                        <Text style={styles.holidayInfoEmoji}>
                                            {selectedDateDetails.holiday.type === 'holiday' ? '🏖️' : selectedDateDetails.holiday.type === 'exam' ? '📝' : '🎉'}
                                        </Text>
                                        <Text style={[styles.holidayInfoName, { color: selectedDateDetails.holiday.color }]}>
                                            {selectedDateDetails.holiday.name}
                                        </Text>
                                        {selectedDateDetails.holiday.description && (
                                            <Text style={[styles.holidayInfoDesc, { color: theme.textSecondary }]}>
                                                {selectedDateDetails.holiday.description}
                                            </Text>
                                        )}
                                    </View>
                                )}

                                {/* Overall Status */}
                                <View style={[
                                    styles.overallStatus,
                                    { backgroundColor: selectedDateDetails.status === 'present' ? '#10b98120' : '#ef444420' }
                                ]}>
                                    <Text style={[
                                        styles.overallStatusText,
                                        { color: selectedDateDetails.status === 'present' ? '#10b981' : '#ef4444' }
                                    ]}>
                                        {selectedDateDetails.status === 'present' ? '✅ Present' : '❌ Absent'}
                                        {selectedDateDetails.dayPercentage > 0 && ` • ${selectedDateDetails.dayPercentage}%`}
                                    </Text>
                                    {selectedDateDetails.totalClassTime > 0 && (
                                        <Text style={[styles.overallTime, { color: theme.textSecondary }]}>
                                            {selectedDateDetails.totalAttended} min / {selectedDateDetails.totalClassTime} min attended
                                        </Text>
                                    )}
                                </View>

                                {/* Lectures */}
                                {selectedDateDetails.lectures && selectedDateDetails.lectures.length > 0 ? (
                                    <>
                                        <Text style={[styles.lecturesTitle, { color: theme.text }]}>
                                            Classes Attended ({selectedDateDetails.lectures.length}):
                                        </Text>
                                        {selectedDateDetails.lectures.map((lecture, index) => (
                                            <View
                                                key={index}
                                                style={[
                                                    styles.lectureCard,
                                                    {
                                                        backgroundColor: theme.background,
                                                        borderLeftColor: lecture.present ? '#10b981' : '#ef4444'
                                                    }
                                                ]}
                                            >
                                                <View style={styles.lectureHeader}>
                                                    <Text style={[styles.lectureSubject, { color: theme.text }]}>
                                                        {lecture.subject || 'Class'}
                                                    </Text>
                                                    <Text style={[
                                                        styles.lectureStatus,
                                                        { color: lecture.present ? '#10b981' : '#ef4444' }
                                                    ]}>
                                                        {lecture.present ? '✓' : '✗'} {lecture.percentage || 0}%
                                                    </Text>
                                                </View>
                                                <Text style={[styles.lectureDetails, { color: theme.textSecondary }]}>
                                                    ⏱️ {lecture.attended || 0} min / {lecture.total || 0} min
                                                    {lecture.startTime && lecture.endTime && ` • ${lecture.startTime}-${lecture.endTime}`}
                                                </Text>
                                                {lecture.room && (
                                                    <Text style={[styles.lectureRoom, { color: theme.textSecondary }]}>
                                                        📍 Room {lecture.room}
                                                    </Text>
                                                )}
                                            </View>
                                        ))}
                                    </>
                                ) : (
                                    <View style={styles.noLecturesContainer}>
                                        <Text style={[styles.noLecturesText, { color: theme.textSecondary }]}>
                                            📚 No detailed lecture data available for this date
                                        </Text>
                                        <Text style={[styles.noLecturesSubtext, { color: theme.textSecondary }]}>
                                            Status: {selectedDateDetails.status === 'present' ? 'Marked Present' : 'Marked Absent'}
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                            )
                        )}
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 20,
        paddingTop: 60,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 14,
    },
    statsCard: {
        margin: 20,
        marginTop: 10,
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
    },
    monthNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: 20,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    navButton: {
        padding: 8,
    },
    navButtonText: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    monthText: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    calendar: {
        margin: 20,
        marginTop: 0,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    dayHeaders: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    dayHeader: {
        flex: 1,
        alignItems: 'center',
    },
    dayHeaderText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        marginBottom: 4,
    },
    emptyCell: {
        backgroundColor: 'transparent',
    },
    todayCell: {
        backgroundColor: 'rgba(0, 217, 255, 0.1)',
    },
    presentCell: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    absentCell: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    holidayCell: {
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        borderColor: '#ff6b6b',
        borderWidth: 1,
    },
    dayNumber: {
        fontSize: 14,
        fontWeight: '500',
    },
    holidayText: {
        color: '#ff6b6b',
        fontWeight: 'bold',
    },
    holidayBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    holidayEmoji: {
        fontSize: 8,
    },
    todayText: {
        fontWeight: 'bold',
    },
    statusText: {
        fontWeight: 'bold',
    },
    statusIcon: {
        position: 'absolute',
        bottom: 4,
    },
    teacherDateBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        backgroundColor: 'rgba(0, 217, 255, 0.2)',
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 2,
        minWidth: 16,
        alignItems: 'center',
    },
    teacherDateCount: {
        fontSize: 8,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    legend: {
        margin: 20,
        marginTop: 0,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 100,
    },
    legendTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    legendItems: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 6,
    },
    legendText: {
        fontSize: 12,
    },
    noLecturesContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noLecturesText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 8,
    },
    noLecturesSubtext: {
        fontSize: 12,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    overallStatus: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    overallStatusText: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    overallTime: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 4,
    },
    lecturesTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    lectureCard: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        borderLeftWidth: 3,
    },
    lectureHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    lectureSubject: {
        fontSize: 14,
        fontWeight: '600',
    },
    lectureStatus: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    lectureDetails: {
        fontSize: 11,
        marginTop: 2,
    },
    lectureRoom: {
        fontSize: 10,
        marginTop: 2,
    },
    holidayInfo: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        alignItems: 'center',
        borderWidth: 2,
    },
    holidayInfoEmoji: {
        fontSize: 40,
        marginBottom: 8,
    },
    holidayInfoName: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    holidayInfoDesc: {
        fontSize: 13,
        textAlign: 'center',
    },
    summaryCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
        textAlign: 'center',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 11,
    },
    studentsTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    studentCard: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        borderLeftWidth: 3,
    },
    studentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    studentName: {
        fontSize: 14,
        fontWeight: '600',
    },
    studentId: {
        fontSize: 11,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusBadgeText: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    studentPercentage: {
        fontSize: 11,
        marginTop: 2,
    },
    studentTime: {
        fontSize: 10,
        marginTop: 2,
    },
    noDataContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noDataText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 8,
    },
    noDataSubtext: {
        fontSize: 12,
        textAlign: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
});
