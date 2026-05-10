/**
 * LoginScreen.js
 * Replicates the login repo design exactly:
 * - Background: #E8DCC4 (warm beige)
 * - LB watermark in #D4C4A8
 * - Student/Teacher mode switcher (blue/red)
 * - White/80 rounded inputs with focus shadow
 * - Black submit button with arrow
 * - Playfair Display → system serif fallback
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Dimensions, Animated, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// ── Design tokens (modern dark theme) ──────────────────────────────────────
const C = {
  bg:           '#0F0F11',
  watermark:    'rgba(255,255,255,0.03)',
  ink:          '#FFFFFF',
  inkMuted:     'rgba(255,255,255,0.6)',
  inkFaint:     'rgba(255,255,255,0.08)',
  inputBg:      '#1C1C1E',
  inputBorder:  'rgba(255,255,255,0.1)',
  inputFocus:   '#3B82F6',
  student:      '#3B82F6',
  studentShadow:'rgba(59,130,246,0.3)',
  teacher:      '#EF4444',
  teacherShadow:'rgba(239,68,68,0.3)',
  success:      '#22C55E',
  submit:       '#3B82F6',
  white:        '#ffffff',
};

// ── LB watermark path (from icon (2).svg) ────────────────────────────────────
const PATH_FG = "M 376.69 731.46 C369.70,734.55 369.69,734.55 370.58,731.75 C373.31,723.08 373.70,722.57 381.65,717.04 C391.64,710.11 401.73,702.06 405.00,698.41 L 407.50 695.62 L 404.50 697.84 C392.86,706.46 377.10,716.43 376.34,715.67 C375.73,715.06 379.21,703.00 379.99,703.00 C382.42,703.00 417.38,677.51 422.50,672.01 C425.08,669.23 424.32,669.54 417.00,674.27 C409.04,679.40 383.59,693.00 381.94,693.00 C381.04,693.00 387.40,671.19 388.64,669.99 C389.11,669.53 395.26,667.04 402.30,664.46 C409.34,661.88 414.95,659.61 414.76,659.43 C414.58,659.25 410.91,660.00 406.62,661.10 C394.73,664.14 390.00,664.89 390.00,663.73 C390.00,663.17 390.91,659.68 392.01,655.96 L 394.02 649.20 L 402.76 648.01 C427.89,644.57 448.39,639.26 464.43,632.04 C469.65,629.69 473.10,627.14 478.43,621.70 C487.89,612.04 491.19,605.78 491.79,596.32 L 492.26 589.00 L 487.86 584.60 C478.45,577.22 470.34,577.37 429.22,578.13 L 428.50 578.15 C411.00,578.47 408.89,578.32 401.77,576.20 C391.93,573.28 383.97,569.66 377.00,564.96 C370.82,560.79 366.17,556.18 369.28,557.31 C385.22,563.13 404.09,563.96 438.00,560.33 C447.36,559.33 456.40,558.99 463.50,559.37 C473.90,559.93 488.52,562.72 493.32,565.07 C495.20,565.99 495.16,565.85 493.00,564.03 C482.87,555.51 457.63,549.06 434.25,549.02 C423.09,549.00 423.06,548.98 425.10,543.15 C426.17,540.07 426.34,540.00 432.35,540.03 C443.28,540.09 462.35,543.25 471.50,546.53 L 473.50 547.25 L 471.50 545.79 C466.68,542.29 451.47,538.00 436.75,535.99 C431.52,535.27 428.00,534.33 428.01,533.65 C428.01,533.02 428.48,530.81 429.05,528.74 C429.92,525.61 430.46,525.06 432.30,525.44 C449.96,528.35 479.33,538.65 489.90,544.56 L 494.50 547.12 L 490.50 543.52 C480.78,534.78 460.71,524.97 440.16,518.91 L 432.82 516.75 L 433.50 513.13 C435.15,507.94 451.60,513.63 464.50,519.13 C471.62,522.16 472.94,522.49 470.80,520.73 C466.93,517.54 452.78,510.36 444.00,507.14 C436.96,504.55 436.52,504.21 436.80,501.63 C438.92,494.08 444.71,496.63 461.04,503.82 C477.56,513.68 485.25,520.82 488.00,522.33 C488.00,520.62 471.03,504.83 463.70,499.73 C459.96,497.13 453.43,493.12 449.20,490.83 C444.96,488.53 441.34,486.54 441.15,486.40 C440.44,485.86 443.19,479.00 444.11,479.00 C445.79,479.00 458.28,486.11 465.50,491.18 L 472.50 496.09 L 466.67 490.52 C461.33,485.41 448.35,475.62 445.78,474.76 C444.61,474.37 445.38,468.52 446.91,466.10 C448.10,464.23 464.83,475.65 474.40,484.86 L 481.30 491.50 L 477.90 486.56 C471.86,477.79 462.02,468.19 441.21,450.76 C416.06,429.70 405.02,419.55 397.41,410.50 C392.50,404.65 392.10,403.93 395.02,406.10 C400.07,409.87 411.27,416.07 422.61,421.36 C431.43,425.47 432.15,425.67 429.25,423.17 C427.47,421.62 421.65,417.97 416.32,415.06 C394.03,402.85 384.87,394.74 378.48,381.53 C376.62,377.70 375.24,374.42 375.41,374.25 C375.58,374.08 380.17,376.64 385.61,379.94 C407.46,393.17 446.77,412.38 479.00,425.56 C492.17,430.95 519.20,444.78 526.86,450.05 C563.79,475.47 577.65,520.36 560.95,560.47 C555.08,574.56 547.06,584.81 532.50,596.83 L 528.50 600.13 L 536.59 596.04 C552.27,588.11 565.08,574.77 572.55,558.60 C577.24,551.91 573.41,564.28 571.13,568.74 C569.96,571.04 569.00,573.50 581.91,564.48 C586.17,558.60 589.90,553.46 586.16,565.00 C583.56,571.06 581.22,575.07 575.95,582.50 C577.05,582.15 581.00,578.05 584.96,573.96 C589.97,568.00 592.13,564.80 596.49,559.00 C597.21,559.00 594.10,567.09 590.54,574.45 C588.67,578.33 584.76,584.15 581.85,587.40 C576.18,593.74 577.13,593.66 587.00,586.97 C592.83,583.01 603.83,572.08 605.92,568.16 C608.09,564.09 607.97,566.29 605.50,576.00 C604.18,581.19 603.21,585.54 603.35,585.68 C606.45,581.88 609.94,576.94 613.42,571.99 C616.47,568.13 616.69,568.36 617.53,569.20 C608.69,594.73 605.39,601.00 601.97 607.50 L 606.99 602.06 C611.74,596.90 619.49,585.78 632.46,565.50 L 638.22 556.50 L 618.71 575.50 L 622.98 567.50 C625.32,563.10 628.29,558.10 629.56,556.40 L 631.88 553.29 L 625.39 555.65 C620.83,557.30 616.93,557.97 612.20,557.91 L 605.50 557.82 L 611.00 556.07 C616.99,554.17 627.45,549.12 626.78,548.45 C622.94,549.02 616.16,550.96 594.23,549.43 C591.50,546.82 590.86,546.20 591.50,546.10 C593.28,546.54 596.69,547.39 611.20,546.13 C610.53,545.05 610.26,544.61 608.12,543.97 C605.77,543.61 601.21,542.92 589.00,537.27 C589.00,535.85 589.00,534.73 590.28,534.78 C593.57,536.03 596.92,537.30 598.01,536.46 C595.45,534.58 593.76,533.35 593.66,532.71 C594.63,529.09 595.23,526.84 595.61,525.00 C594.92,525.00 586.53,536.62 584.38,540.39 C583.08,542.65 582.02,543.00 582.02,540.03 C585.07,531.54 588.01,526.33 589.65,523.42 C591.00,520.70 591.00,519.89 588.13,522.40 L 578.24 532.20 L 577.77 519.35 C577.51,512.28 576.99,505.79 576.61,504.92 C575.91,503.33 581.15,498.85 596.12,488.25 L 602.13 484.00 L 599.43 482.97 C595.82,481.60 591.02,477.48 588.19,473.32 L 585.88 469.93 L 588.69 470.72 C594.95,472.46 611.26,471.50 625.00,468.57 C642.82,464.77 654.17,464.71 665.50,468.36 C669.90,469.77 675.53,472.22 678.01,473.79 C683.14,477.05 690.50,484.96 692.77,489.67 C694.15,492.53 694.95,492.96 700.90,493.98 C719.80,497.23 747.50,506.14 757.50,512.18 L 760.50 513.99 L 749.30 514.00 C726.43,514.00 701.82,518.87 687.81,526.16 C681.57,529.41 677.35,532.65 670.47,539.48 C660.98,548.91 654.92,557.42 643.42,577.50 C626.49,607.07 610.28,623.18 585.50,635.05 C569.74,642.61 559.06,645.89 524.00,653.95 C493.58,660.95 465.22,675.51 446.35,693.82 C437.09,702.80 426.80,716.11 423.41,723.50 C420.42,730.02 420.42,727.66 423.42,716.50 C430.35,690.72 442.07,670.71 460.60,653.00 C474.20,640.00 489.82,629.01 507.00,620.34 C510.79,618.43 512.67,617.04 511.50,617.00 C508.50,616.91 510.88,615.76 522.50,611.69 C528.00,609.77 535.58,606.80 539.35,605.09 C548.40,601.00 569.36,587.09 566.58,587.02 C566.07,587.01 564.94,587.65 564.07,588.44 C560.61,591.57 545.48,598.26 530.94,603.09 C514.96,608.39 499.01,615.85 481.85,626.04 C466.96,634.88 459.84,640.73 446.78,654.81 C438.42,663.82 432.28,673.12 425.17,687.50 C420.33,697.28 418.73,699.46 410.67,707.32 C401.05,716.70 386.17,727.26 376.69,731.46 Z";

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const EyeIcon = ({ color = C.inkMuted }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z"
      stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    <Path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      stroke={color} strokeWidth="2"/>
  </Svg>
);

const EyeOffIcon = ({ color = C.inkMuted }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0120.71 15.68"
      stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <Path d="M1 1L23 23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </Svg>
);

const ArrowRightIcon = ({ color = C.white }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12H19M13 6L19 12L13 18"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

const CheckIcon = ({ color = C.white }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
);

// ── Logo (LB vector) — sized to match logoText height ────────────────────────
const LBLogo = ({ size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024">
    <Path d="M0 0 L1024 0 L1024 1024 L0 1024 Z" fill="rgb(250,245,234)" />
    <Path d={PATH_FG} fill="rgb(31,31,28)" />
  </Svg>
);

// ── Component ─────────────────────────────────────────────────────────────────
export default function LoginScreen({
  loginId, setLoginId,
  loginPassword, setLoginPassword,
  loginError, setLoginError,
  isLoggingIn, handleLogin,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [userMode, setUserMode] = useState('student'); // 'student' | 'teacher'
  const [focused, setFocused] = useState(null);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const studentScale = useRef(new Animated.Value(1)).current;
  const teacherScale = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const pressIn = (anim) => Animated.spring(anim, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = (anim) => Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();

  const onSubmit = () => {
    if (!loginId.trim() || !loginPassword.trim()) { shake(); return; }
    handleLogin();
  };

  const modeConfig = {
    student: { label: 'Student', color: C.student, shadow: C.studentShadow, idLabel: 'Enrollment ID', desc: 'Enter your enrollment credentials' },
    teacher: { label: 'Teacher', color: C.teacher, shadow: C.teacherShadow, idLabel: 'Employee ID',   desc: 'Enter your employee credentials' },
  };
  const current = modeConfig[userMode];

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* LB watermark — centered, faint */}
      <View style={s.watermarkWrap} pointerEvents="none">
        <Text style={s.watermark}>LB</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo row ── */}
        <View style={s.logoRow}>
          <LBLogo size={28} />
          <Text style={s.logoText}>LetsBunk</Text>
        </View>
        <Text style={s.logoSub}>Welcome back. Sign in to continue.</Text>

        {/* ── Mode switcher ── */}
        <Text style={s.sectionLabel}>ACCOUNT TYPE</Text>
        <View style={s.modeRow}>
          {(['student', 'teacher']).map((mode) => {
            const cfg = modeConfig[mode];
            const isActive = userMode === mode;
            const scaleAnim = mode === 'student' ? studentScale : teacherScale;
            return (
              <Animated.View key={mode} style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity
                  style={[
                    s.modeBtn,
                    isActive
                      ? { backgroundColor: cfg.color, borderColor: cfg.color,
                          shadowColor: cfg.shadow, shadowOpacity: 1, shadowRadius: 12, elevation: 8 }
                      : { backgroundColor: 'rgba(255,255,255,0.8)', borderColor: C.inputBorder }
                  ]}
                  onPress={() => setUserMode(mode)}
                  onPressIn={() => pressIn(scaleAnim)}
                  onPressOut={() => pressOut(scaleAnim)}
                  activeOpacity={1}
                >
                  <Text style={[s.modeBtnText, { color: isActive ? C.white : C.ink }]}>
                    {cfg.label}
                  </Text>
                  {isActive && (
                    <View style={s.checkBadge}>
                      <CheckIcon />
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* ── Form header ── */}
        <Text style={s.heading}>Sign In</Text>
        <Text style={s.headingSub}>{current.desc}</Text>

        {/* ── Inputs ── */}
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          {/* ID */}
          <Text style={s.fieldLabel}>{current.idLabel.toUpperCase()}</Text>
          <Animated.View style={[
            s.inputWrap,
            focused === 'id' && { borderColor: C.inputFocus, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 }
          ]}>
            <TextInput
              style={s.input}
              placeholder={`Enter your ${current.idLabel.toLowerCase()}`}
              placeholderTextColor="rgba(3,2,19,0.4)"
              value={loginId}
              onChangeText={t => { setLoginId(t); setLoginError(''); }}
              onFocus={() => setFocused('id')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </Animated.View>

          {/* Password */}
          <Text style={[s.fieldLabel, { marginTop: 20 }]}>PASSWORD</Text>
          <Animated.View style={[
            s.inputWrap,
            focused === 'pw' && { borderColor: C.inputFocus, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 }
          ]}>
            <TextInput
              style={[s.input, { paddingRight: 48 }]}
              placeholder="Enter your password"
              placeholderTextColor="rgba(3,2,19,0.4)"
              value={loginPassword}
              onChangeText={t => { setLoginPassword(t); setLoginError(''); }}
              onFocus={() => setFocused('pw')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            <TouchableOpacity
              style={s.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </TouchableOpacity>
          </Animated.View>

          {loginError ? <Text style={s.error}>{loginError}</Text> : null}
        </Animated.View>

        {/* ── Submit ── */}
        <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 32 }}>
          <TouchableOpacity
            style={s.submitBtn}
            onPress={onSubmit}
            onPressIn={() => pressIn(btnScale)}
            onPressOut={() => pressOut(btnScale)}
            activeOpacity={1}
            disabled={isLoggingIn}
          >
            {isLoggingIn
              ? <ActivityIndicator color={C.white} />
              : <>
                  <Text style={s.submitText}>Sign In</Text>
                  <ArrowRightIcon />
                </>
            }
          </TouchableOpacity>
        </Animated.View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <View style={s.footerDivider} />
          <Text style={s.footerText}>
            Need assistance?{' '}
            <Text style={s.footerLink}>Contact Support</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Watermark
  watermarkWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermark: {
    fontSize: Math.min(width * 0.72, height * 0.5),
    fontWeight: '900',
    color: C.watermark,
    letterSpacing: -6,
    fontStyle: 'italic',
    fontFamily: 'serif',
    opacity: 0.9,
  },

  scroll: {
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: 0.3,
  },
  logoSub: {
    fontSize: 14,
    color: C.inkMuted,
    marginBottom: 40,
  },

  // Mode switcher
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink,
    letterSpacing: 2,
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 36,
  },
  modeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0,
    position: 'relative',
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },

  // Form
  heading: {
    fontSize: 40,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -1,
    marginBottom: 6,
  },
  headingSub: {
    fontSize: 14,
    color: C.inkMuted,
    marginBottom: 28,
  },

  // Fields
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink,
    letterSpacing: 2,
    marginBottom: 8,
  },
  inputWrap: {
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: C.inputBorder,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.ink,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  error: {
    color: '#D4183D',
    fontSize: 13,
    marginTop: 10,
  },

  // Submit
  submitBtn: {
    backgroundColor: C.submit,
    borderRadius: 10,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  submitText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Footer
  footer: {
    marginTop: 48,
    alignItems: 'center',
    gap: 12,
  },
  footerDivider: {
    width: '100%',
    height: 1,
    backgroundColor: C.inkFaint,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(3,2,19,0.5)',
  },
  footerLink: {
    color: C.ink,
    fontWeight: '600',
  },
});
