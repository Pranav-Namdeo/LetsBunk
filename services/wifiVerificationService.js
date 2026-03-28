/**
 * WiFi Verification Service
 * 
 * Provides WiFi verification functionality by validating BSSID against
 * authorized classroom WiFi networks.
 * 
 * This service is used by:
 * - Check-in endpoint (initial daily verification)
 * - Random ring verification endpoint
 * - Any other endpoint requiring WiFi verification
 */

/**
 * Verify WiFi BSSID against a classroom's authorized BSSID
 * 
 * @param {String} capturedBSSID - The BSSID detected from student's device
 * @param {String} authorizedBSSID - The authorized BSSID for the classroom
 * @returns {Object} Verification result with match status
 */
function verifyBSSID(capturedBSSID, authorizedBSSID) {
    // Validate inputs
    if (!capturedBSSID || typeof capturedBSSID !== 'string') {
        return {
            success: false,
            isMatch: false,
            message: 'Invalid BSSID: captured BSSID must be a non-empty string'
        };
    }

    if (!authorizedBSSID || typeof authorizedBSSID !== 'string') {
        return {
            success: false,
            isMatch: false,
            message: 'Invalid BSSID: authorized BSSID must be a non-empty string'
        };
    }

    // Normalize BSSIDs to lowercase for case-insensitive comparison
    const normalizedCaptured = capturedBSSID.toLowerCase().trim();
    const normalizedAuthorized = authorizedBSSID.toLowerCase().trim();

    const isMatch = normalizedCaptured === normalizedAuthorized;

    return {
        success: true,
        isMatch,
        capturedBSSID: normalizedCaptured,
        authorizedBSSID: normalizedAuthorized,
        message: isMatch 
            ? 'WiFi verification successful' 
            : 'WiFi verification failed: BSSID does not match authorized network'
    };
}

/**
 * Verify WiFi BSSID against a classroom document
 * Supports array of BSSIDs (wifiBSSIDs) - handles both single and multiple BSSIDs
 * 
 * @param {String} capturedBSSID - The BSSID detected from student's device
 * @param {Object} classroom - Classroom document with wifiBSSIDs field
 * @returns {Object} Verification result with classroom context
 */
function verifyClassroomWiFi(capturedBSSID, classroom) {
    // Check if classroom exists
    if (!classroom) {
        return {
            success: false,
            isMatch: false,
            message: 'Classroom not found'
        };
    }

    // Get BSSIDs from array
    let authorizedBSSIDs = [];
    
    if (classroom.wifiBSSIDs && Array.isArray(classroom.wifiBSSIDs) && classroom.wifiBSSIDs.length > 0) {
        authorizedBSSIDs = classroom.wifiBSSIDs.filter(bssid => bssid && bssid.trim() !== '');
    }

    // Check if classroom has any WiFi configured
    if (authorizedBSSIDs.length === 0) {
        return {
            success: false,
            isMatch: false,
            message: `Classroom ${classroom.roomNumber} WiFi not configured. Please contact administrator.`,
            roomNumber: classroom.roomNumber
        };
    }

    // Normalize captured BSSID
    const normalizedCaptured = capturedBSSID ? capturedBSSID.toLowerCase().trim() : '';

    if (!normalizedCaptured) {
        return {
            success: false,
            isMatch: false,
            message: 'Invalid BSSID: captured BSSID must be a non-empty string',
            roomNumber: classroom.roomNumber
        };
    }

    // Check if captured BSSID matches ANY of the authorized BSSIDs
    let isMatch = false;
    let matchedBSSID = null;

    for (const authorizedBSSID of authorizedBSSIDs) {
        const normalizedAuthorized = authorizedBSSID.toLowerCase().trim();
        if (normalizedCaptured === normalizedAuthorized) {
            isMatch = true;
            matchedBSSID = authorizedBSSID;
            break;
        }
    }

    // Return verification result
    return {
        success: true,
        isMatch,
        capturedBSSID: normalizedCaptured,
        authorizedBSSIDs: authorizedBSSIDs,
        matchedBSSID: matchedBSSID,
        roomNumber: classroom.roomNumber,
        building: classroom.building,
        message: isMatch
            ? `WiFi verification successful for ${classroom.roomNumber}`
            : `WiFi verification failed: You must be in ${classroom.roomNumber} to check in`
    };
}

/**
 * Verify WiFi BSSID is authorized for a specific room
 * 
 * @param {String} capturedBSSID - The BSSID detected from student's device
 * @param {String} roomNumber - The room number to verify against
 * @param {Function} findClassroom - Async function to find classroom by room number
 * @returns {Promise<Object>} Verification result with authorization status
 */
async function verifyRoomAuthorization(capturedBSSID, roomNumber, findClassroom) {
    try {
        // Find classroom by room number
        const classroom = await findClassroom(roomNumber);

        if (!classroom) {
            return {
                success: false,
                isMatch: false,
                authorized: false,
                message: `Classroom ${roomNumber} not found in database`,
                roomNumber
            };
        }

        // Verify WiFi against classroom
        const result = verifyClassroomWiFi(capturedBSSID, classroom);

        return {
            ...result,
            authorized: result.isMatch
        };
    } catch (error) {
        return {
            success: false,
            isMatch: false,
            authorized: false,
            message: `Error verifying room authorization: ${error.message}`,
            error: error.message
        };
    }
}

module.exports = {
    verifyBSSID,
    verifyClassroomWiFi,
    verifyRoomAuthorization
};
