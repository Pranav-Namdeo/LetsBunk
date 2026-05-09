package com.example.enrollmentapp

import android.content.Context
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
import java.net.URLEncoder

class ApiService(private val context: Context) {

    companion object {
        private const val TAG = "ApiService"
    }

    private val baseUrl: String
        get() = context.getString(R.string.server_base_url)

    private val serverBase: String
        get() = baseUrl.replace("/api", "")

    // ── Students ──────────────────────────────────────────────────────────────

    suspend fun getStudents(semester: String = "", branch: String = ""): StudentsResponse {
        return withContext(Dispatchers.IO) {
            try {
                val params = buildString {
                    if (semester.isNotEmpty()) append("semester=${URLEncoder.encode(semester, "UTF-8")}&")
                    if (branch.isNotEmpty())   append("branch=${URLEncoder.encode(branch, "UTF-8")}&")
                }
                val url = URL("$serverBase/api/students?$params")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 15000
                connection.readTimeout = 15000

                val responseCode = connection.responseCode
                val stream = if (responseCode == HttpURLConnection.HTTP_OK) connection.inputStream
                             else connection.errorStream

                val body = stream.bufferedReader().readText()
                Log.d(TAG, "getStudents response ($responseCode): ${body.take(200)}")

                val json = JSONObject(body)
                if (responseCode == HttpURLConnection.HTTP_OK && json.optBoolean("success", false)) {
                    val arr = json.optJSONArray("students") ?: JSONArray()
                    val list = mutableListOf<StudentItem>()
                    for (i in 0 until arr.length()) {
                        val s = arr.getJSONObject(i)
                        list.add(
                            StudentItem(
                                id           = s.optString("_id"),
                                enrollmentNo = s.optString("enrollmentNo"),
                                name         = s.optString("name"),
                                branch       = s.optString("branch"),
                                semester     = s.optString("semester"),
                                hasEmbedding = !s.isNull("faceEmbedding") && s.optJSONArray("faceEmbedding") != null
                            )
                        )
                    }
                    StudentsResponse(true, list, "OK")
                } else {
                    StudentsResponse(false, emptyList(), json.optString("message", "Error"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "getStudents error", e)
                StudentsResponse(false, emptyList(), "Network error: ${e.message}")
            }
        }
    }

    suspend fun getBranches(): List<String> {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$serverBase/api/config/branches")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000

                val body = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(body)
                val arr  = json.optJSONArray("branches") ?: return@withContext emptyList()
                val list = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val b = arr.getJSONObject(i)
                    list.add(b.optString("name"))
                }
                list
            } catch (e: Exception) {
                Log.e(TAG, "getBranches error", e)
                emptyList()
            }
        }
    }

    suspend fun getSemesters(): List<String> {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$serverBase/api/config/semesters")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000

                val body = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(body)
                val arr  = json.optJSONArray("semesters") ?: return@withContext emptyList()
                val list = mutableListOf<String>()
                for (i in 0 until arr.length()) list.add(arr.getString(i))
                list
            } catch (e: Exception) {
                Log.e(TAG, "getSemesters error", e)
                emptyList()
            }
        }
    }

    // ── Enrollment ────────────────────────────────────────────────────────────

    suspend fun createEnrollment(enrollmentNo: String, faceEmbedding: FloatArray): ApiResponse {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$baseUrl/enrollment")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000
                connection.readTimeout = 10000

                val embeddingArray = JSONArray()
                for (v in faceEmbedding) embeddingArray.put(v.toDouble())

                val body = JSONObject().apply {
                    put("enrollmentNo", enrollmentNo)
                    put("faceEmbedding", embeddingArray)
                }

                OutputStreamWriter(connection.outputStream).use { w ->
                    w.write(body.toString())
                    w.flush()
                }

                val responseCode = connection.responseCode
                val stream = if (responseCode == HttpURLConnection.HTTP_CREATED ||
                                 responseCode == HttpURLConnection.HTTP_OK) connection.inputStream
                             else connection.errorStream

                val responseJson = JSONObject(stream.bufferedReader().readText())
                ApiResponse(
                    responseJson.optBoolean("success", false),
                    responseJson.optString("message", "Unknown error"),
                    responseCode
                )
            } catch (e: Exception) {
                Log.e(TAG, "createEnrollment error", e)
                ApiResponse(false, "Network error: ${e.message}", 0)
            }
        }
    }

    suspend fun getStudentByEnrollment(enrollmentNo: String): StudentResponse {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$serverBase/api/students?enrollmentNo=${URLEncoder.encode(enrollmentNo, "UTF-8")}")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000

                val responseCode = connection.responseCode
                val stream = if (responseCode == HttpURLConnection.HTTP_OK) connection.inputStream
                             else connection.errorStream

                val body = stream.bufferedReader().readText()
                Log.d(TAG, "getStudentByEnrollment: $body")

                val json = JSONObject(body)
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val arr = json.optJSONArray("students")
                    if (arr != null && arr.length() > 0) {
                        val s = arr.getJSONObject(0)
                        StudentResponse(true, s.optString("name", ""), "Student found")
                    } else {
                        StudentResponse(false, "", "Student not found")
                    }
                } else {
                    StudentResponse(false, "", json.optString("message", "Student not found"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "getStudentByEnrollment error", e)
                StudentResponse(false, "", "Network error: ${e.message}")
            }
        }
    }
}

// ── Data classes ──────────────────────────────────────────────────────────────

data class ApiResponse(val success: Boolean, val message: String, val statusCode: Int)

data class StudentResponse(val success: Boolean, val studentName: String, val message: String)

data class StudentItem(
    val id: String,
    val enrollmentNo: String,
    val name: String,
    val branch: String,
    val semester: String,
    val hasEmbedding: Boolean
)

data class StudentsResponse(
    val success: Boolean,
    val students: List<StudentItem>,
    val message: String
)
