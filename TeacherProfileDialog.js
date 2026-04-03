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

const TeacherProfileDialog = ({ visible, onClose, theme, teacherData, onLogout, onChangePassword }) => {
  const defaultTeacherData = {
    name: teacherData?.name || 'Teacher Name',
    employeeId: teacherData?.employeeId || 'N/A',
    email: teacherData?.email || 'teacher@school.edu',
    profileImage: teacherData?.profileImage || teacherData?.profilePhoto || 'https://via.placeholder.com/96',
    department: teacherData?.department || 'N/A',
    phone: teacherData?.phone || 'N/A',
  };

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
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Teacher Profile
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Photo */}
            <View style={styles.profileSection}>
              <View style={[styles.profileImageContainer, { borderColor: theme.border }]}>
                <Image
                  source={{ uri: defaultTeacherData.profileImage }}
                  style={styles.profileImage}
                />
              </View>
            </View>

            {/* Teacher Information */}
            <View style={styles.infoSection}>
              <Text style={[styles.teacherName, { color: theme.text }]}>
                {defaultTeacherData.name}
              </Text>

              <View style={styles.infoCards}>
                <View style={[styles.infoCard, { backgroundColor: theme.background }]}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                    Employee ID
                  </Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>
                    {defaultTeacherData.employeeId}
                  </Text>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.background }]}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                    Email
                  </Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>
                    {defaultTeacherData.email}
                  </Text>
                </View>

                {defaultTeacherData.department !== 'N/A' && (
                  <View style={[styles.infoCard, { backgroundColor: theme.background }]}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                      Department
                    </Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>
                      {defaultTeacherData.department}
                    </Text>
                  </View>
                )}

                {defaultTeacherData.phone !== 'N/A' && (
                  <View style={[styles.infoCard, { backgroundColor: theme.background }]}>
                    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                      Phone
                    </Text>
                    <Text style={[styles.infoValue, { color: theme.text }]}>
                      {defaultTeacherData.phone}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Separator */}
            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            {/* Action Buttons */}
            <View style={styles.actionsSection}>
              {onChangePassword && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onChangePassword();
                  }}
                  style={[styles.actionButton, { borderColor: theme.border }]}
                >
                  <Text style={styles.actionIcon}>🔑</Text>
                  <Text style={[styles.actionText, { color: theme.text }]}>
                    Change Password
                  </Text>
                </TouchableOpacity>
              )}

              {onLogout && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onLogout();
                  }}
                  style={[styles.actionButton, styles.logoutButton]}
                >
                  <Text style={styles.actionIcon}>🚪</Text>
                  <Text style={styles.logoutText}>
                    Logout
                  </Text>
                </TouchableOpacity>
              )}
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
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
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
    borderRadius: 48,
    padding: 2,
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  infoSection: {
    marginBottom: 24,
  },
  teacherName: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoCards: {
    gap: 8,
  },
  infoCard: {
    borderRadius: 8,
    padding: 12,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    marginVertical: 24,
  },
  actionsSection: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default TeacherProfileDialog;
