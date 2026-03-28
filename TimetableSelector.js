import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';

const TimetableSelector = ({ theme, onSelect, isStudent = false }) => {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [semesterDropdownOpen, setSemesterDropdownOpen] = useState(false);

  // Real branches from database
  const branches = [
    { id: 'B.Tech Data Science', name: 'Data Science', icon: '📊' },
    { id: 'B.Tech Computer Science', name: 'Computer Science', icon: '💻' },
    { id: 'B.Tech IT', name: 'Information Technology', icon: '🖥️' },
    { id: 'B.Tech ECE', name: 'Electronics & Communication', icon: '📡' },
    { id: 'B.Tech Mechanical', name: 'Mechanical Engineering', icon: '⚙️' },
    { id: 'B.Tech Civil', name: 'Civil Engineering', icon: '🏗️' },
  ];

  const semesters = [
    { id: '1', name: '1st Semester' },
    { id: '2', name: '2nd Semester' },
    { id: '3', name: '3rd Semester' },
    { id: '4', name: '4th Semester' },
    { id: '5', name: '5th Semester' },
    { id: '6', name: '6th Semester' },
    { id: '7', name: '7th Semester' },
    { id: '8', name: '8th Semester' },
  ];

  const handleBranchSelect = (branchId) => {
    setSelectedBranch(branchId);
    setBranchDropdownOpen(false);
  };

  const handleSemesterSelect = (semesterId) => {
    setSelectedSemester(semesterId);
    setSemesterDropdownOpen(false);
  };

  const handleSubmit = () => {
    if (selectedBranch && selectedSemester && onSelect) {
      onSelect(selectedBranch, selectedSemester);
    }
  };

  const getSelectedBranchName = () => {
    const branch = branches.find((b) => b.id === selectedBranch);
    return branch ? `${branch.icon} ${branch.name}` : 'Select Branch';
  };

  const getSelectedSemesterName = () => {
    const semester = semesters.find((s) => s.id === selectedSemester);
    return semester ? semester.name : 'Select Semester';
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerIcon}>{isStudent ? '👤' : '🎓'}</Text>
          <Text style={styles.headerTitle}>
            {isStudent ? 'Your Timetable' : 'Select Timetable'}
          </Text>
        </View>
        <Text style={styles.headerSubtitle}>
          {isStudent 
            ? 'Select your branch and semester to view your personal timetable'
            : 'Choose your branch and semester to view the timetable'
          }
        </Text>
      </View>

      {/* Branch Selection */}
      <View style={styles.section}>
        <View style={styles.labelContainer}>
          <Text style={styles.labelIcon}>📚</Text>
          <Text style={[styles.label, { color: theme.text }]}>Branch</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setBranchDropdownOpen(true);
            setSemesterDropdownOpen(false);
          }}
          style={[
            styles.selector,
            {
              borderColor: selectedBranch ? theme.primary : theme.border,
              backgroundColor: selectedBranch ? theme.primary + '10' : theme.cardBackground,
            },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              { color: selectedBranch ? theme.primary : theme.textSecondary },
            ]}
          >
            {getSelectedBranchName()}
          </Text>
          <Text style={[styles.chevron, { color: selectedBranch ? theme.primary : theme.textSecondary }]}>
            ▼
          </Text>
        </TouchableOpacity>
      </View>

      {/* Semester Selection */}
      <View style={styles.section}>
        <View style={styles.labelContainer}>
          <Text style={styles.labelIcon}>🎓</Text>
          <Text style={[styles.label, { color: theme.text }]}>Semester</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setSemesterDropdownOpen(true);
            setBranchDropdownOpen(false);
          }}
          style={[
            styles.selector,
            {
              borderColor: selectedSemester ? theme.primary : theme.border,
              backgroundColor: selectedSemester ? theme.primary + '10' : theme.cardBackground,
            },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              { color: selectedSemester ? theme.primary : theme.textSecondary },
            ]}
          >
            {getSelectedSemesterName()}
          </Text>
          <Text style={[styles.chevron, { color: selectedSemester ? theme.primary : theme.textSecondary }]}>
            ▼
          </Text>
        </TouchableOpacity>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!selectedBranch || !selectedSemester}
        style={[
          styles.submitButton,
          {
            backgroundColor: theme.primary,
            opacity: !selectedBranch || !selectedSemester ? 0.5 : 1,
          },
        ]}
      >
        <Text style={styles.submitButtonText}>
          {isStudent ? 'View My Timetable' : 'View Timetable'}
        </Text>
        <Text style={styles.submitButtonIcon}>▶</Text>
      </TouchableOpacity>

      {(!selectedBranch || !selectedSemester) && (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Please select both branch and semester to continue
        </Text>
      )}

      {/* Branch Dropdown Modal */}
      <Modal
        visible={branchDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBranchDropdownOpen(false)}
        >
          <View style={[styles.dropdown, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <ScrollView>
              {branches.map((branch) => (
                <TouchableOpacity
                  key={branch.id}
                  onPress={() => handleBranchSelect(branch.id)}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                >
                  <Text style={styles.branchIcon}>{branch.icon}</Text>
                  <View style={styles.branchInfo}>
                    <Text style={[styles.branchName, { color: theme.text }]}>
                      {branch.name}
                    </Text>
                    <Text style={[styles.branchCode, { color: theme.textSecondary }]}>
                      {branch.id.toUpperCase()}
                    </Text>
                  </View>
                  {selectedBranch === branch.id && (
                    <Text style={[styles.checkmark, { color: theme.primary }]}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Semester Dropdown Modal */}
      <Modal
        visible={semesterDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSemesterDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSemesterDropdownOpen(false)}
        >
          <View style={[styles.dropdown, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <ScrollView>
              {semesters.map((semester) => (
                <TouchableOpacity
                  key={semester.id}
                  onPress={() => handleSemesterSelect(semester.id)}
                  style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                >
                  <Text style={[styles.semesterName, { color: theme.text }]}>
                    {semester.name}
                  </Text>
                  {selectedSemester === semester.id && (
                    <Text style={[styles.checkmark, { color: theme.primary }]}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  section: {
    marginBottom: 24,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  labelIcon: {
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  selectorText: {
    fontSize: 16,
    flex: 1,
  },
  chevron: {
    fontSize: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,   // py-4 = 16px
    paddingHorizontal: 24, // px-6 = 24px
    borderRadius: 8,
    gap: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonIcon: {
    color: '#ffffff',
    fontSize: 16,
  },
  hint: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdown: {
    width: '100%',
    maxWidth: 400,
    maxHeight: 400,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  branchIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  branchInfo: {
    flex: 1,
  },
  branchName: {
    fontSize: 16,
    fontWeight: '500',
  },
  branchCode: {
    fontSize: 12,
    marginTop: 2,
  },
  semesterName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  checkmark: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default TimetableSelector;
