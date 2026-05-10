/**
 * Unit tests for WiFi Verification Service
 */

const { verifyBSSID, verifyClassroomWiFi, verifyRoomAuthorization } = require('./wifiVerificationService');

console.log('🧪 Testing WiFi Verification Service\n');

// Test 1: Matching BSSIDs (case-insensitive)
console.log('Test 1: Matching BSSIDs (case-insensitive)');
const result1 = verifyBSSID('B4:86:18:6F:FB:EC', 'b4:86:18:6f:fb:ec');
console.log(`✅ Success: ${result1.success}`);
console.log(`✅ Match: ${result1.isMatch}`);
console.log(`   Message: ${result1.message}\n`);

// Test 2: Non-matching BSSIDs
console.log('Test 2: Non-matching BSSIDs');
const result2 = verifyBSSID('AA:BB:CC:DD:EE:FF', 'B4:86:18:6F:FB:EC');
console.log(`✅ Success: ${result2.success}`);
console.log(`❌ Match: ${result2.isMatch}`);
console.log(`   Message: ${result2.message}\n`);

// Test 3: BSSIDs with whitespace
console.log('Test 3: BSSIDs with whitespace');
const result3 = verifyBSSID('  B4:86:18:6F:FB:EC  ', 'b4:86:18:6f:fb:ec');
console.log(`✅ Success: ${result3.success}`);
console.log(`✅ Match: ${result3.isMatch}`);
console.log(`   Captured: ${result3.capturedBSSID}`);
console.log(`   Authorized: ${result3.authorizedBSSID}\n`);

// Test 4: Empty captured BSSID
console.log('Test 4: Empty captured BSSID');
const result4 = verifyBSSID('', 'B4:86:18:6F:FB:EC');
console.log(`❌ Success: ${result4.success}`);
console.log(`❌ Match: ${result4.isMatch}`);
console.log(`   Message: ${result4.message}\n`);

// Test 5: Null captured BSSID
console.log('Test 5: Null captured BSSID');
const result5 = verifyBSSID(null, 'B4:86:18:6F:FB:EC');
console.log(`❌ Success: ${result5.success}`);
console.log(`❌ Match: ${result5.isMatch}`);
console.log(`   Message: ${result5.message}\n`);

// Test 6: Empty authorized BSSID
console.log('Test 6: Empty authorized BSSID');
const result6 = verifyBSSID('B4:86:18:6F:FB:EC', '');
console.log(`❌ Success: ${result6.success}`);
console.log(`❌ Match: ${result6.isMatch}`);
console.log(`   Message: ${result6.message}\n`);

// Test 7: Valid classroom WiFi verification
console.log('Test 7: Valid classroom WiFi verification');
const classroom1 = {
    roomNumber: 'Room 301',
    building: 'Main Building',
    wifiBSSID: 'b4:86:18:6f:fb:ec'
};
const result7 = verifyClassroomWiFi('B4:86:18:6F:FB:EC', classroom1);
console.log(`✅ Success: ${result7.success}`);
console.log(`✅ Match: ${result7.isMatch}`);
console.log(`   Room: ${result7.roomNumber}`);
console.log(`   Message: ${result7.message}\n`);

// Test 8: Wrong classroom WiFi
console.log('Test 8: Wrong classroom WiFi');
const classroom2 = {
    roomNumber: 'Room 301',
    building: 'Main Building',
    wifiBSSID: 'b4:86:18:6f:fb:ec'
};
const result8 = verifyClassroomWiFi('AA:BB:CC:DD:EE:FF', classroom2);
console.log(`✅ Success: ${result8.success}`);
console.log(`❌ Match: ${result8.isMatch}`);
console.log(`   Message: ${result8.message}\n`);

// Test 9: Null classroom
console.log('Test 9: Null classroom');
const result9 = verifyClassroomWiFi('B4:86:18:6F:FB:EC', null);
console.log(`❌ Success: ${result9.success}`);
console.log(`❌ Match: ${result9.isMatch}`);
console.log(`   Message: ${result9.message}\n`);

// Test 10: Classroom without WiFi configured
console.log('Test 10: Classroom without WiFi configured');
const classroom3 = {
    roomNumber: 'Room 301',
    building: 'Main Building',
    wifiBSSID: ''
};
const result10 = verifyClassroomWiFi('B4:86:18:6F:FB:EC', classroom3);
console.log(`❌ Success: ${result10.success}`);
console.log(`❌ Match: ${result10.isMatch}`);
console.log(`   Message: ${result10.message}\n`);

// Test 11: Classroom with missing wifiBSSID field
console.log('Test 11: Classroom with missing wifiBSSID field');
const classroom4 = {
    roomNumber: 'Room 301',
    building: 'Main Building'
};
const result11 = verifyClassroomWiFi('B4:86:18:6F:FB:EC', classroom4);
console.log(`❌ Success: ${result11.success}`);
console.log(`❌ Match: ${result11.isMatch}`);
console.log(`   Message: ${result11.message}\n`);

// Test 12: Room authorization with valid BSSID
console.log('Test 12: Room authorization with valid BSSID');
const mockFindClassroom1 = async (roomNumber) => ({
    roomNumber: 'Room 301',
    building: 'Main Building',
    wifiBSSID: 'b4:86:18:6f:fb:ec'
});
verifyRoomAuthorization('B4:86:18:6F:FB:EC', 'Room 301', mockFindClassroom1)
    .then(result => {
        console.log(`✅ Success: ${result.success}`);
        console.log(`✅ Match: ${result.isMatch}`);
        console.log(`✅ Authorized: ${result.authorized}`);
        console.log(`   Message: ${result.message}\n`);
    });

// Test 13: Room authorization with invalid BSSID
console.log('Test 13: Room authorization with invalid BSSID');
const mockFindClassroom2 = async (roomNumber) => ({
    roomNumber: 'Room 301',
    building: 'Main Building',
    wifiBSSID: 'b4:86:18:6f:fb:ec'
});
verifyRoomAuthorization('AA:BB:CC:DD:EE:FF', 'Room 301', mockFindClassroom2)
    .then(result => {
        console.log(`✅ Success: ${result.success}`);
        console.log(`❌ Match: ${result.isMatch}`);
        console.log(`❌ Authorized: ${result.authorized}`);
        console.log(`   Message: ${result.message}\n`);
    });

// Test 14: Room authorization with non-existent room
console.log('Test 14: Room authorization with non-existent room');
const mockFindClassroom3 = async (roomNumber) => null;
verifyRoomAuthorization('B4:86:18:6F:FB:EC', 'Room 999', mockFindClassroom3)
    .then(result => {
        console.log(`❌ Success: ${result.success}`);
        console.log(`❌ Match: ${result.isMatch}`);
        console.log(`❌ Authorized: ${result.authorized}`);
        console.log(`   Message: ${result.message}\n`);
    });

// Test 15: Room authorization with database error
console.log('Test 15: Room authorization with database error');
const mockFindClassroom4 = async (roomNumber) => {
    throw new Error('Database connection failed');
};
verifyRoomAuthorization('B4:86:18:6F:FB:EC', 'Room 301', mockFindClassroom4)
    .then(result => {
        console.log(`❌ Success: ${result.success}`);
        console.log(`❌ Match: ${result.isMatch}`);
        console.log(`❌ Authorized: ${result.authorized}`);
        console.log(`   Message: ${result.message}\n`);
        console.log('🏁 All tests completed!');
    });
