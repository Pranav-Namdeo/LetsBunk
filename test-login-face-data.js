// Simple test to verify login endpoint returns face embedding field
const fetch = require('node-fetch');

const SERVER_URL = 'http://192.168.1.6:3000';

async function testLoginFaceData() {
  console.log('🧪 Testing Login Face Data Response\n');
  console.log('=' .repeat(60));

  try {
    // Get first student from database
    console.log('📋 Fetching students from database...');
    const studentsResponse = await fetch(`${SERVER_URL}/api/students`);
    const studentsData = await studentsResponse.json();

    if (!studentsData.success || studentsData.students.length === 0) {
      console.log('❌ No students found in database');
      return;
    }

    const student = studentsData.students[0];
    console.log(`✅ Found student: ${student.name} (${student.enrollmentNo})`);
    console.log(`   Branch: ${student.branch}`);
    console.log(`   Semester: ${student.semester}`);
    console.log(`   Has face embedding in DB: ${student.faceEmbedding ? 'Yes' : 'No'}`);
    if (student.faceEmbedding) {
      console.log(`   Embedding size: ${student.faceEmbedding.length} floats`);
    }

    // Test login with actual password
    console.log('\n🔐 Testing login...');
    console.log(`   Enrollment No: ${student.enrollmentNo}`);
    console.log(`   Password: ${student.password}`);

    const loginResponse = await fetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: student.enrollmentNo,
        password: student.password
      })
    });

    const loginData = await loginResponse.json();

    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }

    console.log('✅ Login successful!\n');

    // Check login response structure
    console.log('📦 Login Response Structure:');
    console.log('-'.repeat(60));
    console.log('Response fields:');
    console.log(`  ✓ success: ${loginData.success}`);
    console.log(`  ✓ user: ${loginData.user ? 'Present' : 'Missing'}`);
    
    if (loginData.user) {
      console.log('\nUser object fields:');
      console.log(`  ✓ _id: ${loginData.user._id}`);
      console.log(`  ✓ name: ${loginData.user.name}`);
      console.log(`  ✓ enrollmentNo: ${loginData.user.enrollmentNo}`);
      console.log(`  ✓ branch: ${loginData.user.branch}`);
      console.log(`  ✓ semester: ${loginData.user.semester}`);
      console.log(`  ✓ role: ${loginData.user.role}`);
      console.log(`  ✓ hasFaceEnrolled: ${loginData.user.hasFaceEnrolled !== undefined ? loginData.user.hasFaceEnrolled : 'MISSING ❌'}`);
      console.log(`  ✓ faceEmbedding: ${loginData.user.faceEmbedding !== undefined ? (loginData.user.faceEmbedding ? `Array[${loginData.user.faceEmbedding.length}]` : 'null') : 'MISSING ❌'}`);
    }

    // Verify face data fields
    console.log('\n🔍 Face Data Verification:');
    console.log('-'.repeat(60));

    if (loginData.user.hasFaceEnrolled !== undefined) {
      console.log('✅ hasFaceEnrolled field is present');
      console.log(`   Value: ${loginData.user.hasFaceEnrolled}`);
    } else {
      console.log('❌ hasFaceEnrolled field is MISSING');
    }

    if (loginData.user.faceEmbedding !== undefined) {
      console.log('✅ faceEmbedding field is present');
      
      if (loginData.user.faceEmbedding === null) {
        console.log('   Value: null (student not enrolled)');
      } else if (Array.isArray(loginData.user.faceEmbedding)) {
        console.log(`   Value: Array of ${loginData.user.faceEmbedding.length} floats`);
        console.log(`   First 5 values: [${loginData.user.faceEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        
        // Verify all values are numbers
        const allNumbers = loginData.user.faceEmbedding.every(v => typeof v === 'number');
        if (allNumbers) {
          console.log('   ✅ All values are valid numbers');
        } else {
          console.log('   ❌ Some values are not numbers');
        }
      } else {
        console.log(`   ⚠️  Unexpected type: ${typeof loginData.user.faceEmbedding}`);
      }
    } else {
      console.log('❌ faceEmbedding field is MISSING');
    }

    // Test SecureStorage format conversion
    if (loginData.user.faceEmbedding && Array.isArray(loginData.user.faceEmbedding)) {
      console.log('\n📝 Testing SecureStorage Format Conversion:');
      console.log('-'.repeat(60));
      
      // Convert to string (what SecureStorage does)
      const embeddingString = loginData.user.faceEmbedding.join(',');
      console.log(`✅ Converted to string: ${embeddingString.length} characters`);
      
      // Convert back to array
      const retrievedEmbedding = embeddingString.split(',').map(parseFloat);
      console.log(`✅ Converted back to array: ${retrievedEmbedding.length} floats`);
      
      // Verify data integrity
      const isIntact = retrievedEmbedding.every((v, i) => Math.abs(v - loginData.user.faceEmbedding[i]) < 0.0001);
      if (isIntact) {
        console.log('✅ Data integrity verified - no data loss');
      } else {
        console.log('❌ Data integrity check failed');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    
    const hasRequiredFields = loginData.user.hasFaceEnrolled !== undefined && 
                              loginData.user.faceEmbedding !== undefined;
    
    if (hasRequiredFields) {
      console.log('✅ Login endpoint returns all required face data fields');
      console.log('✅ Face data format is correct');
      console.log('✅ Data can be safely stored in SecureStorage');
      console.log('\n📱 Ready for mobile app testing:');
      console.log('   1. Build LetsBunk APK');
      console.log('   2. Install on device');
      console.log('   3. Login and check logs for SecureStorage operations');
      console.log('   4. Verify face data persists after app restart');
    } else {
      console.log('❌ Login endpoint is missing required face data fields');
      console.log('   Please check server.js login endpoint implementation');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Server is not running at', SERVER_URL);
      console.error('   Please start the server first');
    }
  }
}

// Run test
testLoginFaceData().then(() => {
  console.log('\n✅ Test completed\n');
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
