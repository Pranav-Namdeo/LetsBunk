// Test script for face enrollment API endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Generate a sample face embedding (192 floats)
function generateSampleEmbedding() {
    const embedding = [];
    for (let i = 0; i < 192; i++) {
        embedding.push(Math.random() * 2 - 1); // Random values between -1 and 1
    }
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
}

async function testFaceEnrollmentAPI() {
    console.log('========================================');
    console.log('Testing Face Enrollment API');
    console.log('========================================\n');

    try {
        // Test 1: Verify student exists
        console.log('Test 1: Verify student exists');
        console.log('POST /api/enrollment/verify');
        
        // First, let's get a student from the database
        const studentsResponse = await axios.get(`${BASE_URL}/students`);
        const students = studentsResponse.data.students || studentsResponse.data;
        
        if (!students || students.length === 0) {
            console.log('❌ No students found in database. Please add students first.');
            return;
        }

        const testStudent = students[0];
        console.log(`Using test student: ${testStudent.enrollmentNo} - ${testStudent.name}`);
        console.log('');

        const verifyResponse = await axios.post(`${BASE_URL}/enrollment/verify`, {
            enrollmentNo: testStudent.enrollmentNo
        });
        console.log('✅ Response:', verifyResponse.data);
        console.log('');

        // Test 2: Enroll face
        console.log('Test 2: Enroll face for student');
        console.log('POST /api/enrollment');
        
        const faceEmbedding = generateSampleEmbedding();
        const enrollResponse = await axios.post(`${BASE_URL}/enrollment`, {
            enrollmentNo: testStudent.enrollmentNo,
            faceEmbedding: faceEmbedding
        });
        console.log('✅ Response:', enrollResponse.data);
        console.log('');

        // Test 3: Get enrollment status
        console.log('Test 3: Get enrollment status');
        console.log(`GET /api/enrollment/${testStudent.enrollmentNo}`);
        
        const statusResponse = await axios.get(`${BASE_URL}/enrollment/${testStudent.enrollmentNo}`);
        console.log('✅ Response:', statusResponse.data);
        console.log('');

        // Test 4: Get all enrollments
        console.log('Test 4: Get all enrollments');
        console.log('GET /api/enrollments');
        
        const allEnrollmentsResponse = await axios.get(`${BASE_URL}/enrollments`);
        console.log('✅ Response:', allEnrollmentsResponse.data);
        console.log('');

        // Test 5: Update face enrollment
        console.log('Test 5: Update face enrollment');
        console.log(`PUT /api/enrollment/${testStudent.enrollmentNo}`);
        
        const newEmbedding = generateSampleEmbedding();
        const updateResponse = await axios.put(`${BASE_URL}/enrollment/${testStudent.enrollmentNo}`, {
            faceEmbedding: newEmbedding
        });
        console.log('✅ Response:', updateResponse.data);
        console.log('');

        // Test 6: Delete face enrollment
        console.log('Test 6: Delete face enrollment');
        console.log(`DELETE /api/enrollment/${testStudent.enrollmentNo}`);
        
        const deleteResponse = await axios.delete(`${BASE_URL}/enrollment/${testStudent.enrollmentNo}`);
        console.log('✅ Response:', deleteResponse.data);
        console.log('');

        // Test 7: Try to enroll face for non-existent student
        console.log('Test 7: Try to enroll face for non-existent student');
        console.log('POST /api/enrollment (should fail)');
        
        try {
            await axios.post(`${BASE_URL}/enrollment`, {
                enrollmentNo: 'NONEXISTENT123',
                faceEmbedding: generateSampleEmbedding()
            });
            console.log('❌ Should have failed but succeeded');
        } catch (error) {
            console.log('✅ Correctly rejected:', error.response.data);
        }
        console.log('');

        console.log('========================================');
        console.log('✅ All tests completed successfully!');
        console.log('========================================');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run tests
testFaceEnrollmentAPI();
