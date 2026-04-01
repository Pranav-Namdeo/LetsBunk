import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';

const StudentProfileDialog = ({ visible, onClose, theme, student }) => {
  if (!student) return null;

  // Debug: Log student data to check photoUrl
  console.log('🔍 StudentProfileDialog - Student data:', {
    name: student.name,
    photoUrl: student.photoUrl,
    hasPhotoUrl: !!student.photoUrl,
    allKeys: Object.keys(student)
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[styles.container, { backgroundColor: theme.cardBackground }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  Student Profile
                </Text>
                <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                  View student information and attendance details
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Photo */}
            <View style={styles.profileSection}>
              <View style={[styles.profileImageContainer, { borderColor: theme.primary }]}>
                {student.photoUrl ? (
                  <Image
                    source={{ uri: student.photoUrl }}
                    style={styles.profileImage}
                    onError={(e) => {
                      console.log('❌ Student profile photo error:', e.nativeEvent.error);
                      console.log('📸 Attempted URL:', student.photoUrl);
                    }}
                    onLoad={() => console.log('✅ Student profile photo loaded successfully')}
                  />
                ) : (
                  <View style={[styles.profileImage, styles.placeholderImage, { backgroundColor: theme.primary + '20' }]}>
                    <Text style={[styles.placeholderText, { color: theme.primary }]}>
                      {student.name ? student.name.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Student Information */}
            <View style={styles.infoSection}>
              {/* Name */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Name
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {student.name}
                </Text>
              </View>

              {/* Enrollment Number */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Enrollment Number
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {student.rollNo || student.enrollmentNo || 'N/A'}
                </Text>
              </View>

              {/* Email */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Email
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {student.email || 'N/A'}
                </Text>
              </View>

              {/* Branch */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Branch
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {student.branch || student.course || 'N/A'}
                </Text>
              </View>

              {/* Semester */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Semester
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {student.semester || 'N/A'}
                </Text>
              </View>

              {/* Attendance Percentage */}
              <View style={styles.infoItem}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  Attendance Percentage
                </Text>
                <View style={styles.attendanceCircle}>
                  <View style={[styles.attendanceCircleInner, { backgroundColor: theme.primary + '20' }]}>
                    <Text style={[styles.attendanceText, { color: theme.primary }]}>
                      {student.attendancePercentage || 0}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 448, // sm:max-w-md
    borderRadius: 12, // default dialog radius
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImageContainer: {
    borderWidth: 4,
    borderRadius: 64,
    padding: 2,
  },
  profileImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  infoSection: {
    gap: 16,
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  attendanceCircle: {
    marginTop: 8,
    alignItems: 'center',
  },
  attendanceCircleInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendanceText: {
    fontSize: 24,
    fontWeight: '600',
  },
});

export default StudentProfileDialog;
