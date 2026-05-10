/**
 * Notification Service
 * 
 * Handles push notifications via Firebase Cloud Messaging (FCM)
 * for random ring verification requests.
 * 
 * Features:
 * - Send push notifications to selected students
 * - Track notification delivery status
 * - Handle notification failures with retry logic
 * - Update RandomRing records with delivery status
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let fcmInitialized = false;

/**
 * Initialize Firebase Cloud Messaging
 * Loads service account credentials from environment variable or file
 */
function initializeFCM() {
    if (fcmInitialized) {
        return true;
    }

    try {
        // Check if Firebase is already initialized
        if (admin.apps.length > 0) {
            console.log('✅ [FCM] Already initialized');
            fcmInitialized = true;
            return true;
        }

        // Try to load service account from environment variable (JSON string)
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ [FCM] Initialized from environment variable');
            fcmInitialized = true;
            return true;
        }

        // Try to load from file (for local development)
        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ [FCM] Initialized from service account file');
            fcmInitialized = true;
            return true;
        }

        console.warn('⚠️  [FCM] Not initialized - missing credentials');
        console.warn('Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH environment variable');
        return false;
    } catch (error) {
        console.error('❌ [FCM] Initialization error:', error.message);
        return false;
    }
}

/**
 * Send push notification to a single device
 * 
 * @param {string} deviceToken - FCM device token
 * @param {object} payload - Notification payload
 * @returns {Promise<object>} - Result with success status and message ID or error
 */
async function sendNotificationToDevice(deviceToken, payload) {
    if (!fcmInitialized && !initializeFCM()) {
        return {
            success: false,
            error: 'FCM not initialized'
        };
    }

    try {
        const message = {
            token: deviceToken,
            notification: {
                title: payload.title,
                body: payload.body
            },
            data: payload.data || {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'random_ring_channel'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            }
        };

        const response = await admin.messaging().send(message);
        
        return {
            success: true,
            messageId: response
        };
    } catch (error) {
        console.error('❌ [FCM] Send error:', error.message);
        
        // Check for invalid token errors
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            return {
                success: false,
                error: 'Invalid or expired device token',
                invalidToken: true
            };
        }

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Send push notification with retry logic
 * 
 * @param {string} deviceToken - FCM device token
 * @param {object} payload - Notification payload
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<object>} - Result with success status and delivery info
 */
async function sendNotificationWithRetry(deviceToken, payload, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await sendNotificationToDevice(deviceToken, payload);
        
        if (result.success) {
            return {
                success: true,
                messageId: result.messageId,
                attempts: attempt
            };
        }

        // Don't retry if token is invalid
        if (result.invalidToken) {
            return {
                success: false,
                error: result.error,
                invalidToken: true,
                attempts: attempt
            };
        }

        lastError = result.error;
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return {
        success: false,
        error: lastError,
        attempts: maxRetries
    };
}

/**
 * Send random ring notifications to multiple students
 * 
 * @param {object} randomRing - RandomRing document from database
 * @param {Array} students - Array of student documents with device tokens
 * @returns {Promise<object>} - Summary of notification delivery
 */
async function sendRandomRingNotifications(randomRing, students) {
    const startTime = Date.now();
    
    console.log(`📤 [FCM] Sending notifications to ${students.length} students`);

    const results = {
        total: students.length,
        sent: 0,
        failed: 0,
        invalidTokens: 0,
        details: []
    };

    // Create notification payload
    const payload = {
        title: 'Random Verification Required',
        body: `Verify your attendance for ${randomRing.subject}`,
        data: {
            type: 'random_ring',
            ringId: randomRing._id.toString(),
            period: randomRing.period || 'current',
            subject: randomRing.subject,
            teacher: randomRing.teacherName,
            expiresAt: randomRing.expiresAt.toISOString()
        }
    };

    // Send notifications in parallel
    const promises = students.map(async (student) => {
        const studentEntry = randomRing.selectedStudents.find(
            s => s.enrollmentNo === student.enrollmentNo
        );

        if (!studentEntry) {
            return {
                enrollmentNo: student.enrollmentNo,
                success: false,
                error: 'Student not in ring'
            };
        }

        // Check if student has device token
        if (!student.deviceToken) {
            return {
                enrollmentNo: student.enrollmentNo,
                success: false,
                error: 'No device token',
                noToken: true
            };
        }

        // Send notification with retry
        const result = await sendNotificationWithRetry(student.deviceToken, payload);

        // Update student entry in RandomRing
        studentEntry.notificationSent = result.success;
        studentEntry.notificationTime = new Date();
        studentEntry.notificationError = result.error || null;
        studentEntry.notificationAttempts = result.attempts || 0;

        return {
            enrollmentNo: student.enrollmentNo,
            success: result.success,
            messageId: result.messageId,
            error: result.error,
            invalidToken: result.invalidToken,
            attempts: result.attempts
        };
    });

    // Wait for all notifications to complete
    const deliveryResults = await Promise.all(promises);

    // Aggregate results
    for (const result of deliveryResults) {
        results.details.push(result);

        if (result.success) {
            results.sent++;
        } else {
            results.failed++;
            if (result.invalidToken) {
                results.invalidTokens++;
            }
        }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [FCM] Notifications sent: ${results.sent}/${results.total} (${duration}ms)`);
    
    if (results.failed > 0) {
        console.log(`⚠️  [FCM] Failed: ${results.failed}, Invalid tokens: ${results.invalidTokens}`);
    }

    return results;
}

/**
 * Log notification attempt for audit trail
 * 
 * @param {string} ringId - Random ring ID
 * @param {string} enrollmentNo - Student enrollment number
 * @param {boolean} success - Whether notification was sent successfully
 * @param {string} error - Error message if failed
 */
function logNotificationAttempt(ringId, enrollmentNo, success, error = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ringId,
        enrollmentNo,
        success,
        error
    };

    console.log(`📝 [FCM-LOG] ${JSON.stringify(logEntry)}`);
}

module.exports = {
    initializeFCM,
    sendNotificationToDevice,
    sendNotificationWithRetry,
    sendRandomRingNotifications,
    logNotificationAttempt
};
