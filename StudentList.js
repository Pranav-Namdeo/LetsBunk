import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Animated, Modal, ScrollView } from 'react-native';
import FilterButtons from './FilterButtons';
import StudentSearch from './StudentSearch';

// Separate Header component to prevent re-mounting and focus loss
const ListHeader = React.memo(({ 
  theme, 
  searchQuery, 
  onSearchQueryChange, 
  presentCount, 
  totalStudents, 
  currentRangeLabel, 
  selectedFilter, 
  onFilterChange, 
  filterCounts,
  onTriggerPagination
}) => {
  return (
    <View style={styles.headerWrapper}>
      <StudentSearch 
        theme={theme} 
        searchQuery={searchQuery} 
        onSearchQueryChange={onSearchQueryChange} 
      />

      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Class Attendance</Text>
          <View style={[styles.presenceBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.presenceText, { color: theme.primary }]}>
              {presentCount}/{totalStudents} Present
            </Text>
          </View>
        </View>
        <Text style={[styles.paginationInfo, { color: theme.textSecondary }]}>
          Showing {currentRangeLabel} of {totalStudents} Students
        </Text>
      </View>

      <FilterButtons
        selectedFilter={selectedFilter}
        onFilterChange={onFilterChange}
        counts={filterCounts}
        theme={theme}
        paginationLabel={selectedFilter === 'all' ? currentRangeLabel : null}
      />
    </View>
  );
});

const StudentList = ({ theme, students = [], onStudentPress, activeRandomRing = null, onTeacherAction, refreshControl }) => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isPaginationModalVisible, setIsPaginationModalVisible] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredStudents = useMemo(() => students.filter((student) => {
    if (debouncedSearchQuery.trim() !== '') {
      const q = debouncedSearchQuery.toLowerCase();
      const matchesSearch = 
        student.name?.toLowerCase().includes(q) ||
        student.enrollmentNo?.toLowerCase().includes(q) ||
        student.rollNo?.toLowerCase().includes(q);
      
      if (!matchesSearch) return false;
    }

    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'active') return student.status === 'active' || student.status === 'offline';
    if (selectedFilter === 'present') return student.status === 'present';
    if (selectedFilter === 'absent') return student.status === 'absent';
    return true;
  }), [students, selectedFilter, debouncedSearchQuery]);

  const filterCounts = useMemo(() => ({
    all: students.length,
    active: students.filter(s => s.status === 'active' || s.status === 'offline').length,
    present: students.filter(s => s.status === 'present').length,
    absent: students.filter(s => s.status === 'absent').length,
  }), [students]);

  const presentCount = useMemo(() => students.filter(s => s.status === 'present').length, [students]);

  const sortedStudents = useMemo(() => {
    let list = filteredStudents;
    if (activeRandomRing?.selectedStudents?.length) {
      const ringMap = new Map(
        activeRandomRing.selectedStudents.map(s => [s.enrollmentNo, s])
      );
      const isFloating = (s) => {
        const rs = ringMap.get(s.enrollmentNo);
        return rs && rs.teacherAction === 'pending' && !rs.verified;
      };
      const floating = list.filter(isFloating);
      const rest     = list.filter(s => !isFloating(s));
      list = [...floating, ...rest];
    }
    return list;
  }, [filteredStudents, activeRandomRing]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedStudents.slice(start, end);
  }, [sortedStudents, currentPage]);

  const currentRangeLabel = useMemo(() => {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, sortedStudents.length);
    return sortedStudents.length > 0 ? `${start}-${end}` : '0-0';
  }, [currentPage, sortedStudents.length]);

  const totalPages = Math.ceil(sortedStudents.length / pageSize);

  const loadMore = useCallback(() => {
    if (currentPage * pageSize < sortedStudents.length) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, sortedStudents.length]);

  const scrollY = useRef(new Animated.Value(0)).current;

  const handleSearchChange = useCallback((q) => {
    setSearchQuery(q);
    setCurrentPage(1);
  }, []);

  const handleFilterChange = useCallback((f) => {
    if (f === 'all' && selectedFilter === 'all') {
      setIsPaginationModalVisible(true);
    } else {
      setSelectedFilter(f);
      setCurrentPage(1);
    }
  }, [selectedFilter]);

  const renderStudentItem = useCallback(({ item: student, index }) => {
    const randomRingStudent = activeRandomRing?.selectedStudents?.find(s =>
      s.enrollmentNo === student.enrollmentNo
    );
    const isFloating = randomRingStudent &&
      randomRingStudent.teacherAction === 'pending' &&
      !randomRingStudent.verified;

    return (
      <StudentItem
        student={student}
        theme={theme}
        index={index}
        scrollY={scrollY}
        onPress={() => onStudentPress && onStudentPress(student)}
        randomRingStudent={randomRingStudent}
        onTeacherAction={onTeacherAction || (() => {})}
        randomRingId={activeRandomRing?.ringId || activeRandomRing?._id}
        isFloating={isFloating}
      />
    );
  }, [theme, scrollY, onStudentPress, activeRandomRing, onTeacherAction]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.FlatList
        data={paginatedStudents}
        renderItem={renderStudentItem}
        keyExtractor={(item) => item._id || item.id || item.enrollmentNo}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={
          <ListHeader 
            theme={theme}
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchChange}
            presentCount={presentCount}
            totalStudents={students.length}
            currentRangeLabel={currentRangeLabel}
            selectedFilter={selectedFilter}
            onFilterChange={handleFilterChange}
            filterCounts={filterCounts}
          />
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {searchQuery.trim() !== '' ? `No results found for "${searchQuery}"` : 
               (selectedFilter === 'all' ? 'No students enrolled in this class yet.' : `No students with status: ${selectedFilter}`)}
            </Text>
          </View>
        }
        refreshControl={refreshControl}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      />

      <Modal
        visible={isPaginationModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPaginationModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsPaginationModalVisible(false)}
        >
          <View style={[styles.paginationModal, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Student Range</Text>
              <TouchableOpacity onPress={() => setIsPaginationModalVisible(false)}>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.rangeList} showsVerticalScrollIndicator={false}>
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                const start = i * pageSize + 1;
                const end = Math.min(pageNum * pageSize, sortedStudents.length);
                const isSelected = pageNum === currentPage;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.rangeItem,
                      { backgroundColor: isSelected ? theme.primary + '20' : 'transparent' }
                    ]}
                    onPress={() => {
                      setCurrentPage(pageNum);
                      setIsPaginationModalVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.rangeText,
                      { color: isSelected ? theme.primary : theme.text }
                    ]}>
                      Students {start} - {end}
                    </Text>
                    {isSelected && <Text style={{ color: theme.primary }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const StudentItem = React.memo(({ student, theme, index, scrollY, onPress, randomRingStudent, onTeacherAction, randomRingId, isFloating }) => {
  const [displaySecs, setDisplaySecs] = useState(student.timerValue || 0);
  const [actionLoading, setActionLoading] = useState(false);
  const intervalRef = useRef(null);
  const baseRef = useRef({ secs: student.timerValue || 0, ts: Date.now() });
  const staleCutoffRef = useRef(null);

  const slideAnim = useRef(new Animated.Value(isFloating ? -60 : 0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFloating) {
      const anim = Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 8, useNativeDriver: false }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
            Animated.timing(glowAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
          ])
        ),
      ]);
      anim.start();
      return () => {
        anim.stop();
        glowAnim.stopAnimation();
        slideAnim.stopAnimation();
      };
    } else {
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: false }).start();
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [isFloating]);

  const glowBorder = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(251,191,36,0)', 'rgba(251,191,36,0.8)'],
  });

  useEffect(() => {
    const effectiveSecs = student.status === 'absent' ? 0 : (student.timerValue || 0);
    baseRef.current = { secs: effectiveSecs, ts: Date.now() };
    setDisplaySecs(effectiveSecs);

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (staleCutoffRef.current) clearTimeout(staleCutoffRef.current);

    if (student.isRunning && student.status === 'active') {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - baseRef.current.ts) / 1000);
        setDisplaySecs(baseRef.current.secs + elapsed);
      }, 1000);

      staleCutoffRef.current = setTimeout(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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
      case 'offline':  return { bg: '#f3f4f6', text: '#6b7280' };
      default:         return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':   return 'Attending';
      case 'present':  return 'Present';
      case 'absent':   return 'Absent';
      case 'offline':  return '⏸ Offline';
      default:         return 'Unknown';
    }
  };

  const isWasActive = randomRingStudent?.ringEligibility === 'wasActive';

  const handleAction = async (action) => {
    if (actionLoading || !onTeacherAction || !randomRingId) return;
    setActionLoading(true);
    try {
      await onTeacherAction(randomRingId, student.enrollmentNo, action);
    } catch (error) {
      console.error(`❌ Error ${action} student:`, error);
    } finally {
      setActionLoading(false);
    }
  };

  const statusStyle = getStatusStyle(student.status);

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
      <Animated.View style={[
        styles.studentCard,
        { backgroundColor: theme.cardBackground, borderColor: isFloating ? glowBorder : theme.border },
        isFloating && styles.floatingCard,
      ]}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <View style={styles.studentContent}>
            <Image
              source={{ uri: student.profileImage || student.profilePhoto || 'https://via.placeholder.com/56' }}
              style={styles.profileImage}
            />
            <View style={styles.studentInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{student.name}</Text>
                {randomRingStudent && isWasActive && (
                  <View style={styles.wasActiveBadge}>
                    <Text style={styles.wasActiveBadgeText}>📅 Was active</Text>
                  </View>
                )}
                {randomRingStudent && !isWasActive && (
                  <View style={styles.ringSelectedBadge}>
                    <Text style={styles.ringSelectedBadgeText}>🔔 Ringed</Text>
                  </View>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>{getStatusLabel(student.status)}</Text>
              </View>
            </View>
            <View style={styles.timerContainer}>
              <Text style={[styles.timerText, { color: theme.text }]}>{
                `${Math.floor(displaySecs / 60).toString().padStart(2, '0')}:${(displaySecs % 60).toString().padStart(2, '0')}`
              }</Text>
              {student.lectureSubject ? (
                <Text style={[styles.lectureLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                  {student.lectureSubject}
                </Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        {randomRingStudent && randomRingStudent.teacherAction === 'pending' && !randomRingStudent.verified && (
          <View style={styles.actionSection}>
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
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', alignSelf: 'center', maxWidth: 768 },
  headerWrapper: { width: '100%' },
  header: { paddingHorizontal: 20, marginBottom: 10 },
  headerMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  presenceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  presenceText: { fontSize: 12, fontWeight: '700' },
  paginationInfo: { fontSize: 12, fontWeight: '500' },
  listContent: { paddingBottom: 40, paddingHorizontal: 20 },
  studentCard: { borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1.5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  floatingCard: { borderWidth: 2, elevation: 8, shadowOpacity: 0.15, shadowRadius: 12 },
  studentContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileImage: { width: 52, height: 52, borderRadius: 16 },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  timerContainer: { alignItems: 'flex-end' },
  timerText: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lectureLabel: { fontSize: 10, marginTop: 2, maxWidth: 90, textAlign: 'right', fontWeight: '500' },
  emptyContainer: { borderRadius: 16, padding: 40, borderWidth: 1.5, alignItems: 'center', marginTop: 10, marginHorizontal: 20, borderStyle: 'dashed' },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  actionSection: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  acceptButton: { flex: 1, backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  acceptButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  rejectButton: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  rejectButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  ringSelectedBadge: { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  ringSelectedBadgeText: { fontSize: 10, color: '#d97706', fontWeight: '700' },
  wasActiveBadge: { backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  wasActiveBadgeText: { fontSize: 10, color: '#6366f1', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  paginationModal: { width: '100%', maxHeight: '60%', borderRadius: 24, borderWidth: 1, padding: 20, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  rangeList: { marginHorizontal: -5 },
  rangeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 15, borderRadius: 12, marginBottom: 5 },
  rangeText: { fontSize: 15, fontWeight: '600' },
});

export default StudentList;
