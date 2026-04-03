import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { BellIcon, CheckIcon, ClockIcon } from './Icons';
import { getServerTime } from './ServerTime';

export default function NotificationsScreen({ theme, userData, socketUrl }) {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [inAppNotification, setInAppNotification] = useState(null);
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    if (userData?.role === 'teacher') {
      fetchTodaySchedule();
      
      // Auto-refresh every minute
      const interval = setInterval(() => {
        fetchTodaySchedule();
      }, 60000); // 60 seconds
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [userData]);

  const fetchTodaySchedule = async () => {
    try {
      // Use server time to get current day
      let today, currentDay;
      try {
        const serverTime = getServerTime();
        today = serverTime.nowDate();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        currentDay = dayNames[today.getDay()];
      } catch {
        today = new Date();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        currentDay = dayNames[today.getDay()];
      }

      // Fetch all timetables and filter by teacher
      const response = await fetch(`${socketUrl}/api/teacher-schedule/${userData.employeeId}/${currentDay}`);
      const data = await response.json();

      if (data.success) {
        const schedule = data.schedule || [];
        setTodaySchedule(schedule);
        
        // Generate notifications for today's schedule
        if (schedule.length > 0) {
          generateNotifications(schedule);
        }
      }
    } catch (error) {
      console.log('Error fetching schedule:', error);
    }
  };

  const showInAppNotification = (content) => {
    setInAppNotification(content);
    
    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
    
    // Auto hide after 5 seconds
    setTimeout(() => {
      hideInAppNotification();
    }, 5000);
  };

  const hideInAppNotification = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setInAppNotification(null);
    });
  };

  const generateNotifications = (schedule) => {
    // Use server time for notifications
    let now, currentHour, currentMinute, currentTime;
    try {
      const serverTime = getServerTime();
      now = serverTime.nowDate();
      currentHour = now.getHours();
      currentMinute = now.getMinutes();
      currentTime = currentHour * 60 + currentMinute;
    } catch {
      now = new Date();
      currentHour = now.getHours();
      currentMinute = now.getMinutes();
      currentTime = currentHour * 60 + currentMinute;
    }

    const notifs = schedule.map((lecture) => {
      const [startH, startM] = lecture.startTime.split(':').map(Number);
      const lectureTime = startH * 60 + startM;
      const timeDiff = lectureTime - currentTime;

      let status = 'upcoming';
      let message = '';

      if (timeDiff < 0) {
        status = 'completed';
        message = 'Completed';
      } else if (timeDiff <= 15) {
        status = 'soon';
        message = `Starting in ${timeDiff} minutes`;
      } else {
        status = 'upcoming';
        message = `Starts at ${lecture.startTime}`;
      }

      return {
        id: `${lecture.day}-${lecture.period}`,
        type: 'schedule',
        status,
        message,
        lecture,
        time: (() => {
          try {
            const serverTime = getServerTime();
            return serverTime.nowDate();
          } catch {
            return new Date();
          }
        })(),
      };
    });

    setNotifications(notifs);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodaySchedule();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'soon':
        return '#f59e0b';
      case 'completed':
        return '#6b7280';
      case 'upcoming':
        return theme.primary;
      default:
        return theme.textSecondary;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'soon':
        return '⏰';
      case 'completed':
        return '✓';
      case 'upcoming':
        return '📅';
      default:
        return '📌';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* In-App Notification Banner */}
      {inAppNotification && (
        <Animated.View
          style={[
            styles.inAppNotificationBanner,
            {
              backgroundColor: theme.primary,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.inAppNotificationContent}
            onPress={hideInAppNotification}
            activeOpacity={0.9}
          >
            <View style={styles.inAppNotificationIcon}>
              <BellIcon size={20} color={theme.background} />
            </View>
            <View style={styles.inAppNotificationText}>
              <Text style={[styles.inAppNotificationTitle, { color: theme.background }]}>
                {inAppNotification.title}
              </Text>
              <Text style={[styles.inAppNotificationBody, { color: theme.background }]} numberOfLines={2}>
                {inAppNotification.body}
              </Text>
            </View>
            <TouchableOpacity onPress={hideInAppNotification} style={styles.inAppNotificationClose}>
              <Text style={{ color: theme.background, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <BellIcon size={28} color={theme.primary} />
            <Text style={[styles.title, { color: theme.primary }]}>Schedule</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your classes for today
          </Text>
        </View>

      {/* Today's Summary */}
      <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <Text style={[styles.summaryTitle, { color: theme.text }]}>Today's Schedule</Text>
        <View style={styles.summaryStats}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: theme.primary }]}>{todaySchedule.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Classes</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#10b981' }]}>
              {notifications.filter((n) => n.status === 'completed').length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#f59e0b' }]}>
              {notifications.filter((n) => n.status === 'soon').length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Starting Soon</Text>
          </View>
        </View>
      </View>

      {/* Notifications List */}
      <View style={styles.notificationsList}>
        {notifications.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No classes scheduled for today
            </Text>
          </View>
        ) : (
          notifications.map((notif) => (
            <View
              key={notif.id}
              style={[
                styles.notificationCard,
                { backgroundColor: theme.cardBackground, borderColor: theme.border },
              ]}
            >
              <View style={styles.notifHeader}>
                <View style={styles.notifIcon}>
                  <Text style={styles.notifEmoji}>{getStatusIcon(notif.status)}</Text>
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: theme.text }]}>
                    {notif.lecture.subject}
                  </Text>
                  <Text style={[styles.notifMessage, { color: getStatusColor(notif.status) }]}>
                    {notif.message}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(notif.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(notif.status) }]}>
                    {notif.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.notifDetails}>
                <View style={styles.detailRow}>
                  <ClockIcon size={14} color={theme.textSecondary} />
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                    {notif.lecture.startTime} - {notif.lecture.endTime}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                    🏢 {notif.lecture.room}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                    📚 {notif.lecture.course} - Semester {notif.lecture.semester}
                  </Text>
                </View>
              </View>

              {notif.status === 'soon' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.primary }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionButtonText, { color: theme.background }]}>
                    Mark as Started
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90, // Space for bottom navigation
  },
  header: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  notificationsList: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 10,
  },
  emptyState: {
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
  },
  notificationCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifEmoji: {
    fontSize: 20,
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  notifMessage: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  notifDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  inAppNotificationBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  inAppNotificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  inAppNotificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inAppNotificationText: {
    flex: 1,
  },
  inAppNotificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  inAppNotificationBody: {
    fontSize: 12,
    opacity: 0.9,
  },
  inAppNotificationClose: {
    padding: 8,
  },
});
