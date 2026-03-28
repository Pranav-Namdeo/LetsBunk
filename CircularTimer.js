import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  Vibration,
} from 'react-native';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
  G,
  Text as SvgText,
} from 'react-native-svg';

// Constants for circle dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIMER_SIZE = Math.min(SCREEN_WIDTH - 80, 280); // 280px max - Total size
const CENTER = TIMER_SIZE / 2; // Center point (140px at max)
const OUTER_R = 125; // 250px diameter - Ring outer radius
const RING_WIDTH = 24; // 24px - Ring thickness
const INNER_R = 101; // 202px diameter - Ring inner radius
const WHITE_CIRCLE_R = 87.5; // 175px diameter - White circle

// Default segments
const DEFAULT_SEGMENTS = [
  { id: 1, label: 'ENGLISH', color: '#22c55e', start: 0, end: 45 },
  { id: 2, label: 'MATH', color: '#991b1b', start: 45, end: 90 },
  { id: 3, label: 'SCIENCE', color: '#f97316', start: 90, end: 135 },
  { id: 4, label: 'HISTORY', color: '#1f2937', start: 135, end: 180 },
  { id: 5, label: 'ART', color: '#ec4899', start: 180, end: 225 },
  { id: 6, label: 'MUSIC', color: '#a855f7', start: 225, end: 270 },
  { id: 7, label: 'GYM', color: '#84cc16', start: 270, end: 315 },
  { id: 8, label: 'READING', color: '#ffc0cb', start: 315, end: 360 },
];

export default function CircularTimer({
  theme = {},
  onLongPressCenter = () => { },
  timetable = null,
  currentDay = null,
}) {
  const safeTheme = {
    primary: theme.primary || '#d97706',
    background: theme.background || '#fef3e2',
    cardBackground: theme.cardBackground || '#ffffff',
    text: theme.text || '#2c1810',
    textSecondary: theme.textSecondary || '#8b6f47',
    border: theme.border || '#f3d5a0',
  };

  const [segments, setSegments] = useState(DEFAULT_SEGMENTS);
  const [activeSegment, setActiveSegment] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [circleScale, setCircleScale] = useState(new Animated.Value(0));

  // Simplified animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const longPressAnim = useRef(new Animated.Value(0)).current;

  // Generate segments from timetable
  useEffect(() => {
    console.log('🎨 CircularTimer useEffect triggered');
    console.log('  - Current Day:', currentDay);
    console.log('  - Timetable exists:', !!timetable);
    console.log('  - Timetable.schedule exists:', !!timetable?.schedule);
    
    // If timetable hasn't loaded yet, don't set DEFAULT_SEGMENTS
    if (!timetable || !timetable.schedule) {
      console.log('⏳ Waiting for timetable to load...');
      return;
    }

    if (timetable.schedule[currentDay]) {
      const schedule = timetable.schedule[currentDay];
      console.log('📚 CircularTimer - Found schedule with', schedule.length, 'periods');
      if (Array.isArray(schedule) && schedule.length > 0) {
        const angleStep = 360 / schedule.length;

        // Enhanced shortform mapping for better circle display
        const getShortForm = (subject) => {
          const shortForms = {
            // Programming subjects
            'PROGRAMMING IN C': 'C PROG',
            'PROGRAMMING PRACTICE': 'C PRAC',
            'PROGRAMMING LAB': 'C LAB',
            'C PROGRAMMING': 'C PROG',
            'C++ PROGRAMMING': 'C++',
            'JAVA PROGRAMMING': 'JAVA',
            'PYTHON PROGRAMMING': 'PYTHON',
            
            // Mathematics subjects
            'MATHEMATICS-I': 'MATH-I',
            'MATHEMATICS-II': 'MATH-II',
            'MATHEMATICS PRACTICE': 'MATH',
            'MATHEMATICS TUTORIAL': 'MATH TUT',
            'APPLIED MATHEMATICS': 'APP MATH',
            'DISCRETE MATHEMATICS': 'DISCRETE',
            
            // Science subjects
            'PHYSICS WORKSHOP': 'PHYSICS',
            'PHYSICS LAB': 'PHY LAB',
            'CHEMISTRY LAB': 'CHEM LAB',
            'CHEMISTRY WORKSHOP': 'CHEMISTRY',
            'APPLIED PHYSICS': 'APP PHY',
            'APPLIED CHEMISTRY': 'APP CHEM',
            
            // Engineering subjects
            'ENGINEERING DRAWING': 'ENG DRW',
            'ENGINEERING MECHANICS': 'ENG MECH',
            'ELECTRICAL ENGINEERING': 'ELECTRICAL',
            'MECHANICAL ENGINEERING': 'MECHANICAL',
            'CIVIL ENGINEERING': 'CIVIL',
            
            // Computer Science subjects
            'DATA STRUCTURES': 'DS',
            'DATABASE MANAGEMENT': 'DBMS',
            'DATABASE MANAGEMENT SYSTEM': 'DBMS',
            'MACHINE LEARNING': 'ML',
            'ARTIFICIAL INTELLIGENCE': 'AI',
            'DIGITAL ELECTRONICS': 'DIGITAL',
            'SIGNALS & SYSTEMS': 'SIGNALS',
            'COMPUTER NETWORKS': 'NETWORKS',
            'OPERATING SYSTEMS': 'OS',
            'SOFTWARE ENGINEERING': 'SE',
            'WEB DEVELOPMENT': 'WEB DEV',
            'MOBILE DEVELOPMENT': 'MOBILE',
            
            // Language subjects
            'ENGLISH PROJECT': 'ENGLISH',
            'ENGLISH READING': 'ENGLISH',
            'ENGLISH COMMUNICATION': 'ENGLISH',
            'TECHNICAL WRITING': 'TECH WRT',
            
            // Other subjects
            'PROJECT WORK': 'PROJECT',
            'LUNCH BREAK': 'LUNCH',
            'TEA BREAK': 'BREAK',
            'WORKSHOP PRACTICE': 'WORKSHOP',
            'INDUSTRIAL TRAINING': 'TRAINING',
            'SEMINAR': 'SEMINAR',
            'PRESENTATION': 'PRESENT',
            'COMMERSO': 'COMMERSO',
          };
          
          // Return mapped short form or truncate long names
          const mapped = shortForms[subject];
          if (mapped) return mapped;
          
          // Auto-truncate long subjects to fit in circle
          if (subject.length > 8) {
            // Try to create meaningful abbreviation
            const words = subject.split(' ');
            if (words.length > 1) {
              return words.map(word => word.charAt(0)).join('').substring(0, 6);
            }
            return subject.substring(0, 6);
          }
          
          return subject;
        };

        const newSegments = schedule.map((slot, i) => {
          const subject = (slot.subject || '').toUpperCase().trim();
          
          // Enhanced color mapping with partial matching
          const getColor = (subj) => {
            // Direct matches
            const colorMap = {
              'ENGLISH': '#22c55e',
              'MATH': '#991b1b',
              'MATHEMATICS': '#991b1b',
              'MATHEMATICS-I': '#991b1b',
              'MATHEMATICS-II': '#991b1b',
              'SCIENCE': '#f97316',
              'PHYSICS': '#3b82f6',
              'CHEMISTRY': '#8b5cf6',
              'BIOLOGY': '#10b981',
              'HISTORY': '#1f2937',
              'GEOGRAPHY': '#0891b2',
              'ART': '#ec4899',
              'MUSIC': '#a855f7',
              'GYM': '#84cc16',
              'PE': '#84cc16',
              'COMPUTER': '#6366f1',
              'CS': '#6366f1',
              'BREAK': '#fbbf24',
              'LUNCH': '#f59e0b',
              'PROGRAMMING': '#6366f1',
              'PROGRAMMING IN C': '#6366f1',
              'PROGRAMMING PRACTICE': '#6366f1',
              'PROGRAMMING LAB': '#6366f1',
              'MATHEMATICS PRACTICE': '#991b1b',
              'MATHEMATICS TUTORIAL': '#991b1b',
              'PHYSICS WORKSHOP': '#3b82f6',
              'PHYSICS LAB': '#3b82f6',
              'CHEMISTRY LAB': '#8b5cf6',
              'CHEMISTRY WORKSHOP': '#8b5cf6',
              'ENGINEERING DRAWING': '#f97316',
              'ENGLISH PROJECT': '#22c55e',
              'ENGLISH READING': '#22c55e',
              'PROJECT WORK': '#64748b',
              'DATA STRUCTURES': '#6366f1',
              'DATABASE': '#8b5cf6',
              'DBMS': '#8b5cf6',
              'MACHINE LEARNING': '#ec4899',
              'ML': '#ec4899',
              'ARTIFICIAL INTELLIGENCE': '#a855f7',
              'AI': '#a855f7',
              'DIGITAL': '#3b82f6',
              'SIGNALS': '#0891b2',
              'COMMERSO': '#0891b2',
            };
            
            // Check direct match first
            if (colorMap[subj]) return colorMap[subj];
            
            // Check partial matches
            if (subj.includes('PROG')) return '#6366f1';
            if (subj.includes('MATH')) return '#991b1b';
            if (subj.includes('PHYS')) return '#3b82f6';
            if (subj.includes('CHEM')) return '#8b5cf6';
            if (subj.includes('ENG')) return '#22c55e';
            if (subj.includes('BREAK') || subj.includes('LUNCH')) return '#fbbf24';
            if (subj.includes('LAB')) return '#10b981';
            if (subj.includes('WORKSHOP')) return '#f97316';
            
            // Generate color based on hash for consistency
            const colors = ['#22c55e', '#991b1b', '#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#a855f7', '#84cc16', '#0891b2'];
            const hash = subj.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return colors[hash % colors.length];
          };
          
          const shortLabel = getShortForm(subject);
          const color = getColor(subject);

          return {
            id: i + 1,
            label: shortLabel || 'CLASS',
            room: slot.room || '',
            time: slot.time || '',
            color: color,
            start: i * angleStep,
            end: (i + 1) * angleStep,
          };
        });
        console.log('CircularTimer - Setting new segments:', newSegments);
        setSegments(newSegments);
      }
    } else {
      console.log('⚠️ CircularTimer - No schedule found for current day:', currentDay);
      setSegments(DEFAULT_SEGMENTS);
    }
  }, [timetable, currentDay]);

  // Create arc path for a segment
  const createSegmentPath = (startAngle, endAngle) => {
    const toRad = (angle) => ((angle - 90) * Math.PI) / 180;
    const startRad = toRad(startAngle);
    const endRad = toRad(endAngle);

    const x1 = CENTER + INNER_R * Math.cos(startRad);
    const y1 = CENTER + INNER_R * Math.sin(startRad);
    const x2 = CENTER + OUTER_R * Math.cos(startRad);
    const y2 = CENTER + OUTER_R * Math.sin(startRad);
    const x3 = CENTER + OUTER_R * Math.cos(endRad);
    const y3 = CENTER + OUTER_R * Math.sin(endRad);
    const x4 = CENTER + INNER_R * Math.cos(endRad);
    const y4 = CENTER + INNER_R * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M${x1},${y1} L${x2},${y2} A${OUTER_R},${OUTER_R} 0 ${largeArc},1 ${x3},${y3} L${x4},${y4} A${INNER_R},${INNER_R} 0 ${largeArc},0 ${x1},${y1} Z`;
  };

  // Get angle from touch point
  const getAngle = (x, y) => {
    const angle = (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI + 90;
    return angle < 0 ? angle + 360 : angle;
  };

  // Find segment at angle
  const findSegment = (angle) => {
    return segments.find((s) => {
      if (s.start > s.end) return angle >= s.start || angle <= s.end;
      return angle >= s.start && angle <= s.end;
    });
  };

  // Get segment center position (in the middle of the ring thickness)
  const getSegmentCenter = (seg) => {
    const midAngle = ((seg.start + seg.end) / 2 - 90) * (Math.PI / 180);
    const ringCenterRadius = (INNER_R + OUTER_R) / 2;
    return {
      x: CENTER + ringCenterRadius * Math.cos(midAngle),
      y: CENTER + ringCenterRadius * Math.sin(midAngle),
    };
  };

  // Pan responder for touch
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        setIsDragging(true);
        scaleAnim.setValue(1.03);
        const angle = getAngle(e.nativeEvent.locationX, e.nativeEvent.locationY);
        const seg = findSegment(angle);
        if (seg) {
          setActiveSegment(seg.id);
          Animated.spring(circleScale, {
            toValue: 1,
            tension: 200,
            friction: 10,
            useNativeDriver: false,
          }).start();
          try { Vibration.vibrate(15); } catch (err) { }
        }
      },

      onPanResponderMove: (e) => {
        const angle = getAngle(e.nativeEvent.locationX, e.nativeEvent.locationY);
        const seg = findSegment(angle);
        if (seg && seg.id !== activeSegment) {
          setActiveSegment(seg.id);
          circleScale.setValue(0);
          Animated.spring(circleScale, {
            toValue: 1,
            tension: 200,
            friction: 10,
            useNativeDriver: false,
          }).start();
          try { Vibration.vibrate(15); } catch (err) { }
        }
      },

      onPanResponderRelease: () => {
        setIsDragging(false);
        scaleAnim.setValue(1);
        Animated.timing(circleScale, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          setActiveSegment(null);
        });
      },

      onPanResponderTerminate: () => {
        setIsDragging(false);
        scaleAnim.setValue(1);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.timer, { transform: [{ scale: scaleAnim }] }]}
        {...panResponder.panHandlers}
      >
        <Svg
          width={TIMER_SIZE}
          height={TIMER_SIZE}
          viewBox={`0 0 ${TIMER_SIZE} ${TIMER_SIZE}`}
          style={{ overflow: 'visible', backgroundColor: 'transparent' }}
          pointerEvents="box-none"
        >
          <Defs>
            <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={safeTheme.primary} />
              <Stop offset="50%" stopColor="#a855f7" />
              <Stop offset="100%" stopColor="#3b82f6" />
            </LinearGradient>
          </Defs>

          {/* Segments with smooth morph animation */}
          {segments.map((seg) => {
            const isActive = activeSegment === seg.id;
            const centerPos = getSegmentCenter(seg);

            return (
              <G key={seg.id}>
                {/* Normal segment */}
                <Path
                  d={createSegmentPath(seg.start, seg.end)}
                  fill={seg.color}
                  stroke={safeTheme.background}
                  strokeWidth="2"
                  opacity={isActive ? 0.3 : 1}
                  fillOpacity={isActive ? 0.3 : 0.95}
                />

                {/* Active segment as animated floating circle */}
                {isActive && (
                  <G opacity={circleScale}>
                    {/* Outer border circle */}
                    <Circle
                      cx={centerPos.x}
                      cy={centerPos.y}
                      r="28"
                      fill="none"
                      stroke={safeTheme.cardBackground}
                      strokeWidth="3"
                      opacity="0.9"
                    />
                    
                    {/* Main colored circle */}
                    <Circle
                      cx={centerPos.x}
                      cy={centerPos.y}
                      r="25"
                      fill={seg.color}
                      opacity="0.95"
                    />
                    
                    {/* Subject name text */}
                    <SvgText
                      x={centerPos.x}
                      y={centerPos.y - 4}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#ffffff"
                    >
                      {seg.label}
                    </SvgText>
                    
                    {/* Room number text */}
                    {seg.room && (
                      <SvgText
                        x={centerPos.x}
                        y={centerPos.y + 7}
                        textAnchor="middle"
                        fontSize="7"
                        fontWeight="500"
                        fill="#ffffff"
                        opacity="0.9"
                      >
                        {seg.room}
                      </SvgText>
                    )}
                  </G>
                )}
              </G>
            );
          })}

          {/* Center white circle */}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={WHITE_CIRCLE_R}
            fill={safeTheme.cardBackground}
            stroke={safeTheme.border}
            strokeWidth="2"
          />
        </Svg>

        {/* Center controls - Face verification button */}
        <TouchableOpacity
          style={[styles.center, { zIndex: 1000 }]}
          onPressIn={() => {
            setIsLongPressing(true);
            longPressAnim.setValue(1);
          }}
          onPressOut={() => {
            setIsLongPressing(false);
            longPressAnim.setValue(0);
          }}
          onLongPress={() => {
            console.log('🔒 Long press detected on timer center - triggering face verification');
            Vibration.vibrate(50);
            setIsLongPressing(false);
            onLongPressCenter();
          }}
          delayLongPress={800}
          activeOpacity={1}
        >
          {/* Period-based attendance message */}
          <Text style={{ color: safeTheme.text, fontSize: 16, fontWeight: 'bold', marginTop: 8, textAlign: 'center' }}>
            ✅ Period-based
          </Text>
          <Text style={[styles.timeLabel, { color: safeTheme.textSecondary, fontSize: 10, marginTop: 3 }]}>
            Attendance Active
          </Text>

          {/* Long Press Indicator */}
          {isLongPressing && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: safeTheme.primary + '20',
                borderRadius: 100,
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  borderWidth: 4,
                  borderColor: safeTheme.primary,
                  borderTopColor: 'transparent',
                }}
              />
              <Text
                style={{
                  position: 'absolute',
                  color: safeTheme.primary,
                  fontSize: 12,
                  fontWeight: 'bold',
                  marginTop: 80,
                }}
              >
                🔒 Hold to Verify
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Hint */}
      <View style={styles.hint}>
        <Text style={[styles.hintText, { color: safeTheme.textSecondary }]}>
          {isDragging ? '🎯 Drag around the circle' : '🎯 Tap or drag segments'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'transparent',
  },
  timer: {
    position: 'relative',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  timeLabel: {
    fontSize: 10,
    marginTop: 3,
  },
  hint: {
    marginTop: 20,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
