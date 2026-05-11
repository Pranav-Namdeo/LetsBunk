import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

const StudentSearch = ({ theme, students = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredStudents, setFilteredStudents] = useState([]);

  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (query.trim() === '') {
      setFilteredStudents([]);
      return;
    }

    const filtered = students.filter(
      (student) =>
        student.name?.toLowerCase().includes(query.toLowerCase()) ||
        student.enrollmentNo?.toLowerCase().includes(query.toLowerCase()) ||
        student.rollNo?.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredStudents(filtered);
  };

  const getStatusBadge = (status) => {
    const isPresent = status === 'active' || status === 'present' || status === 'attending';
    return {
      text: isPresent ? 'Present' : 'Absent',
      color: isPresent ? '#10b981' : '#ef4444',
      bgColor: isPresent ? '#d1fae5' : '#fee2e2',
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search student by name or roll number..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      {/* Search Results */}
      {searchQuery && (
        <View style={[styles.resultsContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          {filteredStudents.length > 0 ? (
            <ScrollView style={styles.resultsList}>
              {filteredStudents.map((student, index) => {
                const badge = getStatusBadge(student.status);
                return (
                  <View
                    key={student._id || student.id || index}
                    style={[
                      styles.resultItem,
                      index < filteredStudents.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }
                    ]}
                  >
                    <View style={styles.studentInfo}>
                      <Text style={[styles.studentName, { color: theme.text }]}>
                        {student.name}
                      </Text>
                      <Text style={[styles.studentRoll, { color: theme.textSecondary }]}>
                        Roll No: {student.enrollmentNo || student.rollNo || 'N/A'}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.bgColor }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>
                        {badge.text}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.noResults}>
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                No students found
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    maxWidth: 672, // 2xl
    alignSelf: 'center',
    width: '100%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4, // rounded (default)
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  searchIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  resultsContainer: {
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultsList: {
    maxHeight: 400,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '500',
  },
  studentRoll: {
    fontSize: 14,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noResults: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
  },
});

export default StudentSearch;
