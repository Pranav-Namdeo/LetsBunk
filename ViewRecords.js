import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SOCKET_URL } from './config';

// Mock student data generator (same as HTML version)
const generateStudents = (semester, branch) => {
  const branchCode = branch.split(' - ')[0];
  const students = [
    {
      names: ['Aarav Sharma', 'Priya Patel', 'Rohan Kumar', 'Ananya Singh'],
      images: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
      ],
      statuses: ['active', 'present', 'absent', 'left'],
    },
    {
      names: ['Vikram Desai', 'Sneha Reddy', 'Kabir Malhotra', 'Diya Gupta'],
      images: [
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      ],
      statuses: ['present', 'active', 'present', 'active'],
    },
    {
      names: ['Arjun Verma', 'Meera Iyer', 'Aditya Joshi', 'Ishita Nair'],
      images: [
        'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400',
        'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400',
        'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400',
        'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400',
      ],
      statuses: ['active', 'present', 'left', 'present'],
    },
  ];

  const result = [];
  const groupIndex = (semester - 1) % 3;
  const group = students[groupIndex];

  for (let i = 0; i < group.names.length; i++) {
    result.push({
      id: semester * 1000 + i,
      name: group.names[i],
      rollNo: `${branchCode}${semester}${(i + 1).toString().padStart(3, '0')}`,
      status: group.statuses[i],
      profileImage: group.images[i],
      email: `${group.names[i].toLowerCase().replace(' ', '.')}@college.edu`,
      attendancePercentage: Math.floor(Math.random() * 30) + 70,
      semester,
      branch,
      joinTime: new Date(),
    });
  }

  return result;
};

const getStatusColor = (status) => {
  switch (status) {
    case 'active':
      return { bg: '#d1fae5', text: '#059669' };
    case 'present':
      return { bg: '#dbeafe', text: '#2563eb' };
    case 'absent':
      return { bg: '#fee2e2', text: '#dc2626' };
    case 'left':
      return { bg: '#fed7aa', text: '#ea580c' };
    default:
      return { bg: '#f3f4f6', text: '#6b7280' };
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'present':
      return 'Present';
    case 'absent':
      return 'Absent';
    case 'left':
      return 'Left Early';
    default:
      return 'Unknown';
  }
};

const ViewRecords = ({ onBack, theme }) => {
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  const semesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const branches = ['B.Tech Data Science', 'B.Tech Computer Science', 'B.Tech IT'];

  // Fetch students from server when semester and branch are selected
  useEffect(() => {
    if (selectedSemester && selectedBranch) {
      fetchStudents();
    } else {
      setStudents([]);
    }
  }, [selectedSemester, selectedBranch]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${SOCKET_URL}/api/view-records/students?semester=${selectedSemester}&branch=${encodeURIComponent(selectedBranch)}`
      );
      const data = await response.json();
      if (data.success) {
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentClick = (student) => {
    setSelectedStudent(student);
    // TODO: Open student profile dialog
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>View Records</Text>
        </View>
      </View>

      {/* Selection Section */}
      <View style={[styles.selectionSection, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <View style={styles.selectionGrid}>
          {/* Semester Select */}
          <View style={styles.selectContainer}>
            <Text style={[styles.selectLabel, { color: theme.textSecondary }]}>Select Semester</Text>
            <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Picker
                selectedValue={selectedSemester}
                onValueChange={(value) => setSelectedSemester(value)}
                style={[styles.picker, { color: theme.text }]}
              >
                <Picker.Item label="Choose semester" value="" />
                {semesters.map((sem) => (
                  <Picker.Item key={sem} label={`Semester ${sem}`} value={sem} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Branch Select */}
          <View style={styles.selectContainer}>
            <Text style={[styles.selectLabel, { color: theme.textSecondary }]}>Select Branch</Text>
            <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Picker
                selectedValue={selectedBranch}
                onValueChange={(value) => setSelectedBranch(value)}
                style={[styles.picker, { color: theme.text }]}
              >
                <Picker.Item label="Choose branch" value="" />
                {branches.map((branch) => (
                  <Picker.Item key={branch} label={branch} value={branch} />
                ))}
              </Picker>
            </View>
          </View>
        </View>
      </View>

      {/* Student List */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading students...
            </Text>
          </View>
        ) : selectedSemester && selectedBranch ? (
          <View style={styles.listContainer}>
            <View style={styles.listHeader}>
              <Text style={[styles.listTitle, { color: theme.text }]}>
                {selectedBranch} - Semester {selectedSemester}
              </Text>
              <Text style={[styles.listCount, { color: theme.textSecondary }]}>
                {students.length} Students
              </Text>
            </View>

            {students.length > 0 ? (
              students.map((student) => (
                <TouchableOpacity
                  key={student._id}
                  onPress={() => handleStudentClick(student)}
                  style={[styles.studentCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
                >
                  <View style={styles.profileImagePlaceholder}>
                    <Text style={styles.profileInitial}>
                      {student.name ? student.name.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>

                  <View style={styles.studentInfo}>
                    <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>
                      {student.name}
                    </Text>
                    <Text style={[styles.studentRoll, { color: theme.textSecondary }]}>
                      {student.enrollmentNo || 'N/A'}
                    </Text>
                  </View>

                  <View style={styles.studentStats}>
                    <Text style={[styles.attendanceText, { color: theme.primary }]}>
                      {student.attendancePercentage || 0}% Attendance
                    </Text>
                    <Text style={[styles.daysText, { color: theme.textSecondary }]}>
                      {student.presentDays || 0}/{student.totalDays || 0} days
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  No students found
                </Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  No students enrolled in this semester and branch
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.border }]}>
              <Text style={{ fontSize: 48, color: theme.textSecondary }}>📄</Text>
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No Selection Made
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Please select both semester and branch to view student records
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 48,
    gap: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  selectionSection: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: 1,
  },
  selectionGrid: {
    gap: 16,
  },
  selectContainer: {
    gap: 8,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  listContainer: {
    maxWidth: 768,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listCount: {
    fontSize: 14,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 16,
  },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  studentInfo: {
    flex: 1,
    minWidth: 0,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  studentRoll: {
    fontSize: 14,
  },
  studentStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  attendanceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  daysText: {
    fontSize: 12,
  },
  profileImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 384,
  },
});

export default ViewRecords;
