import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Platform } from 'react-native';

const FloatingBrandButton = ({ theme, studentId, socketUrl }) => {
  const [showParticles, setShowParticles] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Smooth floating animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -12,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Auto-hide after 8 seconds
    const hideTimer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setIsVisible(false));
    }, 8000);

    return () => clearTimeout(hideTimer);
  }, []);

  const handlePress = useCallback(() => {
    // Bounce animation on press
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.75,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    setShowParticles(true);
  }, [scaleAnim]);

  const handleClose = useCallback(() => {
    setShowParticles(false);
  }, []);

  const ballColor = theme.isDark ? '#00f5ff' : '#d97706';
  const glowColor = theme.isDark ? 'rgba(0, 245, 255, 0.4)' : 'rgba(217, 119, 6, 0.4)';

  return (
    <>
      {isVisible && (
        <Animated.View
          style={[
            styles.floatingButton,
            {
              opacity: opacityAnim,
              transform: [
                { translateY: floatAnim },
                { scale: scaleAnim }
              ],
            },
          ]}
        >
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.7}
          style={[
            styles.button,
            {
              backgroundColor: ballColor,
              shadowColor: ballColor,
            }
          ]}
        >
          <Animated.View 
            style={[
              styles.glow, 
              { 
                backgroundColor: glowColor,
                transform: [{ scale: pulseAnim }]
              }
            ]} 
          />
          <View style={styles.innerCircle} />
        </TouchableOpacity>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 999,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    ...Platform.select({
      android: {
        overflow: 'hidden',
      },
    }),
  },
  glow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    zIndex: -1,
  },
  innerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});

export default FloatingBrandButton;
