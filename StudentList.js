import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Animated, Modal, ScrollView, PanResponder, Dimensions, ActivityIndicator } from 'react-native';
import FilterButtons from './FilterButtons';
import StudentSearch from './StudentSearch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const StudentList = ({ 
  theme, 
  students = [], 
  onStudentPress, 
  activeRandomRing = null, 
  onTeacherAction, 
  onManualMark,
  currentClassInfo = null,
  refreshControl 
}) => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isPaginationModalVisible, setIsPaginationModalVisible] = useState(false);
  
  const [manualMarkModal, setManualMarkModal] = useState({ visible: false, student: null });
  const [markingLoading, setMarkingLoading] = useState(false);

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
    let list = [...filteredStudents];
    
    const ringMap = activeRandomRing?.selectedStudents?.length ? new Map(
      activeRandomRing.selectedStudents.map(s => [s.enrollmentNo, s])
    ) : null;

    list.sort((a, b) => {
      // 1. Floating (random ring)
      if (ringMap) {
        const ra = ringMap.get(a.enrollmentNo);
        const rb = ringMap.get(b.enrollmentNo);
        const aIsFloating = ra && ra.teacherAction === 'pending' && !ra.verified;
        const bIsFloating = rb && rb.teacherAction === 'pending' && !rb.verified;
        if (aIsFloating && !bIsFloating) return -1;
        if (!aIsFloating && bIsFloating) return 1;
      }

      // 2. Manually marked
      const aIsManual = !!a.markedByName;
      const bIsManual = !!b.markedByName;
      if (aIsManual && !bIsManual) return -1;
      if (!aIsManual && bIsManual) return 1;

      // 3. Status priority (active > present > offline > absent)
      const statusWeight = { active: 0, present: 1, offline: 2, absent: 3 };
      const wa = statusWeight[a.status] || 4;
      const wb = statusWeight[b.status] || 4;
      if (wa !== wb) return wa - wb;

      // 4. Name alphabetical
      return (a.name || '').localeCompare(b.name || '');
    });

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

  const handleConfirmManualMark = async (scope) => {
    if (!onManualMark || !manualMarkModal.student) return;
    
    setMarkingLoading(true);
    try {
      await onManualMark(manualMarkModal.student.enrollmentNo, scope);
      setManualMarkModal({ visible: false, student: null });
    } catch (error) {
      console.error('Manual mark failed:', error);
    } finally {
      setMarkingLoading(false);
    }
  };

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
        onPresentSwipe={() => setManualMarkModal({ visible: true, student })}
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

      {/* Manual Mark Scope Modal */}
      <Modal
        visible={manualMarkModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setManualMarkModal({ visible: false, student: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.choiceModal, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.choiceTitle, { color: theme.text }]}>Manual Attendance</Text>
            <Text style={[styles.choiceSub, { color: theme.textSecondary }]}>
              Mark {manualMarkModal.student?.name} as present
            </Text>
            
            <View style={styles.choiceOptions}>
              <TouchableOpacity 
                style={[styles.choiceBtn, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}
                onPress={() => handleConfirmManualMark('current')}
                disabled={markingLoading}
              >
                <Text style={{ fontSize: 24, marginBottom: 8 }}>📖</Text>
                <Text style={[styles.choiceBtnTitle, { color: theme.text }]}>Current Class</Text>
                <Text style={[styles.choiceBtnSub, { color: theme.textSecondary }]}>Mark only this lecture</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.choiceBtn, { backgroundColor: '#10b981' + '15', borderColor: '#10b981' + '30' }]}
                onPress={() => handleConfirmManualMark('allday')}
                disabled={markingLoading}
              >
                <Text style={{ fontSize: 24, marginBottom: 8 }}>☀️</Text>
                <Text style={[styles.choiceBtnTitle, { color: theme.text }]}>All Day</Text>
                <Text style={[styles.choiceBtnSub, { color: theme.textSecondary }]}>Mark all periods today</Text>
              </TouchableOpacity>
            </View>

            {markingLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
            ) : (
              <TouchableOpacity 
                style={styles.cancelBtn}
                onPress={() => setManualMarkModal({ visible: false, student: null })}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

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

const StudentItem = React.memo(({ 
  student, 
  theme, 
  index, 
  scrollY, 
  onPress, 
  randomRingStudent, 
  onTeacherAction, 
  randomRingId, 
  isFloating,
  onPresentSwipe
}) => {
  const [displaySecs, setDisplaySecs] = useState(student.timerValue || 0);
  const [actionLoading, setActionLoading] = useState(false);
  const intervalRef = useRef(null);
  const baseRef = useRef({ secs: student.timerValue || 0, ts: Date.now() });
  const staleCutoffRef = useRef(null);

  const slideAnim = useRef(new Animated.Value(isFloating ? -60 : 0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  
  // Swipe animation
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipedOut = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        // Only allow R2L swipe (negative dx)
        if (gestureState.dx < 0) {
          swipeX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -100) {
          // Trigger swipe reveal
          Animated.spring(swipeX, {
            toValue: -100,
            useNativeDriver: false,
            tension: 40,
            friction: 7
          }).start();
          swipedOut.current = true;
        } else {
          // Snap back
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: false,
            tension: 40,
            friction: 7
          }).start();
          swipedOut.current = false;
        }
      },
    })
  ).current;

  const resetSwipe = useCallback(() => {
    Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
    swipedOut.current = false;
  }, []);

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
      <View style={styles.swipeContainer}>
        {/* Swipe Actions (Behind) */}
        <View style={styles.swipeActionsBehind}>
          <TouchableOpacity 
            style={[styles.presentSwipeAction, { backgroundColor: '#10b981' }]}
            onPress={() => {
              onPresentSwipe && onPresentSwipe();
              resetSwipe();
            }}
          >
            <Text style={styles.swipeActionText}>Present</Text>
          </TouchableOpacity>
        </View>

        <Animated.View 
          style={[
            styles.studentCard,
            { backgroundColor: theme.cardBackground, borderColor: isFloating ? glowBorder : theme.border },
            { transform: [{ translateX: swipeX }] },
            isFloating && styles.floatingCard,
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <View style={styles.studentContent}>
              <Image
                source={{ uri: student.profileImage || student.profilePhoto || 'https://via.placeholder.com/56' }}
                style={styles.profileImage}
              />
              <View style={styles.studentInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{student.name}</Text>
                  {student.markedByName && (
                    <View style={[styles.manualBadge, { backgroundColor: theme.primary + '15' }]}>
                      <Text style={[styles.manualBadgeText, { color: theme.primary }]}>👨‍🏫 By {student.markedByName}</Text>
                    </View>
                  )}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>{getStatusLabel(student.status)}</Text>
                  </View>
                  {student.manualReason && (
                    <Text style={[styles.manualReason, { color: theme.textSecondary }]} numberOfLines={1}>
                      "{student.manualReason}"
                    </Text>
                  )}
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
      </View>
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
  
  swipeContainer: { position: 'relative', overflow: 'hidden', borderRadius: 16, marginBottom: 14 },
  swipeActionsBehind: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, flexDirection: 'row', justifyContent: 'flex-end', borderRadius: 16 },
  presentSwipeAction: { width: 100, height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
  swipeActionText: { color: 'white', fontWeight: '800', fontSize: 13 },

  studentCard: { borderRadius: 16, padding: 14, borderWidth: 1.5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  floatingCard: { borderWidth: 2, elevation: 8, shadowOpacity: 0.15, shadowRadius: 12 },
  studentContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileImage: { width: 52, height: 52, borderRadius: 16 },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
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
  
  manualBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  manualBadgeText: { fontSize: 10, fontWeight: '700' },
  manualReason: { fontSize: 11, fontStyle: 'italic', maxWidth: 120 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  paginationModal: { width: '100%', maxHeight: '60%', borderRadius: 24, borderWidth: 1, padding: 20, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  rangeList: { marginHorizontal: -5 },
  rangeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 15, borderRadius: 12, marginBottom: 5 },
  rangeText: { fontSize: 15, fontWeight: '600' },

  choiceModal: { width: '100%', maxWidth: 400, borderRadius: 28, padding: 24, alignItems: 'center', elevation: 25 },
  choiceTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  choiceSub: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  choiceOptions: { flexDirection: 'row', gap: 16, width: '100%' },
  choiceBtn: { flex: 1, padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1.5 },
  choiceBtnTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  choiceBtnSub: { fontSize: 11, textAlign: 'center', opacity: 0.8 },
  cancelBtn: { marginTop: 24, paddingVertical: 10, paddingHorizontal: 30 },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
});

export default StudentList;
