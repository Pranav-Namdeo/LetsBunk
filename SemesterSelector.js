import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from './config';

const CACHE_KEY = '@semester_branch_data';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const SemesterSelector = ({ 
  visible, 
  onClose, 
  onSelect, 
  currentSelection,
  theme,
  isStudent = false
}) => {
  const [semesters, setSemesters] = useState([
    { value: 'auto', label: '📚 Current Lecture (Auto)', description: 'Based on timetable' },
  ]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slideAnim] = useState(new Animated.Value(0));

  // Fetch semesters and branches from API with caching
  useEffect(() => {
    if (visible) {
      loadData();
      // Animate modal entrance
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from cache first
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;

        // Use cached data if it's fresh
        if (age < CACHE_DURATION) {
          console.log('📦 Using cached semester/branch data');
          setSemesters([
            { value: 'auto', label: '📚 Current Lecture (Auto)', description: 'Based on timetable' },
            ...data.semesters
          ]);
          setBranches(data.branches);
          setLoading(false);
          return;
        }
      }

      // Fetch fresh data from API
      console.log('🌐 Fetching semester/branch data from API...');
      
      // Fetch branches and semesters separately
      const [branchesResponse, semestersResponse] = await Promise.all([
        fetch(`${SOCKET_URL}/api/config/branches`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${SOCKET_URL}/api/config/semesters`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      ]);

      if (!branchesResponse.ok || !semestersResponse.ok) {
        throw new Error(`HTTP ${branchesResponse.status} / ${semestersResponse.status}`);
      }

      const branchesResult = await branchesResponse.json();
      const semestersResult = await semestersResponse.json();

      if (branchesResult.success && semestersResult.success) {
        // Transform semesters data (API returns array of strings like ['1', '2', '3'])
        const semesterData = (semestersResult.semesters || []).map(sem => ({
          value: sem.toString(),
          label: `Semester ${sem}`,
          description: `${getOrdinal(sem)} semester`
        }));

        // Transform branches data (API returns array of objects with value, name, displayName)
        const branchData = (branchesResult.branches || []).map(branch => ({
          value: branch.value || branch.name,
          label: branch.displayName || branch.name
        }));

        // Update state
        setSemesters([
          { value: 'auto', label: '📚 Current Lecture (Auto)', description: 'Based on timetable' },
          ...semesterData
        ]);
        setBranches(branchData);

        // Cache the data
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          data: { semesters: semesterData, branches: branchData },
          timestamp: Date.now()
        }));

        console.log('✅ Semester/branch data loaded and cached');
        console.log(`📊 Loaded ${semesterData.length} semesters and ${branchData.length} branches`);
      } else {
        throw new Error('Failed to load data from API');
      }
    } catch (err) {
      console.error('❌ Error loading semester/branch data:', err);
      setError(err.message);

      // Fallback to hardcoded data if API fails
      console.log('⚠️ Using fallback hardcoded data');
      setSemesters([
        { value: 'auto', label: '📚 Current Lecture (Auto)', description: 'Based on timetable' },
        { value: '1', label: 'Semester 1', description: 'First semester' },
        { value: '2', label: 'Semester 2', description: 'Second semester' },
        { value: '3', label: 'Semester 3', description: 'Third semester' },
        { value: '4', label: 'Semester 4', description: 'Fourth semester' },
        { value: '5', label: 'Semester 5', description: 'Fifth semester' },
        { value: '6', label: 'Semester 6', description: 'Sixth semester' },
        { value: '7', label: 'Semester 7', description: 'Seventh semester' },
        { value: '8', label: 'Semester 8', description: 'Eighth semester' },
      ]);
      setBranches([
        { value: 'B.Tech Data Science', label: 'Data Science (DS)' },
        { value: 'B.Tech Computer Science', label: 'Computer Science (CS)' },
        { value: 'B.Tech Information Technology', label: 'Information Technology (IT)' },
        { value: 'B.Tech Electronics', label: 'Electronics (EC)' },
        { value: 'B.Tech Mechanical', label: 'Mechanical (ME)' },
        { value: 'B.Tech Civil', label: 'Civil (CE)' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getOrdinal = (num) => {
    const n = parseInt(num);
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Memoize filtered data for performance
  const displaySemesters = useMemo(() => semesters, [semesters]);
  const displayBranches = useMemo(() => branches, [branches]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const modalTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.modalOverlay, { opacity: backdropOpacity }]}>
        <TouchableOpacity 
          style={styles.backdropTouchable} 
          activeOpacity={1} 
          onPress={handleClose}
        />
      </Animated.View>
      
      <Animated.View 
        style={[
          styles.modalContainer, 
          { 
            backgroundColor: theme.card,
            transform: [{ translateY: modalTranslateY }]
          }
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.dragIndicator} />
          <View style={styles.headerContent}>
            <Text style={[styles.title, { color: theme.text }]}>
              {isStudent ? '🎓 Your Class' : '📚 Select Class'}
            </Text>
            {isStudent && (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Choose your branch and semester
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* Loading State */}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading options...
              </Text>
            </View>
          )}

          {/* Error State */}
          {error && !loading && (
            <View style={[styles.errorContainer, { backgroundColor: theme.primary + '15' }]}>
              <Text style={[styles.errorIcon, { color: theme.primary }]}>⚠️</Text>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>
                Using offline data
              </Text>
            </View>
          )}

          {/* Content */}
          {!loading && (
            <>
              {/* Semester Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  📅 Semester
                </Text>
                <View style={styles.gridContainer}>
                  {displaySemesters.map((sem, index) => (
                    <TouchableOpacity
                      key={sem.value}
                      style={[
                        styles.gridOption,
                        sem.value === 'auto' && styles.autoOption,
                        { 
                          backgroundColor: currentSelection?.semester === sem.value 
                            ? theme.primary 
                            : theme.background,
                          borderColor: currentSelection?.semester === sem.value
                            ? theme.primary
                            : theme.border
                        }
                      ]}
                      onPress={() => {
                        onSelect({ ...currentSelection, semester: sem.value });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.gridLabel, 
                        { 
                          color: currentSelection?.semester === sem.value 
                            ? '#fff' 
                            : theme.text 
                        }
                      ]}>
                        {sem.value === 'auto' ? '🎯' : sem.value}
                      </Text>
                      {sem.value === 'auto' && (
                        <Text style={[
                          styles.autoText,
                          { color: currentSelection?.semester === sem.value ? '#fff' : theme.textSecondary }
                        ]}>
                          Auto
                        </Text>
                      )}
                      {currentSelection?.semester === sem.value && (
                        <View style={styles.checkmark}>
                          <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Branch Selection (only if not auto) */}
              {currentSelection?.semester !== 'auto' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    🎓 Branch
                  </Text>
                  {displayBranches.map((branch) => (
                    <TouchableOpacity
                      key={branch.value}
                      style={[
                        styles.listOption,
                        { 
                          backgroundColor: currentSelection?.branch === branch.value 
                            ? theme.primary + '20' 
                            : theme.background,
                          borderColor: currentSelection?.branch === branch.value
                            ? theme.primary
                            : theme.border
                        }
                      ]}
                      onPress={() => {
                        onSelect({ ...currentSelection, branch: branch.value });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.listOptionContent}>
                        <Text style={[
                          styles.listLabel, 
                          { 
                            color: currentSelection?.branch === branch.value 
                              ? theme.primary 
                              : theme.text 
                          }
                        ]}>
                          {branch.label}
                        </Text>
                      </View>
                      {currentSelection?.branch === branch.value && (
                        <View style={[styles.selectedIndicator, { backgroundColor: theme.primary }]}>
                          <Text style={styles.selectedIndicatorText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Apply Button */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: theme.primary }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.applyButtonText}>
              {isStudent ? '✓ View My Timetable' : '✓ Apply Selection'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdropTouchable: {
    flex: 1,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  dragIndicator: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 2,
  },
  headerContent: {
    flex: 1,
    marginRight: 16,
    marginTop: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  closeButton: {
    padding: 8,
    marginTop: 12,
  },
  closeText: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridOption: {
    width: '22%',
    aspectRatio: 1,
    margin: '1.5%',
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  autoOption: {
    width: '47%',
  },
  gridLabel: {
    fontSize: 24,
    fontWeight: '700',
  },
  autoText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  listOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  listOptionContent: {
    flex: 1,
  },
  listLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicatorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    gap: 8,
  },
  errorIcon: {
    fontSize: 18,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  applyButton: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default SemesterSelector;
