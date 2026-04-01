package com.letsbunk.faceverification

import kotlin.math.sqrt

class FaceComparator {
    
    companion object {
        // Threshold for face matching (cosine similarity)
        // Higher value = stricter matching
        // Range: 0.0 to 1.0
        private const val SIMILARITY_THRESHOLD = 0.75f // 75% - Very High Security
        
        // Alternative threshold for Euclidean distance
        private const val DISTANCE_THRESHOLD = 1.0f
    }
    
    /**
     * Compare two face embeddings using cosine similarity
     * Returns true if faces match
     */
    fun compareFaces(embedding1: FloatArray, embedding2: FloatArray): FaceMatchResult {
        if (embedding1.size != embedding2.size) {
            return FaceMatchResult(
                isMatch = false,
                similarity = 0f,
                distance = Float.MAX_VALUE,
                message = "Embedding size mismatch"
            )
        }
        
        // Calculate cosine similarity
        val cosineSimilarity = calculateCosineSimilarity(embedding1, embedding2)
        
        // Calculate Euclidean distance
        val euclideanDistance = calculateEuclideanDistance(embedding1, embedding2)
        
        // Determine if it's a match
        val isMatch = cosineSimilarity >= SIMILARITY_THRESHOLD
        
        val message = when {
            isMatch -> "Face verified successfully! Match: ${(cosineSimilarity * 100).toInt()}%"
            cosineSimilarity >= 0.5f -> "Partial match. Similarity: ${(cosineSimilarity * 100).toInt()}%"
            else -> "Face does not match. Similarity: ${(cosineSimilarity * 100).toInt()}%"
        }
        
        return FaceMatchResult(
            isMatch = isMatch,
            similarity = cosineSimilarity,
            distance = euclideanDistance,
            message = message
        )
    }
    
    /**
     * Calculate cosine similarity between two vectors
     * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
     */
    private fun calculateCosineSimilarity(vec1: FloatArray, vec2: FloatArray): Float {
        var dotProduct = 0.0
        var norm1 = 0.0
        var norm2 = 0.0
        
        for (i in vec1.indices) {
            dotProduct += vec1[i] * vec2[i]
            norm1 += vec1[i] * vec1[i]
            norm2 += vec2[i] * vec2[i]
        }
        
        norm1 = sqrt(norm1)
        norm2 = sqrt(norm2)
        
        return if (norm1 == 0.0 || norm2 == 0.0) {
            0f
        } else {
            (dotProduct / (norm1 * norm2)).toFloat()
        }
    }
    
    /**
     * Calculate Euclidean distance between two vectors
     * Lower value = more similar
     */
    private fun calculateEuclideanDistance(vec1: FloatArray, vec2: FloatArray): Float {
        var sum = 0.0
        
        for (i in vec1.indices) {
            val diff = vec1[i] - vec2[i]
            sum += diff * diff
        }
        
        return sqrt(sum).toFloat()
    }
    
    /**
     * Get similarity percentage (0-100)
     */
    fun getSimilarityPercentage(similarity: Float): Int {
        return (similarity * 100).toInt().coerceIn(0, 100)
    }
}

data class FaceMatchResult(
    val isMatch: Boolean,
    val similarity: Float,
    val distance: Float,
    val message: String
)
