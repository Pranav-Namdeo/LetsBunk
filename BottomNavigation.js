import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { HomeIcon, CalendarIcon, BookIcon, BellIcon, UserIcon, WiFiIcon } from './Icons';

export default function BottomNavigation({ theme, activeTab, onTabChange, userRole, notificationBadge }) {
  // Different tabs for student vs teacher
  const studentTabs = [
    { id: 'home', Icon: HomeIcon, label: 'Home' },
    { id: 'calendar', Icon: CalendarIcon, label: 'Calendar' },
    { id: 'timetable', Icon: BookIcon, label: 'Timetable' },
    { id: 'wifi', Icon: WiFiIcon, label: 'WiFi Test' }, // Development tab for BSSID testing
  ];

  const teacherTabs = [
    { id: 'home', Icon: HomeIcon, label: 'Home' },
    { id: 'calendar', Icon: CalendarIcon, label: 'Calendar' },
    { id: 'timetable', Icon: BookIcon, label: 'Timetable' },
  ];

  const tabs = userRole === 'teacher' ? teacherTabs : studentTabs;

  return (
    <View style={[styles.container, {
      backgroundColor: theme.cardBackground,
      borderTopColor: theme.border
    }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const { Icon } = tab;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.tabContent,
              isActive && { backgroundColor: theme.primary + '20' }
            ]}>
              <View style={[
                styles.iconContainer,
                isActive && { transform: [{ scale: 1.1 }] }
              ]}>
                <Icon
                  size={24}
                  color={isActive ? theme.primary : theme.textSecondary}
                />
                {tab.badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.tabLabel,
                { color: isActive ? theme.primary : theme.textSecondary }
              ]}>
                {tab.label}
              </Text>
            </View>
            {isActive && (
              <View style={[styles.activeIndicator, { backgroundColor: theme.primary }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: 70,
    borderTopWidth: 1,
    paddingBottom: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  iconContainer: {
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: 3,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
