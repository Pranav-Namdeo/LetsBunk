/**
 * Application Configuration
 * 
 * Update SERVER_BASE_URL to point to your backend server
 * This file centralizes all server URLs for easy management
 */

// ============================================
// SERVER CONFIGURATION
// ============================================
export const SERVER_BASE_URL = (process.env.SERVER_URL || 'https://letsbunk-server.azurewebsites.net').replace(/\/+$/, '');

// Derived URLs (automatically generated from SERVER_BASE_URL)
export const API_URL = `${SERVER_BASE_URL}/api/config`;
export const SOCKET_URL = SERVER_BASE_URL;

// ============================================
// STORAGE KEYS
// ============================================
export const CACHE_KEY = '@timer_config';
export const ROLE_KEY = '@user_role';
export const STUDENT_ID_KEY = '@student_id';
export const STUDENT_NAME_KEY = '@student_name';
export const SEMESTER_KEY = '@user_semester';
export const BRANCH_KEY = '@user_branch';
export const USER_DATA_KEY = '@user_data';
export const LOGIN_ID_KEY = '@login_id';
export const THEME_KEY = '@app_theme';
export const DAILY_VERIFICATION_KEY = '@daily_verification';

// ============================================
// THEME COLORS
// ============================================
export const THEMES = {
  dark: {
    background: '#0a1628',
    cardBackground: '#0d1f3c',
    text: '#ffffff',
    textSecondary: '#00d9ff',
    primary: '#00f5ff',
    border: '#00d9ff',
    statusBar: 'light',
  },
  light: {
    background: '#fef3e2',
    cardBackground: '#ffffff',
    text: '#2c1810',
    textSecondary: '#8b6f47',
    primary: '#d97706',
    border: '#f3d5a0',
    statusBar: 'dark',
  }
};

// ============================================
// ENVIRONMENT INFO
// ============================================
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'LetsBunk';

// ============================================
// USAGE INSTRUCTIONS
// ============================================
// To update the server URL:
// 1. Change SERVER_BASE_URL above
// 2. Rebuild the app: npm run android or BUILD_APK_PROPER_SDK.bat
// 3. All API calls will automatically use the new URL
//
// Current Configuration: PRODUCTION (Azure)
// - App: https://letsbunk-server.azurewebsites.net
// - Admin Panel: https://letsbunk-server.azurewebsites.net (or update in Settings)
//
// To switch to local:
// - Change SERVER_BASE_URL to: http://localhost:3000
// - Update admin-panel/renderer.js
// - Rebuild the app
