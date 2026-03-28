/**
 * Unit tests for Face Verification Service
 */

const { verifyFaceEmbedding, verifyStudentFace } = require('./faceVerificationService');

// Helper to generate random embedding
function generateEmbedding(length = 192) {
    return Array.from({ length }, () => Math.random() * 2 - 1);
}

// Helper to generate similar embedding (with noise)
function generateSimilarEmbedding(original, noise = 0.1) {
    return original.map(val => val + (Math.random() - 0.5) * noise);
}

console.log('🧪 Testing Face Verification Service\n');

// Test 1: Identical embeddings should match
console.log('Test 1: Identical embeddings');
const embedding1 = generateEmbedding();
const result1 = verifyFaceEmbedding(embedding1, embedding1);
console.log(`✅ Success: ${result1.success}`);
console.log(`✅ Match: ${result1.isMatch}`);
console.log(`   Similarity: ${result1.similarity} (${result1.similarityPercentage}%)`);
console.log(`   Expected: ~1.0 (100%)\n`);

// Test 2: Similar embeddings should match
console.log('Test 2: Similar embeddings (low noise)');
const embedding2 = generateEmbedding();
const similar2 = generateSimilarEmbedding(embedding2, 0.05);
const result2 = verifyFaceEmbedding(embedding2, similar2);
console.log(`✅ Success: ${result2.success}`);
console.log(`✅ Match: ${result2.isMatch}`);
console.log(`   Similarity: ${result2.similarity} (${result2.similarityPercentage}%)`);
console.log(`   Expected: >0.6 (>60%)\n`);

// Test 3: Different embeddings should not match
console.log('Test 3: Different embeddings');
const embedding3a = generateEmbedding();
const embedding3b = generateEmbedding();
const result3 = verifyFaceEmbedding(embedding3a, embedding3b);
console.log(`✅ Success: ${result3.success}`);
console.log(`❌ Match: ${result3.isMatch}`);
console.log(`   Similarity: ${result3.similarity} (${result3.similarityPercentage}%)`);
console.log(`   Expected: <0.6 (<60%)\n`);

// Test 4: Empty embeddings should fail
console.log('Test 4: Empty embeddings');
const result4 = verifyFaceEmbedding([], []);
console.log(`❌ Success: ${result4.success}`);
console.log(`❌ Match: ${result4.isMatch}`);
console.log(`   Message: ${result4.message}\n`);

// Test 5: Invalid embeddings should fail
console.log('Test 5: Invalid embeddings (not arrays)');
const result5 = verifyFaceEmbedding('not-array', 'not-array');
console.log(`❌ Success: ${result5.success}`);
console.log(`❌ Match: ${result5.isMatch}`);
console.log(`   Message: ${result5.message}\n`);

// Test 6: Custom threshold
console.log('Test 6: Custom threshold (0.8)');
const embedding6 = generateEmbedding();
const similar6 = generateSimilarEmbedding(embedding6, 0.2);
const result6 = verifyFaceEmbedding(embedding6, similar6, 0.8);
console.log(`✅ Success: ${result6.success}`);
console.log(`   Match: ${result6.isMatch}`);
console.log(`   Similarity: ${result6.similarity} (${result6.similarityPercentage}%)`);
console.log(`   Threshold: ${result6.threshold}\n`);

// Test 7: verifyStudentFace with student object
console.log('Test 7: verifyStudentFace with enrolled face');
const studentWithFace = {
    enrollmentNo: '2021001',
    name: 'Test Student',
    faceEmbedding: generateEmbedding()
};
const capturedEmbedding = generateSimilarEmbedding(studentWithFace.faceEmbedding, 0.05);
const result7 = verifyStudentFace(studentWithFace, capturedEmbedding);
console.log(`✅ Success: ${result7.success}`);
console.log(`✅ Match: ${result7.isMatch}`);
console.log(`   Similarity: ${result7.similarity} (${result7.similarityPercentage}%)\n`);

// Test 8: verifyStudentFace without enrolled face
console.log('Test 8: verifyStudentFace without enrolled face');
const studentWithoutFace = {
    enrollmentNo: '2021002',
    name: 'Test Student 2',
    faceEmbedding: []
};
const result8 = verifyStudentFace(studentWithoutFace, generateEmbedding());
console.log(`❌ Success: ${result8.success}`);
console.log(`❌ Match: ${result8.isMatch}`);
console.log(`   Message: ${result8.message}\n`);

console.log('🏁 All tests completed!');
