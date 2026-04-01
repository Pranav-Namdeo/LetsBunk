import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator
} from 'react-native';
import { UserIcon, ChartIcon, SettingsIcon, LogoutIcon, SunIcon, MoonIcon, RefreshIcon, SchoolIcon } from './Icons';

export default function ProfileScreen({
  theme,
  userData,
  onLogout,
  onThemeToggle,
  themeMode,
  socketUrl
}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [userData]);

  const fetchStats = async () => {
    if (!userData?._id) {
      console.log('⚠️ No user ID for stats');
      setLoading(false);
      return;
    }

    console.log('📊 Fetching stats for student:', userData._id);
    try {
      const url = `${socketUrl}/api/attendance/stats?studentId=${userData._id}`;
      console.log('📡 Fetching from:', url);

      const response = await fetch(url);
      const data = await response.json();

      console.log('📈 Stats received:', data);

      if (data.success) {
        setStats(data.stats);
        console.log('✅ Stats loaded:', data.stats);
      } else {
        console.log('❌ Failed to fetch stats:', data);
      }
    } catch (error) {
      console.log('❌ Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getThemeIcon = () => {
    if (themeMode === 'system') return RefreshIcon;
    if (themeMode === 'light') return SunIcon;
    return MoonIcon;
  };

  const getThemeLabel = () => {
    if (themeMode === 'system') return 'System';
    if (themeMode === 'light') return 'Light';
    return 'Dark';
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <UserIcon size={28} color={theme.primary} />
          <Text style={[styles.title, { color: theme.primary }]}>Profile</Text>
        </View>
      </View>

      {/* Profile Card */}
      <View style={[styles.profileCard, {
        backgroundColor: theme.cardBackground,
        borderColor: theme.border
      }]}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {userData?.photoUrl ? (
            <Image
              source={{ uri: userData.photoUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{getInitials(userData?.name)}</Text>
            </View>
          )}
        </View>

        {/* User Info */}
        <Text style={[styles.userName, { color: theme.text }]}>{userData?.name}</Text>
        <View style={styles.roleRow}>
          <SchoolIcon size={16} color={theme.textSecondary} />
          <Text style={[styles.userRole, { color: theme.textSecondary }]}>
            {userData?.role === 'student' ? 'Student' : 'Teacher'}
          </Text>
        </View>

        {/* Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Enrollment No:</Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>
              {userData?.enrollmentNo || 'N/A'}
            </Text>
          </View>

          {userData?.role === 'student' && (
            <>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Course:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}> 
                  {userData?.course || userData?.branch || 'N/A'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Semester:</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {userData?.semester || 'N/A'}
                </Text>
              </View>
            </>
          )}

          {userData?.role === 'teacher' && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Department:</Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>
                {userData?.department || 'N/A'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats Card (Students Only) */}
      {userData?.role === 'student' && (
        <View style={[styles.statsCard, {
          backgroundColor: theme.cardBackground,
          borderColor: theme.border
        }]}>
          <View style={styles.sectionTitleRow}>
            <ChartIcon size={20} color={theme.text} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Attendance Stats</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 20 }} />
          ) : stats ? (
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: '#10b981' }]}>{stats.present || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Present</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: '#ef4444' }]}>{stats.absent || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Absent</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.primary }]}>
                  {stats.percentage || 0}%
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Rate</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.noData, { color: theme.textSecondary }]}>
              No attendance data available
            </Text>
          )}
        </View>
      )}

      {/* Settings Card */}
      <View style={[styles.settingsCard, {
        backgroundColor: theme.cardBackground,
        borderColor: theme.border
      }]}>
        <View style={styles.sectionTitleRow}>
          <SettingsIcon size={20} color={theme.text} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Settings</Text>
        </View>

        <TouchableOpacity
          style={[styles.settingItem, { borderBottomColor: theme.border }]}
          onPress={onThemeToggle}
        >
          <View style={styles.settingLeft}>
            <View style={styles.settingIconContainer}>
              {React.createElement(getThemeIcon(), { size: 20, color: theme.text })}
            </View>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Theme</Text>
          </View>
          <Text style={[styles.settingValue, { color: theme.textSecondary }]}>
            {getThemeLabel()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={onLogout}
        >
          <View style={styles.settingLeft}>
            <View style={styles.settingIconContainer}>
              <LogoutIcon size={20} color="#ef4444" />
            </View>
            <Text style={[styles.settingLabel, { color: '#ef4444' }]}>Logout</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={[styles.appInfoText, { color: theme.textSecondary }]}>
          College Attendance App v1.0.0
        </Text>
        <Text style={[styles.appInfoText, { color: theme.textSecondary }]}>
          Made with love for students
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileCard: {
    margin: 20,
    marginTop: 10,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  userRole: {
    fontSize: 14,
  },
  detailsContainer: {
    width: '100%',
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statsCard: {
    margin: 20,
    marginTop: 0,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  noData: {
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
  settingsCard: {
    margin: 20,
    marginTop: 0,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconContainer: {
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
  },
  settingValue: {
    fontSize: 14,
  },
  appInfo: {
    alignItems: 'center',
    padding: 20,
    marginBottom: 100,
  },
  appInfoText: {
    fontSize: 12,
    marginBottom: 4,
  },
});
