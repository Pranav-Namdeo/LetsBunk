package com.example.enrollmentapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var enrollmentNoInput: EditText
    private lateinit var searchButton: Button
    private lateinit var studentNameText: TextView
    private lateinit var takeFacialDataButton: Button
    private lateinit var saveButton: Button
    private lateinit var statusText: TextView
    
    private val CAMERA_PERMISSION_CODE = 100
    private val CAMERA_REQUEST_CODE = 200
    
    private var faceEmbedding: FloatArray? = null
    private lateinit var apiService: ApiService
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Initialize views
        enrollmentNoInput = findViewById(R.id.enrollmentNoInput)
        searchButton = findViewById(R.id.searchButton)
        studentNameText = findViewById(R.id.studentNameText)
        takeFacialDataButton = findViewById(R.id.takeFacialDataButton)
        saveButton = findViewById(R.id.saveButton)
        statusText = findViewById(R.id.statusText)
        
        // Initialize API service
        apiService = ApiService(this)
        
        // Set up button listeners
        searchButton.setOnClickListener {
            fetchStudentName()
        }
        
        takeFacialDataButton.setOnClickListener {
            handleTakeFacialData()
        }
        
        saveButton.setOnClickListener {
            handleSave()
        }
    }
    
    private fun fetchStudentName() {
        val enrollmentNo = enrollmentNoInput.text.toString().trim()
        
        if (enrollmentNo.isEmpty()) {
            studentNameText.visibility = android.view.View.GONE
            Toast.makeText(this, "Please enter enrollment number", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Show loading state
        studentNameText.text = "Searching..."
        studentNameText.visibility = android.view.View.VISIBLE
        studentNameText.setTextColor(getColor(android.R.color.darker_gray))
        
        lifecycleScope.launch {
            try {
                val response = apiService.getStudentByEnrollment(enrollmentNo)
                
                if (response.success && response.studentName.isNotEmpty()) {
                    studentNameText.text = "Student: ${response.studentName}"
                    studentNameText.visibility = android.view.View.VISIBLE
                    studentNameText.setTextColor(getColor(android.R.color.holo_green_dark))
                } else {
                    studentNameText.text = "Student not found"
                    studentNameText.visibility = android.view.View.VISIBLE
                    studentNameText.setTextColor(getColor(android.R.color.holo_red_dark))
                    Toast.makeText(this@MainActivity, "Student not found", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                studentNameText.text = "Error: ${e.message}"
                studentNameText.visibility = android.view.View.VISIBLE
                studentNameText.setTextColor(getColor(android.R.color.holo_red_dark))
                Toast.makeText(this@MainActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
    
    private fun handleTakeFacialData() {
        if (checkCameraPermission()) {
            startCameraActivity()
        } else {
            requestCameraPermission()
        }
    }
    
    private fun startCameraActivity() {
        val intent = Intent(this, CameraActivity::class.java)
        startActivityForResult(intent, CAMERA_REQUEST_CODE)
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == CAMERA_REQUEST_CODE && resultCode == RESULT_OK) {
            faceEmbedding = data?.getFloatArrayExtra("face_embedding")
            
            if (faceEmbedding != null) {
                statusText.text = "Facial data captured successfully! (${faceEmbedding!!.size} features)"
                Toast.makeText(this, "Face captured successfully", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun handleSave() {
        val enrollmentNo = enrollmentNoInput.text.toString().trim()
        
        if (enrollmentNo.isEmpty()) {
            Toast.makeText(this, "Please enter enrollment number", Toast.LENGTH_SHORT).show()
            return
        }
        
        if (faceEmbedding == null) {
            Toast.makeText(this, "Please capture facial data first", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Show loading
        statusText.text = "Saving enrollment to server..."
        saveButton.isEnabled = false
        
        // Save to server
        lifecycleScope.launch {
            try {
                val response = apiService.createEnrollment(
                    enrollmentNo = enrollmentNo,
                    faceEmbedding = faceEmbedding!!
                )
                
                if (response.success) {
                    Toast.makeText(
                        this@MainActivity, 
                        "Enrollment saved successfully!", 
                        Toast.LENGTH_LONG
                    ).show()
                    statusText.text = "Enrollment saved for: $enrollmentNo"
                    
                    // Clear form
                    enrollmentNoInput.text.clear()
                    faceEmbedding = null
                    statusText.text = "Ready to capture"
                } else {
                    Toast.makeText(
                        this@MainActivity, 
                        "Error: ${response.message}", 
                        Toast.LENGTH_LONG
                    ).show()
                    statusText.text = "Error: ${response.message}"
                }
                
            } catch (e: Exception) {
                Toast.makeText(
                    this@MainActivity, 
                    "Network error: ${e.message}", 
                    Toast.LENGTH_LONG
                ).show()
                statusText.text = "Network error occurred"
            } finally {
                saveButton.isEnabled = true
            }
        }
    }
    
    private fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.CAMERA),
            CAMERA_PERMISSION_CODE
        )
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCameraActivity()
            } else {
                Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
