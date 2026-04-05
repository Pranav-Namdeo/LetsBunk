/**
 * Security Status Indicator
 * Shows users the security status of their timer
 * Helps identify potential security issues
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function SecurityStatusIndicator({ securityStatus, theme, onPress }) {
  const getStatusColor = () => {
    if (!securityStatus.isValidated) return '#ff4444'; // Red - not validated
    if (securityStatus.drift > 10) return '#ff9800'; // Orange - high drift
    if (securityStatus.gracePeriodsUsed >= 50) return '#ff9800'; // Orange - many disconnections (but not blocked)
    return '#4CAF50'; // Green - secure
  };

  const getStatusText = () => {
    if (!securityStatus.isValidated) return 'Not Validated';
    if (securityStatus.drift > 10) return `Drift: ${securityStatus.drift}s`;
    if (securityStatus.gracePeriodsUsed >= 50) return `Many Disconnections: ${securityStatus.gracePeriodsUsed}`;
    if (securityStatus.gracePeriodsUsed > 0) return `Disconnections: ${securityStatus.gracePeriodsUsed}`;
    return 'Secure';
  };

  const getStatusIcon = () => {
    if (!securityStatus.isValidated) return '🚨';
    if (securityStatus.drift > 10) return '⚠️';
    if (securityStatus.gracePeriodsUsed >= 50) return '⚠️';
    return '🔒';
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { 
          backgroundColor: theme.cardBackground + 'E6',
          borderColor: getStatusColor()
        }
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.indicator}>
        <Text style={styles.icon}>{getStatusIcon()}</Text>
        <View style={styles.textContainer}>
          <Text style={[styles.statusText, { color: theme.text }]}>
            Timer Security
          </Text>
          <Text style={[styles.detailText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>
        {securityStatus.gracePeriodsUsed > 0 && (
          <View style={styles.graceIndicator}>
            <Text style={[styles.graceText, { color: theme.textSecondary }]}>
              Disconnections: {securityStatus.gracePeriodsUsed}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1000,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailText: {
    fontSize: 10,
    fontWeight: '500',
  },
  graceIndicator: {
    marginLeft: 8,
  },
  graceText: {
    fontSize: 9,
    fontWeight: '500',
  },
});