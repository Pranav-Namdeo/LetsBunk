import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function Updates({ theme, onBack }) {
  // Mock update status - replace with actual API call
  const [updateAvailable] = useState(false); // Change to true to test update available state
  const currentVersion = "1.2.0";
  const latestVersion = "1.3.0";

  const updateFeatures = [
    "Enhanced attendance tracking with real-time sync",
    "New dark mode improvements",
    "Bug fixes and performance improvements",
    "Added semester-wise student records view",
    "Improved notification system",
  ];

  const handleUpdate = () => {
    // Handle update logic here
    alert("Update functionality will be implemented here!");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={{ fontSize: 24 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Updates</Text>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {updateAvailable ? (
          // Update Available View
          <View style={styles.content}>
            {/* Update Available Card */}
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
                  <Text style={{ fontSize: 24 }}>📥</Text>
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    New Update Available
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                    Version {latestVersion} is now available. You are currently using version {currentVersion}.
                  </Text>
                </View>
              </View>
            </View>

            {/* What's New */}
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>What's New</Text>
              <View style={styles.featureList}>
                {updateFeatures.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Text style={styles.checkIcon}>✓</Text>
                    <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Update Button */}
            <TouchableOpacity
              onPress={handleUpdate}
              style={[styles.updateButton, { backgroundColor: theme.primary }]}
            >
              <Text style={{ fontSize: 16 }}>📥</Text>
              <Text style={styles.updateButtonText}>Update Now</Text>
            </TouchableOpacity>

            {/* Release Notes */}
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Release Notes</Text>
              <Text style={[styles.releaseNotes, { color: theme.textSecondary }]}>
                This update includes several improvements to enhance your experience with LetsBunk.
              </Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Current Version</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{currentVersion}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Latest Version</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{latestVersion}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Release Date</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>Nov 25, 2024</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Size</Text>
                  <Text style={[styles.infoValue, { color: theme.text }]}>12.5 MB</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          // No Update Available View
          <View style={styles.centerContent}>
            <View style={[styles.successCircle, { backgroundColor: '#10b981' + '20' }]}>
              <Text style={{ fontSize: 48 }}>✓</Text>
            </View>

            <Text style={[styles.successTitle, { color: theme.text }]}>You're Up to Date!</Text>
            <Text style={[styles.successSubtitle, { color: theme.textSecondary }]}>
              LetsBunk is currently running the latest version {currentVersion}. You will be notified when a new update is available.
            </Text>

            {/* Current Version Info */}
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, width: '100%' }]}>
              <View style={styles.versionInfo}>
                <View style={styles.versionRow}>
                  <Text style={[styles.versionLabel, { color: theme.textSecondary }]}>Current Version</Text>
                  <Text style={[styles.versionValue, { color: theme.text }]}>{currentVersion}</Text>
                </View>
                <View style={styles.versionRow}>
                  <Text style={[styles.versionLabel, { color: theme.textSecondary }]}>Last Checked</Text>
                  <Text style={[styles.versionValue, { color: theme.text }]}>Just now</Text>
                </View>
                <View style={styles.versionRow}>
                  <Text style={[styles.versionLabel, { color: theme.textSecondary }]}>Status</Text>
                  <View style={styles.statusBadge}>
                    <Text style={{ fontSize: 12, marginRight: 4 }}>✓</Text>
                    <Text style={styles.statusText}>Up to date</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>ℹ️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBoxTitle, { color: theme.text }]}>Automatic Updates</Text>
                <Text style={[styles.infoBoxText, { color: theme.textSecondary }]}>
                  We'll automatically notify you when new updates are available for LetsBunk.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  content: {
    gap: 24,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 24,
  },
  card: {
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  checkIcon: {
    fontSize: 16,
    color: '#10b981',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  releaseNotes: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 8,
  },
  successSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  versionInfo: {
    gap: 16,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 14,
  },
  versionValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  infoBoxTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoBoxText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
