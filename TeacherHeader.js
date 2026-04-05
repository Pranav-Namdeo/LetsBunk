import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';

const TeacherHeader = ({ 
  userData, 
  isDark, 
  onToggleTheme, 
  theme,
  onViewRecords,
  onNotification,
  onUpdates,
  onHelpAndSupport,
  onFeedback,
  onLogout
}) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const menuItems = [
    { id: 1, label: 'View Records', icon: '📄', onPress: onViewRecords },
    { id: 2, label: 'Notifications', icon: '🔔', onPress: onNotification },
    { id: 3, label: 'Updates', icon: '🔄', onPress: onUpdates },
    { id: 4, label: 'Help & Support', icon: '❓', onPress: onHelpAndSupport },
    { id: 5, label: 'Feedback', icon: '💬', onPress: onFeedback },
    { id: 6, label: 'Settings', icon: '⚙️', onPress: () => setSettingsVisible(true) },
  ];

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground }]}>
        {/* Profile Photo */}
        <TouchableOpacity onPress={() => setProfileVisible(true)}>
          {userData?.photoUrl ? (
            <Image
              source={{ uri: userData.photoUrl }}
              style={styles.profileImage}
            />
          ) : (
            <View style={[styles.profileImage, { backgroundColor: theme.primary }]}>
              <Text style={styles.initialsText}>
                {getInitials(userData?.name || 'Teacher')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* App Name */}
        <Text style={[styles.appName, { color: theme.text }]}>
          LetsBunk
        </Text>

        {/* Theme Toggle */}
        <TouchableOpacity
          onPress={onToggleTheme}
          style={styles.themeButton}
        >
          <Text style={{ fontSize: 20 }}>
            {isDark ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>

        {/* Menu Button */}
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Text style={{ fontSize: 24, color: theme.text }}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuContainer, { backgroundColor: theme.cardBackground }]}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  index < menuItems.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  },
                ]}
                onPress={() => {
                  setMenuVisible(false);
                  if (item.onPress) {
                    item.onPress();
                  }
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>{item.icon}</Text>
                <Text style={[styles.menuText, { color: theme.text }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Modal */}
      <Modal
        visible={profileVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.profileModal, { backgroundColor: theme.cardBackground }]}>
            <View style={[styles.profileHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.profileTitle, { color: theme.text }]}>
                Teacher Profile
              </Text>
              <TouchableOpacity onPress={() => setProfileVisible(false)}>
                <Text style={{ fontSize: 24, color: theme.text }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.profileContent}>
              <View style={styles.profileImageContainer}>
                {userData?.photoUrl ? (
                  <Image
                    source={{ uri: userData.photoUrl }}
                    style={styles.profileImageLarge}
                  />
                ) : (
                  <View style={[styles.profileImageLarge, { backgroundColor: theme.primary }]}>
                    <Text style={[styles.initialsText, { fontSize: 40 }]}>
                      {getInitials(userData?.name || 'Teacher')}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.profileInfo}>
                <Text style={[styles.teacherName, { color: theme.text }]}>
                  {userData?.name || 'Teacher'}
                </Text>
                <Text style={[styles.teacherDept, { color: theme.textSecondary }]}>
                  {userData?.department || 'Department'}
                </Text>
              </View>

              <View style={[styles.infoSection, { borderTopColor: theme.border }]}>
                <View style={styles.infoRow}>
                  <Text style={{ fontSize: 18, marginRight: 12 }}>📧</Text>
                  <Text style={[styles.infoText, { color: theme.text }]}>
                    {userData?.email || 'N/A'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ fontSize: 18, marginRight: 12 }}>🆔</Text>
                  <Text style={[styles.infoText, { color: theme.text }]}>
                    {userData?.employeeId || 'N/A'}
                  </Text>
                </View>
              </View>

              {userData?.subject && (
                <View style={styles.subjectsSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Subject Teaching
                  </Text>
                  <View style={[styles.subjectChip, { backgroundColor: theme.primary + '20' }]}>
                    <Text style={[styles.subjectText, { color: theme.primary }]}>
                      {userData.subject}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        >
          <View
            style={[styles.settingsModal, { backgroundColor: theme.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.settingsHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.settingsTitle, { color: theme.text }]}>
                Settings & Tools
              </Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={{ fontSize: 24, color: theme.text }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsContent}>
              {/* Theme Toggle */}
              <TouchableOpacity
                onPress={() => {
                  onToggleTheme();
                }}
                style={[styles.settingsItem, { borderBottomColor: theme.border }]}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>
                  {isDark ? '☀️' : '🌙'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsItemTitle, { color: theme.text }]}>
                    Theme
                  </Text>
                  <Text style={[styles.settingsItemDesc, { color: theme.textSecondary }]}>
                    {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Logout */}
              {onLogout && (
                <TouchableOpacity
                  onPress={() => {
                    setSettingsVisible(false);
                    if (onLogout) {
                      onLogout();
                    }
                  }}
                  style={styles.settingsItem}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>🚪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingsItemTitle, { color: '#ef4444' }]}>
                      Logout
                    </Text>
                    <Text style={[styles.settingsItemDesc, { color: theme.textSecondary }]}>
                      Sign out of your account
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24, // 6 × 4 = 24 (px-6)
    paddingVertical: 16,   // 4 × 4 = 16 (py-4)
    paddingTop: 48,
  },
  profileImage: {
    width: 48,  // 12 × 4 = 48 (w-12)
    height: 48, // 12 × 4 = 48 (h-12)
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    marginLeft: 12,
  },
  themeButton: {
    padding: 8,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    position: 'absolute',
    top: 100,
    right: 16,
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuText: {
    fontSize: 16,
  },
  profileModal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  profileContent: {
    padding: 20,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImageLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  teacherName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  teacherDept: {
    fontSize: 16,
  },
  infoSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 16,
  },
  subjectsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  subjectChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  subjectText: {
    fontSize: 14,
    fontWeight: '500',
  },
  settingsModal: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  settingsContent: {
    padding: 8,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingsItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingsItemDesc: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default TeacherHeader;
