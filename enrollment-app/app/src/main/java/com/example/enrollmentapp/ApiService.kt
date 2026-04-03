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

class ApiService(private val context: Context) {
    
    companion object {
        private const val TAG = "ApiService"
    }
    
    private val baseUrl: String
        get() = context.getString(R.string.server_base_url)
    
    suspend fun createEnrollment(
        enrollmentNo: String,
        faceEmbedding: FloatArray
    ): ApiResponse {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$baseUrl/enrollment")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                // Create JSON payload
                val jsonObject = JSONObject()
                jsonObject.put("enrollmentNo", enrollmentNo)
                
                val embeddingArray = JSONArray()
                for (value in faceEmbedding) {
                    embeddingArray.put(value.toDouble())
                }
                jsonObject.put("faceEmbedding", embeddingArray)
                
                // Send request
                val writer = OutputStreamWriter(connection.outputStream)
                writer.write(jsonObject.toString())
                writer.flush()
                writer.close()
                
                // Read response
                val responseCode = connection.responseCode
                val inputStream = if (responseCode == HttpURLConnection.HTTP_CREATED || 
                                     responseCode == HttpURLConnection.HTTP_OK) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                
                val reader = BufferedReader(InputStreamReader(inputStream))
                val response = StringBuilder()
                var line: String?
                
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                
                val responseJson = JSONObject(response.toString())
                val success = responseJson.optBoolean("success", false)
                val message = responseJson.optString("message", "Unknown error")
                
                Log.d(TAG, "Response: $responseJson")
                
                ApiResponse(success, message, responseCode)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error creating enrollment", e)
                ApiResponse(false, "Network error: ${e.message}", 0)
            }
        }
    }
    
    suspend fun verifyEnrollment(
        enrollmentNo: String,
        password: String
    ): ApiResponse {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$baseUrl/enrollment/verify")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                val jsonObject = JSONObject()
                jsonObject.put("enrollmentNo", enrollmentNo)
                jsonObject.put("password", password)
                
                val writer = OutputStreamWriter(connection.outputStream)
                writer.write(jsonObject.toString())
                writer.flush()
                writer.close()
                
                val responseCode = connection.responseCode
                val inputStream = if (responseCode == HttpURLConnection.HTTP_OK) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                
                val reader = BufferedReader(InputStreamReader(inputStream))
                val response = StringBuilder()
                var line: String?
                
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                
                val responseJson = JSONObject(response.toString())
                val success = responseJson.optBoolean("success", false)
                val message = responseJson.optString("message", "Unknown error")
                
                ApiResponse(success, message, responseCode)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error verifying enrollment", e)
                ApiResponse(false, "Network error: ${e.message}", 0)
            }
        }
    }
    
    suspend fun getEnrollment(enrollmentNo: String): ApiResponse {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$baseUrl/enrollment/$enrollmentNo")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                val responseCode = connection.responseCode
                val inputStream = if (responseCode == HttpURLConnection.HTTP_OK) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                
                val reader = BufferedReader(InputStreamReader(inputStream))
                val response = StringBuilder()
                var line: String?
                
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                
                val responseJson = JSONObject(response.toString())
                val success = responseJson.optBoolean("success", false)
                val message = responseJson.optString("message", "Unknown error")
                
                ApiResponse(success, message, responseCode)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error getting enrollment", e)
                ApiResponse(false, "Network error: ${e.message}", 0)
            }
        }
    }
    
    suspend fun getStudentByEnrollment(enrollmentNo: String): StudentResponse {
        return withContext(Dispatchers.IO) {
            try {
                // Remove /api from baseUrl and add /api/students endpoint
                val serverBase = baseUrl.replace("/api", "")
                val url = URL("$serverBase/api/students?enrollmentNo=$enrollmentNo")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "GET"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                val responseCode = connection.responseCode
                val inputStream = if (responseCode == HttpURLConnection.HTTP_OK) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                
                val reader = BufferedReader(InputStreamReader(inputStream))
                val response = StringBuilder()
                var line: String?
                
                while (reader.readLine().also { line = it } != null) {
                    response.append(line)
                }
                reader.close()
                
                Log.d(TAG, "Student response: $response")
                
                val responseJson = JSONObject(response.toString())
                
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val studentsArray = responseJson.optJSONArray("students")
                    if (studentsArray != null && studentsArray.length() > 0) {
                        val student = studentsArray.getJSONObject(0)
                        val name = student.optString("name", "")
                        StudentResponse(true, name, "Student found")
                    } else {
                        StudentResponse(false, "", "Student not found")
                    }
                } else {
                    val message = responseJson.optString("message", "Student not found")
                    StudentResponse(false, "", message)
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error getting student", e)
                StudentResponse(false, "", "Network error: ${e.message}")
            }
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
