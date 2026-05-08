package com.example.enrollmentapp

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class ApiService(private val context: Context) {

    companion object {
        private const val TAG = "ApiService"
        // API key for enrollment endpoints — set this to your server's expected key
        private const val API_KEY = "letsbunk-enrollment-api-2026"
    }

    private val baseUrl: String
        get() = context.getString(R.string.server_base_url)

    /** Root server URL without the /api suffix */
    private val serverRoot: String
        get() {
            val url = baseUrl
            return if (url.endsWith("/api")) url.dropLast(4) else url
        }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun HttpURLConnection.applyCommonHeaders() {
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
        setRequestProperty("X-API-Key", API_KEY)
        connectTimeout = 15000
        readTimeout = 15000
    }

    private fun HttpURLConnection.readBody(): String {
        val stream = if (responseCode in 200..299) inputStream else errorStream
        return BufferedReader(InputStreamReader(stream)).use { it.readText() }
    }

    // ─── Endpoints ───────────────────────────────────────────────────────────

    suspend fun createEnrollment(
        enrollmentNo: String,
        faceEmbedding: FloatArray
    ): ApiResponse = withContext(Dispatchers.IO) {
        try {
            val connection = URL("$baseUrl/enrollment").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.applyCommonHeaders()

            val body = JSONObject().apply {
                put("enrollmentNo", enrollmentNo)
                put("faceEmbedding", JSONArray().also { arr ->
                    faceEmbedding.forEach { arr.put(it.toDouble()) }
                })
            }

            OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }

            val responseCode = connection.responseCode
            val responseJson = JSONObject(connection.readBody())
            Log.d(TAG, "createEnrollment [$responseCode]: $responseJson")

            ApiResponse(
                success = responseJson.optBoolean("success", false),
                message = responseJson.optString("message", "Unknown error"),
                statusCode = responseCode
            )
        } catch (e: Exception) {
            Log.e(TAG, "createEnrollment error", e)
            ApiResponse(false, "Network error: ${e.message}", 0)
        }
    }

    suspend fun verifyEnrollment(
        enrollmentNo: String,
        password: String
    ): ApiResponse = withContext(Dispatchers.IO) {
        try {
            val connection = URL("$baseUrl/enrollment/verify").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.applyCommonHeaders()

            val body = JSONObject().apply {
                put("enrollmentNo", enrollmentNo)
                put("password", password)
            }

            OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }

            val responseCode = connection.responseCode
            val responseJson = JSONObject(connection.readBody())
            Log.d(TAG, "verifyEnrollment [$responseCode]: $responseJson")

            ApiResponse(
                success = responseJson.optBoolean("success", false),
                message = responseJson.optString("message", "Unknown error"),
                statusCode = responseCode
            )
        } catch (e: Exception) {
            Log.e(TAG, "verifyEnrollment error", e)
            ApiResponse(false, "Network error: ${e.message}", 0)
        }
    }

    suspend fun getEnrollment(enrollmentNo: String): ApiResponse = withContext(Dispatchers.IO) {
        try {
            // URL-encode the enrollment number to handle special characters safely
            val encoded = Uri.encode(enrollmentNo)
            val connection = URL("$baseUrl/enrollment/$encoded").openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.applyCommonHeaders()

            val responseCode = connection.responseCode
            val responseJson = JSONObject(connection.readBody())
            Log.d(TAG, "getEnrollment [$responseCode]: $responseJson")

            ApiResponse(
                success = responseJson.optBoolean("success", false),
                message = responseJson.optString("message", "Unknown error"),
                statusCode = responseCode
            )
        } catch (e: Exception) {
            Log.e(TAG, "getEnrollment error", e)
            ApiResponse(false, "Network error: ${e.message}", 0)
        }
    }

    suspend fun getStudentByEnrollment(enrollmentNo: String): StudentResponse = withContext(Dispatchers.IO) {
        try {
            // Build URL safely using Uri.Builder — no fragile string replace
            val uri = Uri.parse("$serverRoot/api/students")
                .buildUpon()
                .appendQueryParameter("enrollmentNo", enrollmentNo)
                .build()

            val connection = URL(uri.toString()).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.applyCommonHeaders()

            val responseCode = connection.responseCode
            val body = connection.readBody()
            Log.d(TAG, "getStudentByEnrollment [$responseCode]: $body")

            val responseJson = JSONObject(body)

            if (responseCode == HttpURLConnection.HTTP_OK) {
                val studentsArray = responseJson.optJSONArray("students")
                if (studentsArray != null && studentsArray.length() > 0) {
                    val student = studentsArray.getJSONObject(0)
                    StudentResponse(true, student.optString("name", ""), "Student found")
                } else {
                    StudentResponse(false, "", "Student not found")
                }
            } else {
                StudentResponse(false, "", responseJson.optString("message", "Student not found"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "getStudentByEnrollment error", e)
            StudentResponse(false, "", "Network error: ${e.message}")
        }
    }
}

data class ApiResponse(
    val success: Boolean,
    val message: String,
    val statusCode: Int
)

data class StudentResponse(
    val success: Boolean,
    val studentName: String,
    val message: String
)
