/**
 * Toast.js — lightweight non-blocking notification system
 * Usage:
 *   import { showToast, ToastContainer } from './Toast';
 *   showToast('Something happened', 'error');   // 'success' | 'error' | 'warning' | 'info'
 *   <ToastContainer />  ← render once near root of your screen
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, Text, View, StyleSheet, TouchableOpacity } from 'react-native';

// ── Global event bus (no context needed) ─────────────────────────────────────
let _listener = null;
let _toastId = 0;

export function showToast(message, type = 'info', duration = 3500) {
  if (_listener) _listener({ id: ++_toastId, message, type, duration });
}

// ── Single toast item ─────────────────────────────────────────────────────────
const COLORS = {
  success: { bg: '#166534', border: '#22c55e', icon: '✅' },
  error:   { bg: '#7f1d1d', border: '#ef4444', icon: '❌' },
  warning: { bg: '#78350f', border: '#f59e0b', icon: '⚠️' },
  info:    { bg: '#1e3a5f', border: '#3b82f6', icon: 'ℹ️' },
};

function ToastItem({ toast, onDone }) {
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);
  const animRef    = useRef(null);

  useEffect(() => {
    // Slide up + fade in
    animRef.current = Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);
    animRef.current.start();

    // Auto-dismiss
    const timer = setTimeout(() => dismiss(), toast.duration);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, []);

  const dismiss = () => {
    if (!mountedRef.current) return;
    translateY.stopAnimation();
    opacity.stopAnimation();
    Animated.parallel([
      Animated.timing(translateY, { toValue: 80, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,  duration: 250, useNativeDriver: true }),
    ]).start(() => { if (mountedRef.current) onDone(toast.id); });
  };

  const c = COLORS[toast.type] || COLORS.info;

  return (
    <Animated.View style={[styles.toast, { backgroundColor: c.bg, borderLeftColor: c.border, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.icon}>{c.icon}</Text>
      <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Container — render once near the root of your screen ─────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _listener = (toast) => setToasts(prev => [...prev.slice(-2), toast]); // max 3 at once
    return () => { _listener = null; };
  }, []);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDone={remove} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,   // above bottom nav
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  icon:    { fontSize: 16, marginRight: 10 },
  message: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18 },
  close:   { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginLeft: 10 },
});
