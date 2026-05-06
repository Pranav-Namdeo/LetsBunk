import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image } from 'react-native';
import FilterButtons from './FilterButtons';

const StudentList = ({ theme, students = [], onStudentPress, activeRandomRing = null, onTeacherAction }) => {
  const [selectedFilter, setSelectedFilter] = useState('all');

  // status values: 'present' | 'active' | 'absent' | 'offline' (disconnected, timer frozen)
  const filteredStudents = students.filter((student) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'active') return student.status === 'active' || student.status === 'offline';
    if (selectedFilter === 'present') return student.status === 'present';
    if (selectedFilter === 'absent') return student.status === 'absent';
    return true;
  });

  const filterCounts = {
    all: students.length,
    active: students.filter(s => s.status === 'active' || s.status === 'offline').length,
    present: students.filter(s => s.status === 'present').length,
    absent: students.filter(s => s.status === 'absent').length,
  };

  const presentCount = students.filter(s => s.status === 'present').length;

  const renderStudentItem = ({ item: student }) => {
    // Match random ring by enrollmentNo only — that's the canonical identifier
    const randomRingStudent = activeRandomRing?.selectedStudents?.find(s =>
      s.enrollmentNo === student.enrollmentNo
    );
    return (
      <StudentItem
        student={student}
        theme={theme}
        onPress={() => onStudentPress && onStudentPress(student)}
        randomRingStudent={randomRingStudent}
        onTeacherAction={onTeacherAction || (() => {})}
        randomRingId={activeRandomRing?.ringId || activeRandomRing?._id}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Class Attendance</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {presentCount} / {students.length} Present
        </Text>
      </View>
      <FilterButtons
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        counts={filterCounts}
        theme={theme}
      />
      {filteredStudents.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {selectedFilter === 'all' ? 'No students enrolled in this class yet.' : `No students with status: ${selectedFilter}`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          renderItem={renderStudentItem}
          keyExtractor={(item) => item._id || item.id || item.enrollmentNo}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const fmt = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const StudentItem = ({ student, theme, onPress, randomRingStudent, onTeacherAction, randomRingId }) => {
  const [displaySecs, setDisplaySecs] = useState(student.timerValue || 0);
  const [actionLoading, setActionLoading] = useState(false);
  const intervalRef = useRef(null);
  const baseRef = useRef({ secs: student.timerValue || 0, ts: Date.now() });
  // Auto-stop timeout: if no new broadcast arrives within 90s, stop ticking
  const staleCutoffRef = useRef(null);

  // When a new broadcast arrives, reset the base and restart ticking
  useEffect(() => {
    // Only show a non-zero timer for active/present/offline students — absent always shows 00:00
    const effectiveSecs = student.status === 'absent' ? 0 : (student.timerValue || 0);

    baseRef.current = { secs: effectiveSecs, ts: Date.now() };
    setDisplaySecs(effectiveSecs);

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (staleCutoffRef.current) clearTimeout(staleCutoffRef.current);

    // Only tick if student is actively attending (not absent, not already present/finalized)
    if (student.isRunning && student.status === 'active') {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - baseRef.current.ts) / 1000);
        setDisplaySecs(baseRef.current.secs + elapsed);
      }, 1000);

      // Auto-stop after 90s with no new broadcast — student likely went offline
      staleCutoffRef.current = setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 90 * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (staleCutoffRef.current) clearTimeout(staleCutoffRef.current);
    };
  }, [student.timerValue, student.isRunning, student.status]);

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active':   return { bg: '#d1fae5', text: '#059669' };
      case 'present':  return { bg: '#dbeafe', text: '#2563eb' };
      case 'absent':   return { bg: '#fee2e2', text: '#dc2626' };
      case 'offline':  return { bg: '#f3f4f6', text: '#6b7280' }; // grey — frozen, no WiFi
      default:         return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':   return 'Attending';
      case 'present':  return 'Present';
      case 'absent':   return 'Absent';
      case 'offline':  return '⏸ Offline';  // paused, last known value shown
      default:         return 'Unknown';
    }
  };

  const handleAction = async (action) => {
    if (actionLoading || !onTeacherAction || !randomRingId) return;
    // Always use enrollmentNo — matches what liveTimerState stores
    const studentIdToUse = student.enrollmentNo;
    setActionLoading(true);
    try {
      await onTeacherAction(randomRingId, studentIdToUse, action);
    } catch (error) {
      console.error(`❌ Error ${action} student:`, error);
      alert(`Error ${action} student. Please check your connection.`);
    } finally {
      setActionLoading(false);
    }
  };

  const statusStyle = getStatusStyle(student.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.studentCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
    >
      <View style={styles.studentContent}>
        <Image
          source={{ uri: student.profileImage || student.profilePhoto || 'https://via.placeholder.com/56' }}
          style={styles.profileImage}
        />
        <View style={styles.studentInfo}>
          <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{student.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{getStatusLabel(student.status)}</Text>
          </View>
        </View>
        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, { color: theme.text }]}>{fmt(displaySecs)}</Text>
          {student.lectureSubject ? (
            <Text style={[styles.lectureLabel, { color: theme.textSecondary }]} numberOfLines={1}>
              {student.lectureSubject}
            </Text>
          ) : null}
        </View>
      </View>

      {randomRingStudent && randomRingStudent.teacherAction === 'pending' && !randomRingStudent.verified && (
        <View style={styles.actionSection}>
          {randomRingStudent.responded && (
            <Text style={styles.respondedHint}>
              ✋ Student responded — Accept or Reject
            </Text>
          )}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.acceptButton, { opacity: actionLoading ? 0.5 : 1 }]}
              onPress={() => handleAction('accepted')}
              disabled={actionLoading}
            >
              <Text style={styles.acceptButtonText}>✓ Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectButton, { opacity: actionLoading ? 0.5 : 1 }]}
              onPress={() => handleAction('rejected')}
              disabled={actionLoading}
            >
              <Text style={styles.rejectButtonText}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {randomRingStudent && randomRingStudent.teacherAction !== 'pending' && (
        <View style={styles.actionStatus}>
          {randomRingStudent.teacherAction === 'accepted' && (
            <Text style={[styles.actionStatusText, { color: '#059669' }]}>✓ Accepted by teacher</Text>
          )}
          {randomRingStudent.teacherAction === 'rejected' && !randomRingStudent.faceVerifiedAfterRejection && (
            <Text style={[styles.actionStatusText, { color: '#dc2626' }]}>✕ Rejected - Waiting for face verification</Text>
          )}
          {randomRingStudent.faceVerifiedAfterRejection && (
            <Text style={[styles.actionStatusText, { color: '#059669' }]}>✓ Face verified after rejection</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingVertical: 24, maxWidth: 768, alignSelf: 'center', width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSubtitle: { fontSize: 14 },
  listContent: { paddingBottom: 16 },
  studentCard: { borderRadius: 8, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  studentContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profileImage: { width: 56, height: 56, borderRadius: 28 },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  timerContainer: { alignItems: 'flex-end' },
  timerText: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  lectureLabel: { fontSize: 10, marginTop: 2, maxWidth: 80, textAlign: 'right' },
  emptyContainer: { borderRadius: 8, padding: 32, borderWidth: 1, alignItems: 'center', marginTop: 16 },
  emptyText: { fontSize: 14 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  actionSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  respondedHint: { color: '#22c55e', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  acceptButton: { flex: 1, backgroundColor: '#059669', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center' },
  acceptButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  rejectButton: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center' },
  rejectButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  actionStatus: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  actionStatusText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});

export default StudentList;
