package com.example.enrollmentapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
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

    private var faceEmbedding: FloatArray? = null
    private lateinit var apiService: ApiService

    // ── Modern Activity Result API (replaces deprecated onActivityResult) ────
    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val embedding = result.data?.getFloatArrayExtra("face_embedding")
            if (embedding != null) {
                faceEmbedding = embedding
                statusText.text = "Facial data captured! (${embedding.size} features)"
                Toast.makeText(this, "Face captured successfully", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startCameraActivity()
        } else {
            Toast.makeText(this, "Camera permission is required", Toast.LENGTH_SHORT).show()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        enrollmentNoInput  = findViewById(R.id.enrollmentNoInput)
        searchButton       = findViewById(R.id.searchButton)
        studentNameText    = findViewById(R.id.studentNameText)
        takeFacialDataButton = findViewById(R.id.takeFacialDataButton)
        saveButton         = findViewById(R.id.saveButton)
        statusText         = findViewById(R.id.statusText)

        apiService = ApiService(this)

        searchButton.setOnClickListener { fetchStudentName() }
        takeFacialDataButton.setOnClickListener { handleTakeFacialData() }
        saveButton.setOnClickListener { handleSave() }
    }

    private fun fetchStudentName() {
        val enrollmentNo = enrollmentNoInput.text.toString().trim()
        if (enrollmentNo.isEmpty()) {
            studentNameText.visibility = android.view.View.GONE
            Toast.makeText(this, "Please enter enrollment number", Toast.LENGTH_SHORT).show()
            return
        }

        studentNameText.text = "Searching..."
        studentNameText.visibility = android.view.View.VISIBLE
        studentNameText.setTextColor(getColor(android.R.color.darker_gray))

        lifecycleScope.launch {
            val response = apiService.getStudentByEnrollment(enrollmentNo)
            if (response.success && response.studentName.isNotEmpty()) {
                studentNameText.text = "Student: ${response.studentName}"
                studentNameText.setTextColor(getColor(android.R.color.holo_green_dark))
            } else {
                studentNameText.text = "Student not found"
                studentNameText.setTextColor(getColor(android.R.color.holo_red_dark))
                Toast.makeText(this@MainActivity, response.message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleTakeFacialData() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCameraActivity()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCameraActivity() {
        cameraLauncher.launch(Intent(this, CameraActivity::class.java))
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

        statusText.text = "Saving enrollment to server..."
        saveButton.isEnabled = false

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
                    // Reset form
                    enrollmentNoInput.text.clear()
                    studentNameText.visibility = android.view.View.GONE
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
}
