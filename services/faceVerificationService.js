/**
 * Face Verification Service
 * 
 * Provides face verification functionality by comparing captured face embeddings
 * with stored embeddings using cosine similarity.
 * 
 * This service is used by:
 * - Check-in endpoint (initial daily verification)
 * - Random ring verification endpoint
 * - Any other endpoint requiring face verification
 */

/**
 * Compare two face embeddings using cosine similarity
 * 
 * @param {Array<Number>} storedEmbedding - The stored face embedding (192 floats)
 * @param {Array<Number>} capturedEmbedding - The captured face embedding (192 floats)
 * @param {Number} threshold - Similarity threshold (default: 0.6)
 * @returns {Object} Verification result with similarity score and match status
 */
function verifyFaceEmbedding(storedEmbedding, capturedEmbedding, threshold = 0.6) {
    // Validate inputs
    if (!Array.isArray(storedEmbedding) || !Array.isArray(capturedEmbedding)) {
        return {
            success: false,
            isMatch: false,
            similarity: 0,
            message: 'Invalid embedding format: embeddings must be arrays'
        };
    }

    if (storedEmbedding.length === 0 || capturedEmbedding.length === 0) {
        return {
            success: false,
            isMatch: false,
            similarity: 0,
            message: 'Invalid embedding: embeddings cannot be empty'
        };
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const minLength = Math.min(storedEmbedding.length, capturedEmbedding.length);

    for (let i = 0; i < minLength; i++) {
        dotProduct += storedEmbedding[i] * capturedEmbedding[i];
        normA += storedEmbedding[i] * storedEmbedding[i];
        normB += capturedEmbedding[i] * capturedEmbedding[i];
    }

    // Avoid division by zero
    if (normA === 0 || normB === 0) {
        return {
            success: false,
            isMatch: false,
            similarity: 0,
            message: 'Invalid embedding: zero magnitude vector'
        };
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    const isMatch = similarity >= threshold;

    return {
        success: true,
        isMatch,
        similarity: parseFloat(similarity.toFixed(4)),
        similarityPercentage: parseFloat((similarity * 100).toFixed(2)),
        threshold,
        message: isMatch 
            ? 'Face verification successful' 
            : 'Face verification failed: similarity below threshold'
    };
}

/**
 * Verify a student's face against their stored embedding
 * 
 * @param {Object} student - Student document with faceEmbedding field
 * @param {Array<Number>} capturedEmbedding - The captured face embedding
 * @param {Number} threshold - Similarity threshold (default: 0.6)
 * @returns {Object} Verification result
 */
function verifyStudentFace(student, capturedEmbedding, threshold = 0.6) {
    // Check if student has face enrolled
    if (!student.faceEmbedding || student.faceEmbedding.length === 0) {
        return {
            success: false,
            isMatch: false,
            similarity: 0,
            message: 'Face not enrolled. Please enroll your face first.'
        };
    }

    // Perform verification
    return verifyFaceEmbedding(student.faceEmbedding, capturedEmbedding, threshold);
}

module.exports = {
    verifyFaceEmbedding,
    verifyStudentFace
};
