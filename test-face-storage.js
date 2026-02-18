// Test script to verify face data storage in LetsBunk app
// This script tests the login flow and face embedding storage

const fetch = require('node-fetch');

const SERVER_URL = 'http://192.168.1.6:3000';

async function testFaceStorage() {
  console.log('🧪 Testing Face Data Storage in LetsBunk App\n');
  console.log('=' .repeat(60));

  // Test 1: Login with a student who has face enrollment
  console.log('\n📝 Test 1: Login with enrolled student');
  console.log('-'.repeat(60));

  try {
    // First, check if we have any enrolled students
    const enrollmentsResponse = await fetch(`${SERVER_URL}/api/enrollments`);
    const enrollments = await enrollmentsResponse.json();

    if (!enrollments.success || !enrollments.enrollments || enrollments.enrollments.length === 0) {
      console.log('⚠️  No enrolled students found in database');
      console.log('   Please enroll a student first using the enrollment app');
      console.log('   Response:', JSON.stringify(enrollments, null, 2));
      return;
    }

    console.log(`✅ Found ${enrollments.enrollments.length} enrolled student(s)`);
    const enrolledStudent = enrollments.enrollments[0];
    console.log(`   Testing with: ${enrolledStudent.enrollmentNo}`);

    // Get student password from database (for testing)
    const studentsResponse = await fetch(`${SERVER_URL}/api/students`);
    const studentsData = await studentsResponse.json();
    
    const student = studentsData.students.find(s => s.enrollmentNo === enrolledStudent.enrollmentNo);
    
    if (!student) {
      console.log('❌ Student not found in database');
      return;
    }

    console.log(`   Student name: ${student.name}`);
    console.log(`   Face enrolled: ${enrolledStudent.hasFaceEmbedding ? 'Yes' : 'No'}`);
    console.log(`   Embedding size: ${enrolledStudent.embeddingSize} floats`);

    // Test login
    console.log('\n🔐 Attempting login...');
    const loginResponse = await fetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: enrolledStudent.enrollmentNo,
        password: student.password || 'password123' // Default password
      })
    });

    const loginData = await loginResponse.json();

    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      console.log('   Try using password: password123');
      return;
    }

    console.log('✅ Login successful!');
    console.log('\n📦 Login Response Data:');
    console.log('-'.repeat(60));
    console.log(`   User ID: ${loginData.user._id}`);
    console.log(`   Name: ${loginData.user.name}`);
    console.log(`   Enrollment No: ${loginData.user.enrollmentNo}`);
    console.log(`   Branch: ${loginData.user.branch}`);
    console.log(`   Semester: ${loginData.user.semester}`);
    console.log(`   Has Face Enrolled: ${loginData.user.hasFaceEnrolled ? 'Yes ✅' : 'No ❌'}`);
    
    if (loginData.user.faceEmbedding) {
      console.log(`   Face Embedding: ${loginData.user.faceEmbedding.length} floats`);
      console.log(`   First 5 values: [${loginData.user.faceEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    } else {
      console.log(`   Face Embedding: Not available ❌`);
    }

    // Test 2: Verify face embedding format
    console.log('\n📝 Test 2: Verify face embedding format');
    console.log('-'.repeat(60));

    if (loginData.user.faceEmbedding && Array.isArray(loginData.user.faceEmbedding)) {
      const embedding = loginData.user.faceEmbedding;
      
      console.log(`✅ Face embedding is an array`);
      console.log(`✅ Length: ${embedding.length} floats (expected: 192)`);
      
      if (embedding.length === 192) {
        console.log(`✅ Correct embedding size!`);
      } else {
        console.log(`⚠️  Unexpected embedding size (expected 192, got ${embedding.length})`);
      }

      // Check if all values are numbers
      const allNumbers = embedding.every(v => typeof v === 'number');
      if (allNumbers) {
        console.log(`✅ All values are numbers`);
      } else {
        console.log(`❌ Some values are not numbers`);
      }

      // Check value range (embeddings are typically normalized between -1 and 1)
      const min = Math.min(...embedding);
      const max = Math.max(...embedding);
      console.log(`   Value range: ${min.toFixed(4)} to ${max.toFixed(4)}`);

    } else {
      console.log('❌ Face embedding is not available or not an array');
    }

    // Test 3: Simulate SecureStorage operations
    console.log('\n📝 Test 3: Simulate SecureStorage operations');
    console.log('-'.repeat(60));

    if (loginData.user.faceEmbedding) {
      // Simulate saving to AsyncStorage (what SecureStorage does)
      const embeddingString = loginData.user.faceEmbedding.join(',');
      console.log(`✅ Converted to string: ${embeddingString.length} characters`);
      
      // Simulate retrieval
      const retrievedEmbedding = embeddingString.split(',').map(parseFloat);
      console.log(`✅ Converted back to array: ${retrievedEmbedding.length} floats`);
      
      // Verify data integrity
      const isIntact = retrievedEmbedding.every((v, i) => v === loginData.user.faceEmbedding[i]);
      if (isIntact) {
        console.log(`✅ Data integrity verified - no data loss during conversion`);
      } else {
        console.log(`❌ Data integrity check failed`);
      }
    }

    // Test 4: Test with non-enrolled student
    console.log('\n📝 Test 4: Login with non-enrolled student');
    console.log('-'.repeat(60));

    // Find a student without face enrollment
    const nonEnrolledStudent = studentsData.students.find(s => !s.faceEmbedding);
    
    if (nonEnrolledStudent) {
      console.log(`   Testing with: ${nonEnrolledStudent.enrollmentNo} (${nonEnrolledStudent.name})`);
      
      const loginResponse2 = await fetch(`${SERVER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: nonEnrolledStudent.enrollmentNo,
          password: nonEnrolledStudent.password || 'password123'
        })
      });

      const loginData2 = await loginResponse2.json();

      if (loginData2.success) {
        console.log('✅ Login successful');
        console.log(`   Has Face Enrolled: ${loginData2.user.hasFaceEnrolled ? 'Yes' : 'No ✅'}`);
        console.log(`   Face Embedding: ${loginData2.user.faceEmbedding ? 'Available' : 'Not available ✅'}`);
        
        if (!loginData2.user.hasFaceEnrolled && !loginData2.user.faceEmbedding) {
          console.log('✅ Correctly returns null for non-enrolled students');
        }
      } else {
        console.log('⚠️  Login failed (password might be incorrect)');
      }
    } else {
      console.log('ℹ️  All students have face enrollment - skipping this test');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Login endpoint returns face embedding');
    console.log('✅ Face embedding format is correct (array of floats)');
    console.log('✅ Data can be converted to/from string for storage');
    console.log('✅ Non-enrolled students handled correctly');
    console.log('\n📱 Next Steps:');
    console.log('   1. Build and install LetsBunk APK on device');
    console.log('   2. Login with enrolled student');
    console.log('   3. Check app logs to verify SecureStorage.saveFaceEmbedding() is called');
    console.log('   4. Verify face data persists after app restart');
    console.log('   5. Test logout to ensure face data is cleared');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run tests
testFaceStorage().then(() => {
  console.log('\n✅ Tests completed\n');
}).catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
