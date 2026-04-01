import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  ScrollView
} from 'react-native';
import { Accelerometer } from 'expo-sensors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LanyardCard({
  visible,
  onClose,
  userData,
  theme,
  onOpenFullProfile
}) {
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const swingX = useRef(new Animated.Value(0)).current;
  const swingY = useRef(new Animated.Value(0)).current;
  const rotateZ = useRef(new Animated.Value(0)).current;

  const [subscription, setSubscription] = useState(null);

  // Setup accelerometer for realistic swinging
  useEffect(() => {
    if (visible) {
      // Drop down animation
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }).start();

      // Subscribe to accelerometer
      _subscribe();
    } else {
      // Pull up animation
      Animated.spring(slideAnim, {
        toValue: -300,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Unsubscribe from accelerometer
      _unsubscribe();
    }

    return () => {
      _unsubscribe();
    };
  }, [visible]);

  const _subscribe = () => {
    // Set update interval to 100ms for smooth animation
    Accelerometer.setUpdateInterval(100);

    const sub = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;

      // Apply physics-based swinging with pivot at top
      // X-axis: left-right tilt causes rotation
      // Y-axis: forward-backward tilt causes 3D rotation
      // The card rotates from the top center like a real lanyard

      const swingFactor = 40; // Increased for more dramatic swing
      const rotateFactor = 20; // Increased rotation

      // Horizontal swing (stores value for 3D rotation)
      Animated.spring(swingX, {
        toValue: x * swingFactor,
        tension: 8,  // Lower tension = more swing
        friction: 4, // Lower friction = longer swing
        useNativeDriver: true,
      }).start();

      // Vertical movement (minimal, just for realism)
      Animated.spring(swingY, {
        toValue: -y * swingFactor * 0.3,
        tension: 8,
        friction: 4,
        useNativeDriver: true,
      }).start();

      // Z-axis rotation (main swinging motion)
      Animated.spring(rotateZ, {
        toValue: x * rotateFactor,
        tension: 8,
        friction: 4,
        useNativeDriver: true,
      }).start();
    });

    setSubscription(sub);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);

    // Reset to center position
    Animated.parallel([
      Animated.spring(swingX, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(swingY, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(rotateZ, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Rotation around Z-axis (left-right swing)
  const rotateInterpolate = rotateZ.interpolate({
    inputRange: [-30, 30],
    outputRange: ['-20deg', '20deg'],
    extrapolate: 'clamp',
  });

  // Rotation around Y-axis (3D depth effect)
  const rotateYInterpolate = swingX.interpolate({
    inputRange: [-30, 30],
    outputRange: ['-10deg', '10deg'],
    extrapolate: 'clamp',
  });

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.lanyardContainer}>
          {/* Lanyard String */}
          <Animated.View
            style={[
              styles.lanyardString,
              {
                transform: [
                  { translateY: slideAnim },
                  { translateX: swingX },
                ],
              },
            ]}
          >
            <View style={[styles.stringLine, { backgroundColor: theme.primary }]} />
            <View style={[styles.stringLine, { backgroundColor: theme.primary }]} />
          </Animated.View>

          {/* ID Card - Pivot point at top center */}
          <Animated.View
            style={[
              styles.cardContainer,
              {
                transform: [
                  { translateY: slideAnim },
                  { perspective: 1000 },
                  { rotateZ: rotateInterpolate },
                  { rotateY: rotateYInterpolate },
                ],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={(e) => {
                e.stopPropagation();
              }}
              onLongPress={onOpenFullProfile}
              delayLongPress={500}
            >
              <View style={[styles.card, {
                backgroundColor: theme.cardBackground,
                borderColor: theme.primary,
              }]}>
                {/* Card Header */}
                <View style={[styles.cardHeader, { backgroundColor: theme.primary }]}>
                  <Text style={styles.cardHeaderText}>STUDENT ID CARD</Text>
                </View>

                {/* Photo */}
                <View style={styles.photoContainer}>
                  {userData?.photoUrl ? (
                    <Image
                      source={{ uri: userData.photoUrl }}
                      style={styles.photo}
                    />
                  ) : (
                    <View style={[styles.photoPlaceholder, { backgroundColor: theme.primary }]}>
                      <Text style={styles.photoPlaceholderText}>
                        {getInitials(userData?.name)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={styles.infoContainer}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {userData?.name || 'Student Name'}
                  </Text>

                  <View style={styles.infoRow}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>ID:</Text>
                    <Text style={[styles.value, { color: theme.text }]}>
                      {userData?.enrollmentNo || 'N/A'}
                    </Text>
                  </View>

                  {userData?.role === 'student' && (
                    <>
                      <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: theme.textSecondary }]}>Course:</Text>
                        <Text style={[styles.value, { color: theme.text }]}>
                          {userData?.course || 'N/A'}
                        </Text>
                      </View>

                      <View style={styles.infoRow}>
                        <Text style={[styles.label, { color: theme.textSecondary }]}>Sem:</Text>
                        <Text style={[styles.value, { color: theme.text }]}>
                          {userData?.semester || 'N/A'}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Footer */}
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                    Long press for details
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  lanyardContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  lanyardString: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: -10,
  },
  stringLine: {
    width: 4,
    height: 100,
    borderRadius: 2,
  },
  cardContainer: {
    width: 280,
    // Set transform origin to top center for realistic swinging
    transformOrigin: 'top center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  cardHeader: {
    padding: 12,
    alignItems: 'center',
  },
  cardHeaderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  photoContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  photoPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoContainer: {
    padding: 20,
    paddingTop: 0,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    fontWeight: '500',
  },
  cardFooter: {
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontStyle: 'italic',
  },
});
