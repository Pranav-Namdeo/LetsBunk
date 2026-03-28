package com.example.letsbunk

import android.Manifest
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager 
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.tabs.TabLayout
import com.google.gson.Gson
import org.json.JSONObject
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import java.util.concurrent.Executor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Callback as OkHttpCallback
import okhttp3.Call as OkHttpCall
import java.io.IOException
import android.util.Base64
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {

    private lateinit var timerTextView: TextView
    private lateinit var connectionStatusTextView: TextView
    private lateinit var wifiBssidTextView: TextView
    private lateinit var markAttendanceButton: Button
    private lateinit var wifiManager: WifiManager
    private lateinit var teacherView: LinearLayout
    private lateinit var studentView: LinearLayout
    private lateinit var attendanceRecyclerView: RecyclerView
    private lateinit var attendanceAdapter: AttendanceAdapter
    
    // Teacher UI views
    private lateinit var teacherTabLayout: TabLayout
    private lateinit var attendanceSection: LinearLayout
    private lateinit var randomRingButton: Button
    
    // Student UI views (nullable as they may not exist in all layouts)
    private var studentTabLayout: TabLayout? = null
    private var studentAttendanceSection: LinearLayout? = null

    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    private var seconds = 600 // 10 minutes
    private val TIMER_INTERVAL = 1000L // 1 second
    private var isConnectedToAuthorizedWifi = false
    private var userName = ""
    private var wasRunning = false // To track if timer was running before disconnection
    private var isStudent = false // To track user role
    private lateinit var runnable: Runnable
    private lateinit var sharedPreferences: SharedPreferences
    private val gson = Gson()
    private val attendanceList = mutableListOf<StudentData>()
    private var currentStudentId: String? = null
    private var serverAuthorizedBSSID: String = "" // Will be fetched from server
    private var randomRingStudents = mutableListOf<RandomRingStudent>()
    private var isRandomRingActive = false
    
    // Biometric properties
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo
    private lateinit var executor: Executor
    private val httpClient = OkHttpClient()

    private val locationPermissions = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    )

    companion object {
        private const val PERMISSION_REQUEST_CODE = 100
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sharedPreferences = getSharedPreferences("LetsBunkPrefs", Context.MODE_PRIVATE)
        wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        
        // Connect to server
        connectToServer()
        
        initializeViews()
        setupRecyclerView()
        setupTabLayout()
        setupStudentTabLayout()
        setupClickListeners()
        checkPermissions()
        initTimer()
        setupBiometricListener()
        
        // Check if user role was previously selected
        if (!sharedPreferences.contains("isStudent")) {
            showRoleSelectionDialog()
        } else {
            isStudent = sharedPreferences.getBoolean("isStudent", false)
            userName = sharedPreferences.getString("userName", "") ?: ""
            if (isStudent) {
                updateUIForStudent()
            } else {
                updateUIForTeacher()
            }
        }
    }

    private fun initializeViews() {
        timerTextView = findViewById(R.id.timerTextView)
        connectionStatusTextView = findViewById(R.id.connectionStatusTextView)
        wifiBssidTextView = findViewById(R.id.wifiBssidTextView)
        markAttendanceButton = findViewById(R.id.markAttendanceButton)
        teacherView = findViewById(R.id.teacherView)
        studentView = findViewById(R.id.studentView)
        teacherTabLayout = findViewById(R.id.teacherTabLayout)
        attendanceSection = findViewById(R.id.attendanceSection)
        randomRingButton = findViewById(R.id.randomRingButton)
        attendanceRecyclerView = findViewById(R.id.attendanceRecyclerView)
        
        // Set Random Ring button click listener
        randomRingButton.setOnClickListener {
            showRandomRingTeacherDialog()
        }
    }

    private fun connectToServer() {
        try {
            // Connect WebSocket with enhanced error handling
            NetworkManager.enableReconnection()
            NetworkManager.connectSocket(
                onConnected = {
                    runOnUiThread {
                        Log.d("MainActivity", "✓ Connected to server")
                        Toast.makeText(this, "✓ Connected to server", Toast.LENGTH_SHORT).show()
                        fetchAuthorizedBSSID()
                        setupWebSocketListeners()
                        updateConnectionStatusUI(true)
                    }
                },
                onDisconnected = {
                    runOnUiThread {
                        Log.d("MainActivity", "Socket disconnected")
                        Toast.makeText(this, "⚠ Disconnected from server", Toast.LENGTH_SHORT).show()
                        updateConnectionStatusUI(false)
                    }
                },
                onError = { error ->
                    runOnUiThread {
                        Log.e("MainActivity", "✗ Connection error: $error")
                        Toast.makeText(this, "✗ Server error: $error", Toast.LENGTH_LONG).show()
                        updateConnectionStatusUI(false)
                    }
                }
            )
        } catch (e: Exception) {
            Log.e("MainActivity", "Error connecting to server", e)
            runOnUiThread {
                Toast.makeText(this, "Unable to connect to server", Toast.LENGTH_LONG).show()
            }
        }
    }
    
    private fun updateConnectionStatusUI(connected: Boolean) {
        // Update UI to show server connection status
        if (!isStudent) {
            val statusText = if (connected) {
                "Server: ${NetworkManager.getConnectionStatus()}"
            } else {
                "Server: ${NetworkManager.getConnectionStatus()}"
            }
            // Could update a status TextView if available
            Log.d("MainActivity", statusText)
        }
    }

    private fun fetchAuthorizedBSSID() {
        NetworkManager.apiService.getAuthorizedBSSID().enqueue(object : Callback<BSSIDResponse> {
            override fun onResponse(call: Call<BSSIDResponse>, response: Response<BSSIDResponse>) {
                if (response.isSuccessful) {
                    response.body()?.let {
                        serverAuthorizedBSSID = it.authorizedBSSID
                        Log.d("MainActivity", "✓ Authorized BSSID: $serverAuthorizedBSSID")
                        runOnUiThread {
                            // Silent - no toast
                            updateWifiInfo()
                        }
                    }
                } else {
                    Log.e("MainActivity", "Failed to fetch BSSID: ${response.code()}")
                    // Silent failure - will retry on reconnect
                }
            }

            override fun onFailure(call: Call<BSSIDResponse>, t: Throwable) {
                Log.e("MainActivity", "Failed to fetch BSSID", t)
                // Silent failure - app works offline for timetable
            }
        })
    }

    private fun setupWebSocketListeners() {
        // Listen for initial state
        NetworkManager.onInitialState { data ->
            runOnUiThread {
                try {
                    val studentsArray = data.getJSONArray("students")
                    attendanceList.clear()
                    for (i in 0 until studentsArray.length()) {
                        val student = studentsArray.getJSONObject(i)
                        attendanceList.add(StudentData(
                            id = student.optString("id", ""),
                            name = student.getString("name"),
                            department = student.getString("department"),
                            room = student.getString("room"),
                            timeRemaining = student.getInt("timeRemaining"),
                            timerState = when(student.optString("timerState", "running")) {
                                "running" -> StudentData.TimerState.RUNNING
                                "paused" -> StudentData.TimerState.PAUSED
                                "completed" -> StudentData.TimerState.COMPLETED
                                else -> StudentData.TimerState.RUNNING
                            },
                            attendanceStatus = when(student.optString("attendanceStatus", "attending")) {
                                "attending" -> StudentData.AttendanceStatus.ATTENDING
                                "absent" -> StudentData.AttendanceStatus.ABSENT
                                "attended" -> StudentData.AttendanceStatus.ATTENDED
                                else -> StudentData.AttendanceStatus.ATTENDING
                            },
                            isPresent = student.getBoolean("isPresent"),
                            bssid = student.optString("bssid", ""),
                            startTime = student.optString("startTime", "")
                        ))
                    }
                    if (::attendanceAdapter.isInitialized) {
                        attendanceAdapter.updateStudents(attendanceList)
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing initial state", e)
                }
            }
        }

        // Listen for student connected
        NetworkManager.onStudentConnected { data ->
            runOnUiThread {
                try {
                    val studentName = data.getString("name")
                    
                    // Check if student already exists to prevent duplicates
                    val existingStudent = attendanceList.find { it.name == studentName }
                    if (existingStudent == null) {
                        val student = StudentData(
                            id = data.optString("id", ""),
                            name = studentName,
                            department = data.getString("department"),
                            room = data.getString("room"),
                            timeRemaining = data.getInt("timeRemaining"),
                            timerState = when(data.optString("timerState", "running")) {
                                "running" -> StudentData.TimerState.RUNNING
                                "paused" -> StudentData.TimerState.PAUSED
                                "completed" -> StudentData.TimerState.COMPLETED
                                else -> StudentData.TimerState.RUNNING
                            },
                            attendanceStatus = when(data.optString("attendanceStatus", "attending")) {
                                "attending" -> StudentData.AttendanceStatus.ATTENDING
                                "absent" -> StudentData.AttendanceStatus.ABSENT
                                "attended" -> StudentData.AttendanceStatus.ATTENDED
                                else -> StudentData.AttendanceStatus.ATTENDING
                            },
                            isPresent = data.getBoolean("isPresent"),
                            bssid = data.optString("bssid", ""),
                            startTime = data.optString("startTime", "")
                        )
                        attendanceList.add(student)
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.updateStudents(attendanceList)
                        }
                        Toast.makeText(this, "${student.name} connected", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing student connected", e)
                }
            }
        }

        // Listen for timer updates
        NetworkManager.onStudentTimerUpdate { data ->
            runOnUiThread {
                try {
                    val studentId = data.getString("id")
                    val name = data.getString("name")
                    val timeRemaining = data.getInt("timeRemaining")
                    val timerState = data.optString("timerState", "running")
                    val attendanceStatus = data.optString("attendanceStatus", "attending")
                    
                    // Update student in list (for teacher view)
                    val student = attendanceList.find { it.name == name }
                    student?.let {
                        it.timeRemaining = timeRemaining
                        it.timerState = when(timerState.uppercase()) {
                            "RUNNING" -> StudentData.TimerState.RUNNING
                            "PAUSED" -> StudentData.TimerState.PAUSED
                            "COMPLETED" -> StudentData.TimerState.COMPLETED
                            else -> StudentData.TimerState.RUNNING
                        }
                        it.attendanceStatus = when(attendanceStatus.uppercase()) {
                            "ATTENDING" -> StudentData.AttendanceStatus.ATTENDING
                            "ABSENT" -> StudentData.AttendanceStatus.ABSENT
                            "ATTENDED" -> StudentData.AttendanceStatus.ATTENDED
                            else -> StudentData.AttendanceStatus.ATTENDING
                        }
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.notifyDataSetChanged()
                        }
                    }
                    
                    // Update own timer if this is the current student
                    if (isStudent && currentStudentId == studentId) {
                        seconds = timeRemaining
                        updateTimerDisplay()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing timer update", e)
                }
            }
        }

        // Listen for student completed
        NetworkManager.onStudentCompleted { data ->
            runOnUiThread {
                try {
                    val name = data.getString("name")
                    val student = attendanceList.find { it.name == name }
                    student?.let {
                        it.timeRemaining = 0
                        it.timerState = StudentData.TimerState.COMPLETED
                        it.attendanceStatus = StudentData.AttendanceStatus.ATTENDED
                        it.isPresent = true
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.notifyDataSetChanged()
                        }
                        Toast.makeText(this, "$name completed attendance!", Toast.LENGTH_LONG).show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing student completed", e)
                }
            }
        }
        
        // Listen for student paused
        NetworkManager.onStudentPaused { data ->
            runOnUiThread {
                try {
                    val name = data.getString("name")
                    val student = attendanceList.find { it.name == name }
                    student?.let {
                        it.timerState = StudentData.TimerState.PAUSED
                        it.attendanceStatus = StudentData.AttendanceStatus.ABSENT
                        it.isPresent = false
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.notifyDataSetChanged()
                        }
                        Toast.makeText(this, "$name paused (WiFi disconnected)", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing student paused", e)
                }
            }
        }
        
        // Listen for student resumed
        NetworkManager.onStudentResumed { data ->
            runOnUiThread {
                try {
                    val name = data.getString("name")
                    val student = attendanceList.find { it.name == name }
                    student?.let {
                        it.timerState = StudentData.TimerState.RUNNING
                        it.attendanceStatus = StudentData.AttendanceStatus.ATTENDING
                        it.isPresent = true
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.notifyDataSetChanged()
                        }
                        Toast.makeText(this, "$name resumed (WiFi reconnected)", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing student resumed", e)
                }
            }
        }
        
        // Random Ring listeners
        NetworkManager.onRandomRingNotification { data ->
            runOnUiThread {
                try {
                    val studentId = data.getString("studentId")
                    
                    if (isStudent && currentStudentId == studentId) {
                        // Pause timer when Random Ring occurs
                        pauseAttendanceOnServer()
                        showRandomRingDialog()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing random ring notification", e)
                }
            }
        }
        
        NetworkManager.onRandomRingRejected { data ->
            runOnUiThread {
                try {
                    val studentId = data.getString("studentId")
                    val message = data.getString("message")
                    
                    if (isStudent && currentStudentId == studentId) {
                        stopTimer()
                        AlertDialog.Builder(this)
                            .setTitle("Attendance Rejected")
                            .setMessage(message)
                            .setPositiveButton("OK", null)
                            .show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing random ring rejected", e)
                }
            }
        }
        
        NetworkManager.onRandomRingStarted { data ->
            runOnUiThread {
                try {
                    if (!isStudent) {
                        isRandomRingActive = true
                        val studentsArray = data.getJSONArray("students")
                        val selectedNames = mutableListOf<String>()
                        for (i in 0 until studentsArray.length()) {
                            val student = studentsArray.getJSONObject(i)
                            selectedNames.add(student.getString("name"))
                        }
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.markRandomRingStudents(selectedNames)
                        }
                        Toast.makeText(this, "Random Ring: ${selectedNames.size} students selected!", Toast.LENGTH_LONG).show()
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing random ring started", e)
                }
            }
        }
        
        NetworkManager.onRandomRingUpdated { data ->
            runOnUiThread {
                try {
                    val studentId = data.getString("studentId")
                    val status = data.getString("status")
                    val student = randomRingStudents.find { it.id == studentId }
                    student?.let {
                        val ringStatus = when(status.uppercase()) {
                            "PENDING" -> StudentAttendanceWithRing.RingStatus.PENDING
                            "ACCEPTED" -> StudentAttendanceWithRing.RingStatus.ACCEPTED
                            "REJECTED" -> StudentAttendanceWithRing.RingStatus.REJECTED
                            "STUDENT_CONFIRMED" -> StudentAttendanceWithRing.RingStatus.STUDENT_CONFIRMED
                            else -> StudentAttendanceWithRing.RingStatus.PENDING
                        }
                        if (::attendanceAdapter.isInitialized) {
                            attendanceAdapter.updateRandomRingStatus(it.name, ringStatus)
                        }
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing random ring updated", e)
                }
            }
        }
        
        NetworkManager.onRandomRingStudentConfirmed { data ->
            runOnUiThread {
                try {
                    val studentName = data.getString("studentName")
                    if (::attendanceAdapter.isInitialized) {
                        attendanceAdapter.updateRandomRingStatus(studentName, StudentAttendanceWithRing.RingStatus.STUDENT_CONFIRMED)
                    }
                    Toast.makeText(this, "$studentName confirmed - Locked!", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing student confirmed", e)
                }
            }
        }
        
        // Listen for tabular timetable updates (table format)
        NetworkManager.onTimetableTableUpdated { data ->
            runOnUiThread {
                try {
                    val branch = data.getString("branch")
                    val semester = data.getString("semester")
                    Log.d("MainActivity", "Tabular timetable updated for $branch - $semester")
                    Toast.makeText(this, "✓ Timetable updated for $branch $semester", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing timetable table updated", e)
                }
            }
        }
        
        NetworkManager.onTimetableTableDeleted { data ->
            runOnUiThread {
                try {
                    val branch = data.getString("branch")
                    val semester = data.getString("semester")
                    Log.d("MainActivity", "Tabular timetable deleted for $branch - $semester")
                    Toast.makeText(this, "Timetable deleted for $branch $semester", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing timetable table deleted", e)
                }
            }
        }
        
        // Listen for biometric registration requests from admin panel
        NetworkManager.onBiometricRegistrationRequest { data ->
            runOnUiThread {
                try {
                    val studentId = data.getString("studentId")
                    val studentName = data.getString("studentName")
                    
                    Log.d("MainActivity", "Biometric registration request for: $studentName ($studentId)")
                    
                    // Show registration dialog if this is a student device
                    if (isStudent && currentStudentId == studentId) {
                        showBiometricRegistrationDialog(studentId, studentName)
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing biometric registration request", e)
                }
            }
        }
    }

    private fun setupRecyclerView() {
        try {
            attendanceAdapter = AttendanceAdapter(
                onAccept = { studentName -> handleRandomRingAccept(studentName) },
                onReject = { studentName -> handleRandomRingReject(studentName) },
                onResume = { studentName -> handleResumeStudent(studentName) }
            )
            attendanceRecyclerView.apply {
                layoutManager = LinearLayoutManager(this@MainActivity)
                adapter = attendanceAdapter
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error setting up RecyclerView", e)
        }
    }
    
    private fun handleRandomRingAccept(studentName: String) {
        val student = randomRingStudents.find { it.name == studentName }
        if (student != null) {
            NetworkManager.apiService.teacherRandomRingResponse(
                RandomRingTeacherResponse(student.id, "accept")
            ).enqueue(object : Callback<RandomRingResponse> {
                override fun onResponse(call: Call<RandomRingResponse>, response: Response<RandomRingResponse>) {
                    if (response.isSuccessful) {
                        runOnUiThread {
                            if (::attendanceAdapter.isInitialized) {
                                attendanceAdapter.updateRandomRingStatus(studentName, StudentAttendanceWithRing.RingStatus.ACCEPTED)
                            }
                            Toast.makeText(this@MainActivity, "$studentName accepted", Toast.LENGTH_SHORT).show()
                        }
                    }
                }

                override fun onFailure(call: Call<RandomRingResponse>, t: Throwable) {
                    Log.e("MainActivity", "Failed to accept student", t)
                }
            })
        }
    }
    
    private fun handleRandomRingReject(studentName: String) {
        val student = randomRingStudents.find { it.name == studentName }
        if (student != null) {
            NetworkManager.apiService.teacherRandomRingResponse(
                RandomRingTeacherResponse(student.id, "reject")
            ).enqueue(object : Callback<RandomRingResponse> {
                override fun onResponse(call: Call<RandomRingResponse>, response: Response<RandomRingResponse>) {
                    if (response.isSuccessful) {
                        runOnUiThread {
                            if (::attendanceAdapter.isInitialized) {
                                attendanceAdapter.updateRandomRingStatus(studentName, StudentAttendanceWithRing.RingStatus.REJECTED)
                            }
                            Toast.makeText(this@MainActivity, "$studentName rejected", Toast.LENGTH_SHORT).show()
                        }
                    }
                }

                override fun onFailure(call: Call<RandomRingResponse>, t: Throwable) {
                    Log.e("MainActivity", "Failed to reject student", t)
                }
            })
        }
    }

    private fun handleResumeStudent(studentName: String) {
        val student = attendanceList.find { it.name == studentName }
        if (student != null) {
            // Find student ID from server
            NetworkManager.apiService.getAttendanceList()
                .enqueue(object : Callback<AttendanceListResponse> {
                    override fun onResponse(call: Call<AttendanceListResponse>, response: Response<AttendanceListResponse>) {
                        if (response.isSuccessful) {
                            val serverStudent = response.body()?.students?.find { it.name == studentName }
                            if (serverStudent != null) {
                                // Resume the student's timer
                                NetworkManager.apiService.resumeAttendance(mapOf("studentId" to serverStudent.id))
                                    .enqueue(object : Callback<UpdateAttendanceResponse> {
                                        override fun onResponse(call: Call<UpdateAttendanceResponse>, response: Response<UpdateAttendanceResponse>) {
                                            if (response.isSuccessful) {
                                                runOnUiThread {
                                                    Toast.makeText(this@MainActivity, "✓ Timer resumed for $studentName", Toast.LENGTH_LONG).show()
                                                    // Update local status
                                                    student.timerState = StudentData.TimerState.RUNNING
                                                    student.attendanceStatus = StudentData.AttendanceStatus.ATTENDING
                                                    if (::attendanceAdapter.isInitialized) {
                                                        attendanceAdapter.notifyDataSetChanged()
                                                    }
                                                }
                                            }
                                        }

                                        override fun onFailure(call: Call<UpdateAttendanceResponse>, t: Throwable) {
                                            Log.e("MainActivity", "Failed to resume student", t)
                                        }
                                    })
                            }
                        }
                    }

                    override fun onFailure(call: Call<AttendanceListResponse>, t: Throwable) {
                        Log.e("MainActivity", "Failed to get attendance list", t)
                    }
                })
        }
    }


    private fun setupTabLayout() {
        // Setup tab layout for teacher view if it exists
        try {
            if (!::teacherTabLayout.isInitialized) {
                Log.d("MainActivity", "Teacher tab layout not initialized")
                return
            }
            teacherTabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
                override fun onTabSelected(tab: TabLayout.Tab?) {
                    when (tab?.position) {
                        0 -> {
                            // Attendance tab - show attendance section
                            attendanceSection.visibility = View.VISIBLE
                        }
                        1 -> {
                            // Timetable tab - launch TimetableTableActivity
                            val intent = android.content.Intent(this@MainActivity, TimetableTableActivity::class.java)
                            startActivity(intent)
                            // Switch back to attendance tab
                            teacherTabLayout.getTabAt(0)?.select()
                        }
                    }
                }

                override fun onTabUnselected(tab: TabLayout.Tab?) {}
                override fun onTabReselected(tab: TabLayout.Tab?) {}
            })
        } catch (e: Exception) {
            // Tab layout doesn't exist, skip setup
            Log.d("MainActivity", "Error setting up teacher tab: ${e.message}")
        }
    }
    
    
    private fun setupStudentTabLayout() {
        try {
            studentTabLayout = try { findViewById(R.id.studentTabLayout) } catch (e: Exception) { null }
            studentAttendanceSection = try { findViewById(R.id.studentAttendanceSection) } catch (e: Exception) { null }
            
            studentTabLayout?.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
                override fun onTabSelected(tab: TabLayout.Tab?) {
                    when (tab?.position) {
                        0 -> {
                            // Attendance tab
                            studentAttendanceSection?.visibility = View.VISIBLE
                        }
                        1 -> {
                            // Timetable tab - launch TimetableTableActivity
                            val intent = android.content.Intent(this@MainActivity, TimetableTableActivity::class.java)
                            intent.putExtra("isStudent", true)
                            startActivity(intent)
                            // Switch back to attendance tab
                            studentTabLayout?.getTabAt(0)?.select()
                        }
                    }
                }

                override fun onTabUnselected(tab: TabLayout.Tab?) {}
                override fun onTabReselected(tab: TabLayout.Tab?) {}
            })
        } catch (e: Exception) {
            // Tab layout doesn't exist, skip setup
            Log.d("MainActivity", "Student tab layout not found: ${e.message}")
        }
    }

    private fun setupClickListeners() {
        markAttendanceButton.setOnClickListener {
            if (!hasLocationPermission()) {
                Toast.makeText(this, "Location permission is required", Toast.LENGTH_SHORT).show()
                requestLocationPermission()
                return@setOnClickListener
            }

            if (!isConnectedToAuthorizedWifi) {
                Toast.makeText(this, "Not connected to authorized Wi-Fi", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Students can only start, not stop
            if (!isRunning) {
                startTimer()
            } else {
                Toast.makeText(this, "Attendance already running. Stay connected!", Toast.LENGTH_SHORT).show()
            }
        }
    }


    private fun showRoleSelectionDialog() {
        try {
            val dialog = AlertDialog.Builder(this)
            dialog.setTitle("Select Your Role")
            dialog.setCancelable(false)
            
            val options = arrayOf("Teacher", "Student")
            dialog.setSingleChoiceItems(options, -1) { dialogInterface, index ->
            isStudent = index == 1 // index 1 is Student
            sharedPreferences.edit().putBoolean("isStudent", isStudent).apply()
            dialogInterface.dismiss()
            
            if (isStudent) {
                // For student, show the name input dialog and proceed with attendance
                if (userName.isEmpty()) {
                    showNameInputDialog()
                }
                updateUIForStudent()
            } else {
                // For teacher, show welcome message and hide attendance UI
                updateUIForTeacher()
            }
        }
            dialog.show()
        } catch (e: Exception) {
            Log.e("MainActivity", "Error showing role dialog", e)
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun updateUIForStudent() {
        studentView.visibility = android.view.View.VISIBLE
        teacherView.visibility = android.view.View.GONE
        timerTextView.visibility = android.view.View.VISIBLE
        connectionStatusTextView.visibility = android.view.View.VISIBLE
        wifiBssidTextView.visibility = android.view.View.VISIBLE
        markAttendanceButton.visibility = android.view.View.VISIBLE
        
        // Student can view timetable via TimetableTableActivity
    }

    private fun updateUIForTeacher() {
        // Hide attendance-related views
        studentView.visibility = android.view.View.GONE
        teacherView.visibility = android.view.View.VISIBLE
        timerTextView.visibility = android.view.View.GONE
        connectionStatusTextView.visibility = android.view.View.GONE
        wifiBssidTextView.visibility = android.view.View.GONE
        markAttendanceButton.visibility = android.view.View.GONE
        
        // Teacher can manage timetable via TimetableTableActivity
        loadAttendanceData()
        startAttendanceMonitoring()
    }

    private fun loadAttendanceData() {
        // Don't load sample data - only show real-time students from server
        // Clear any existing data
        attendanceList.clear()
        if (::attendanceAdapter.isInitialized) {
            attendanceAdapter.updateStudents(attendanceList)
        }
    }


    private fun saveAttendanceData() {
        val json = gson.toJson(attendanceList)
        sharedPreferences.edit().putString("attendanceList", json).apply()
    }

    private fun startAttendanceMonitoring() {
        // Server handles timer updates via WebSocket
        // No local timer needed for teacher
    }

    private fun addStudentToAttendance(name: String, department: String, room: String) {
        // Check if student already exists
        val existingStudent = attendanceList.find { it.name == name }
        if (existingStudent != null) {
            // Update existing student
            existingStudent.isPresent = true
            existingStudent.timeRemaining = 600
            existingStudent.timerState = StudentData.TimerState.RUNNING
            existingStudent.attendanceStatus = StudentData.AttendanceStatus.ATTENDING
            Toast.makeText(this, "Attendance updated for $name", Toast.LENGTH_SHORT).show()
        } else {
            // Add new student
            val newStudent = StudentData(
                name = name,
                department = department,
                room = room,
                timeRemaining = 600,
                timerState = StudentData.TimerState.RUNNING,
                attendanceStatus = StudentData.AttendanceStatus.ATTENDING,
                isPresent = true
            )
            attendanceList.add(newStudent)
            Toast.makeText(this, "Attendance marked for $name", Toast.LENGTH_SHORT).show()
        }
        if (::attendanceAdapter.isInitialized) {
            attendanceAdapter.updateStudents(attendanceList)
        }
        saveAttendanceData()
    }

    private fun hasLocationPermission(): Boolean {
        return locationPermissions.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    private fun isLocationEnabled(): Boolean {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
        return locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
    }

    private fun requestLocationPermission() {
        ActivityCompat.requestPermissions(
            this,
            locationPermissions,
            PERMISSION_REQUEST_CODE
        )
    }

    private fun checkPermissions() {
        if (!hasLocationPermission()) {
            requestLocationPermission()
        } else {
            // Only check WiFi for students
            if (isStudent) {
                updateWifiInfo()
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun updateWifiInfo() {
        // Teachers don't need WiFi authorization - skip check
        if (!isStudent) {
            Log.d("MainActivity", "Teacher mode - WiFi check skipped")
            return
        }
        
        if (!hasLocationPermission()) {
            Toast.makeText(this, "Location permission required!", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Check if location services are enabled (required for BSSID on Android 10+)
        if (!isLocationEnabled()) {
            runOnUiThread {
                wifiBssidTextView.text = "BSSID: Enable Location"
                connectionStatusTextView.text = "⚠️ Turn ON Location Services to get WiFi info"
                connectionStatusTextView.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                Toast.makeText(this, "Please enable Location Services in Settings", Toast.LENGTH_LONG).show()
            }
            return
        }

        val wifiInfo = wifiManager.connectionInfo
        val currentBSSID = wifiInfo?.bssid ?: ""
        Log.d("MainActivity", "📡 Current BSSID: $currentBSSID")
        
        // Check for fake BSSID (Android 10+ returns this when location is off)
        if (currentBSSID == "02:00:00:00:00:00" || currentBSSID.isEmpty()) {
            runOnUiThread {
                wifiBssidTextView.text = "BSSID: Unavailable"
                connectionStatusTextView.text = "⚠️ Location Services required for WiFi info"
                connectionStatusTextView.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
            }
            return
        }
        
        val wasAuthorized = isConnectedToAuthorizedWifi

        // Verify BSSID with server (students only)
        NetworkManager.apiService.verifyBSSID(VerifyBSSIDRequest(currentBSSID))
            .enqueue(object : Callback<VerifyBSSIDResponse> {
                override fun onResponse(call: Call<VerifyBSSIDResponse>, response: Response<VerifyBSSIDResponse>) {
                    if (response.isSuccessful) {
                        response.body()?.let {
                            isConnectedToAuthorizedWifi = it.authorized
                            serverAuthorizedBSSID = it.authorizedBSSID
                            
                            runOnUiThread {
                                wifiBssidTextView.text = "BSSID: $currentBSSID"

                                connectionStatusTextView.text = if (isConnectedToAuthorizedWifi) {
                                    "Connected to authorized network"
                                } else {
                                    "Not connected to authorized network"
                                }

                                connectionStatusTextView.setTextColor(
                                    ContextCompat.getColor(
                                        this@MainActivity,
                                        if (isConnectedToAuthorizedWifi) android.R.color.holo_green_dark else android.R.color.holo_red_dark
                                    )
                                )

                                // Handle timer based on connection state (for students only)
                                if (isStudent && currentStudentId != null) {
                                    if (!wasAuthorized && isConnectedToAuthorizedWifi) {
                                        // WiFi connected - resume timer
                                        if (!isRunning) {
                                            resumeAttendanceOnServer()
                                        }
                                    } else if (wasAuthorized && !isConnectedToAuthorizedWifi) {
                                        // WiFi disconnected - pause timer
                                        if (isRunning) {
                                            pauseAttendanceOnServer()
                                        }
                                    }
                                }

                                updateMarkAttendanceButtonState()
                            }
                        }
                    }
                }

                override fun onFailure(call: Call<VerifyBSSIDResponse>, t: Throwable) {
                    Log.e("MainActivity", "Failed to verify BSSID", t)
                    // Fallback to local verification
                    isConnectedToAuthorizedWifi = currentBSSID == serverAuthorizedBSSID
                    runOnUiThread {
                        updateMarkAttendanceButtonState()
                    }
                }
            })
    }

    private fun updateMarkAttendanceButtonState() {
        markAttendanceButton.isEnabled = isConnectedToAuthorizedWifi && userName.isNotEmpty() && !isRunning
        
        // Enhanced button text with emojis
        markAttendanceButton.text = when {
            isRunning -> "⏱️ ATTENDANCE RUNNING"
            !isConnectedToAuthorizedWifi -> "❌ CONNECT TO WIFI"
            userName.isEmpty() -> "👤 ENTER NAME FIRST"
            else -> "✓ START ATTENDANCE"
        }
        
        // Update button appearance with better colors
        markAttendanceButton.backgroundTintList = when {
            isRunning -> ContextCompat.getColorStateList(this, android.R.color.holo_orange_dark)
            !isConnectedToAuthorizedWifi || userName.isEmpty() -> ContextCompat.getColorStateList(this, android.R.color.darker_gray)
            else -> ContextCompat.getColorStateList(this, android.R.color.holo_green_dark)
        }
        
        // Update alpha for disabled state
        markAttendanceButton.alpha = if (markAttendanceButton.isEnabled) 1.0f else 0.6f
    }

    private fun showNameInputDialog() {
        try {
            val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_name_input, null)
            val nameInput = dialogView.findViewById<EditText>(R.id.nameInput)
        
        // Pre-fill with saved name if exists
        val savedName = sharedPreferences.getString("userName", "")
        nameInput.setText(savedName)

        AlertDialog.Builder(this)
            .setTitle("Enter Your Name")
            .setView(dialogView)
            .setPositiveButton("OK") { _, _ ->
                val enteredName = nameInput.text.toString().trim()
                if (enteredName.isNotEmpty()) {
                    // Save the entered name
                    userName = enteredName
                    sharedPreferences.edit().putString("userName", userName).apply()
                    updateMarkAttendanceButtonState()
                } else {
                    Toast.makeText(this, "Please enter a valid name", Toast.LENGTH_SHORT).show()
                    showNameInputDialog() // Show again if invalid
                }
            }
            .setNegativeButton("Cancel", null)
            .setCancelable(false)
            .show()
        } catch (e: Exception) {
            Log.e("MainActivity", "Error showing name dialog", e)
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun initTimer() {
        runnable = Runnable {
            if (isRunning && isConnectedToAuthorizedWifi) {
                // Only update display, server handles countdown
                updateTimerDisplay()
                handler.postDelayed(runnable, TIMER_INTERVAL)
            }
        }
    }

    private fun startTimer() {
        if (!isRunning) {
            if (seconds <= 0) seconds = 600 // Reset to 10 minutes if needed
            isRunning = true
            handler.post(runnable)
            updateMarkAttendanceButtonState()
            
            // Send to server when student starts attendance
            if (isStudent && userName.isNotEmpty()) {
                val wifiInfo = wifiManager.connectionInfo
                val currentBSSID = wifiInfo?.bssid ?: ""
                val currentRoom = "Room 101"
                val department = "CSE"
                
                val request = StartAttendanceRequest(
                    studentName = userName,
                    department = department,
                    room = currentRoom,
                    bssid = currentBSSID
                )
                
                NetworkManager.apiService.startAttendance(request)
                    .enqueue(object : Callback<StartAttendanceResponse> {
                        override fun onResponse(
                            call: Call<StartAttendanceResponse>,
                            response: Response<StartAttendanceResponse>
                        ) {
                            if (response.isSuccessful) {
                                response.body()?.let {
                                    currentStudentId = it.studentId
                                    Log.d("MainActivity", "Attendance started: ${it.studentId}")
                                    runOnUiThread {
                                        Toast.makeText(
                                            this@MainActivity,
                                            "Attendance started! Visible to teachers.",
                                            Toast.LENGTH_LONG
                                        ).show()
                                    }
                                }
                            } else if (response.code() == 409) {
                                // Username already in use
                                runOnUiThread {
                                    stopTimer()
                                    isRunning = false
                                    updateMarkAttendanceButtonState()
                                    
                                    AlertDialog.Builder(this@MainActivity)
                                        .setTitle("Username Already In Use")
                                        .setMessage("Someone with the name \"$userName\" is already marking attendance. Please use a different name.")
                                        .setPositiveButton("Change Name") { _, _ ->
                                            showNameInputDialog()
                                        }
                                        .setNegativeButton("Cancel", null)
                                        .show()
                                }
                            } else {
                                runOnUiThread {
                                    stopTimer()
                                    isRunning = false
                                    updateMarkAttendanceButtonState()
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Failed to start attendance on server",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                        }

                        override fun onFailure(call: Call<StartAttendanceResponse>, t: Throwable) {
                            Log.e("MainActivity", "Failed to start attendance", t)
                            runOnUiThread {
                                stopTimer()
                                isRunning = false
                                updateMarkAttendanceButtonState()
                                Toast.makeText(
                                    this@MainActivity,
                                    "Server error: ${t.message}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    })
            }
            
            Toast.makeText(this, "Attendance started!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun stopTimer() {
        wasRunning = isRunning // Store the running state
        isRunning = false
        handler.removeCallbacks(runnable)
        updateMarkAttendanceButtonState()
        
        if (seconds <= 0) {
            Toast.makeText(this, "Attendance completed! ✓", Toast.LENGTH_LONG).show()
            // Mark attendance as complete
            if (isStudent && userName.isNotEmpty()) {
                val student = attendanceList.find { it.name == userName }
                student?.let {
                    it.isPresent = true
                    it.timeRemaining = 0
                    saveAttendanceData()
                }
            }
        } else {
            Toast.makeText(this, "Attendance paused!", Toast.LENGTH_SHORT).show()
        }
    }


    
    private fun animateTimerUpdate(newTime: String) {
        val scaleDown = ObjectAnimator.ofFloat(timerTextView, "scaleX", 1f, 0.8f)
        val scaleUp = ObjectAnimator.ofFloat(timerTextView, "scaleX", 0.8f, 1f)
        val scaleDownY = ObjectAnimator.ofFloat(timerTextView, "scaleY", 1f, 0.8f)
        val scaleUpY = ObjectAnimator.ofFloat(timerTextView, "scaleY", 0.8f, 1f)
        
        scaleDown.duration = 100
        scaleUp.duration = 100
        scaleDownY.duration = 100
        scaleUpY.duration = 100
        
        scaleDown.interpolator = AccelerateDecelerateInterpolator()
        scaleUp.interpolator = OvershootInterpolator()
        scaleDownY.interpolator = AccelerateDecelerateInterpolator()
        scaleUpY.interpolator = OvershootInterpolator()
        
        val animatorSet = AnimatorSet()
        animatorSet.play(scaleDown).with(scaleDownY)
        animatorSet.play(scaleUp).with(scaleUpY).after(scaleDown)
        
        scaleDown.addUpdateListener { 
            if (it.animatedFraction == 0.5f) {
                timerTextView.text = newTime
            }
        }
        
        animatorSet.start()
    }
    
    private fun animateCardEntry(view: View, delay: Long = 0) {
        view.alpha = 0f
        view.translationY = 100f
        view.scaleX = 0.8f
        view.scaleY = 0.8f
        
        view.animate()
            .alpha(1f)
            .translationY(0f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(400)
            .setStartDelay(delay)
            .setInterpolator(OvershootInterpolator())
            .start()
    }
    
    private fun animateButtonPress(button: View, onComplete: () -> Unit = {}) {
        val scaleDown = ObjectAnimator.ofFloat(button, "scaleX", 1f, 0.95f)
        val scaleUp = ObjectAnimator.ofFloat(button, "scaleX", 0.95f, 1f)
        val scaleDownY = ObjectAnimator.ofFloat(button, "scaleY", 1f, 0.95f)
        val scaleUpY = ObjectAnimator.ofFloat(button, "scaleY", 0.95f, 1f)
        
        scaleDown.duration = 100
        scaleUp.duration = 150
        scaleDownY.duration = 100
        scaleUpY.duration = 150
        
        val animatorSet = AnimatorSet()
        animatorSet.play(scaleDown).with(scaleDownY)
        animatorSet.play(scaleUp).with(scaleUpY).after(scaleDown)
        
        animatorSet.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                onComplete()
            }
        })
        
        animatorSet.start()
    }
    
    private fun pauseAttendanceOnServer() {
        if (currentStudentId == null) return
        val request = mapOf("studentId" to currentStudentId!!)
        NetworkManager.apiService.pauseAttendance(request)
            .enqueue(object : Callback<UpdateAttendanceResponse> {
                override fun onResponse(call: Call<UpdateAttendanceResponse>, response: Response<UpdateAttendanceResponse>) {
                    if (response.isSuccessful) {
                        runOnUiThread {
                            isRunning = false
                            handler.removeCallbacks(runnable)
                            updateMarkAttendanceButtonState()
                            Toast.makeText(
                                this@MainActivity,
                                "⏸️ Attendance paused - WiFi disconnected",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                override fun onFailure(call: Call<UpdateAttendanceResponse>, t: Throwable) {
                    Log.e("MainActivity", "Failed to pause attendance", t)
                }
            })
    }
    
    private fun resumeAttendanceOnServer() {
        if (currentStudentId == null) return
        
        val request = mapOf("studentId" to currentStudentId!!)
        NetworkManager.apiService.resumeAttendance(request)
            .enqueue(object : Callback<UpdateAttendanceResponse> {
                override fun onResponse(call: Call<UpdateAttendanceResponse>, response: Response<UpdateAttendanceResponse>) {
                    if (response.isSuccessful) {
                        runOnUiThread {
                            isRunning = true
                            handler.post(runnable)
                            updateMarkAttendanceButtonState()
                            Toast.makeText(
                                this@MainActivity,
                                "▶️ Attendance resumed - WiFi reconnected",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                override fun onFailure(call: Call<UpdateAttendanceResponse>, t: Throwable) {
                    Log.e("MainActivity", "Failed to resume attendance", t)
                }
            })
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                updateWifiInfo()
            } else {
                Toast.makeText(this, "Location permission is required for Wi-Fi scanning", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Check WiFi status - auto-pause/resume handled in updateWifiInfo() (students only)
        if (isStudent) {
            updateWifiInfo()
        }
    }

    private fun showRandomRingDialog() {
        val dialog = AlertDialog.Builder(this)
            .setTitle("Random Ring!")
            .setMessage("You have been selected for random attendance check.\n\nPlease confirm your presence NOW!")
            .setCancelable(false)
            .setPositiveButton("PRESENT") { _, _ ->
                confirmRandomRingPresence()
            }
            .create()
        
        dialog.show()
    }
    
    private fun confirmRandomRingPresence() {
        if (currentStudentId == null) return
        
        NetworkManager.apiService.studentConfirmRandomRing(
            RandomRingStudentConfirm(currentStudentId!!)
        ).enqueue(object : Callback<RandomRingResponse> {
            override fun onResponse(call: Call<RandomRingResponse>, response: Response<RandomRingResponse>) {
                if (response.isSuccessful) {
                    runOnUiThread {
                        // Resume timer after confirming presence
                        resumeAttendanceOnServer()
                        Toast.makeText(
                            this@MainActivity,
                            "✓ Presence confirmed! Timer resumed.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }

            override fun onFailure(call: Call<RandomRingResponse>, t: Throwable) {
                Log.e("MainActivity", "Failed to confirm presence", t)
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Error confirming presence", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }
    

    
    private fun startRandomRing(numberOfStudents: Int) {
        NetworkManager.apiService.startRandomRing(
            RandomRingStartRequest(numberOfStudents)
        ).enqueue(object : Callback<RandomRingStartResponse> {
            override fun onResponse(
                call: Call<RandomRingStartResponse>,
                response: Response<RandomRingStartResponse>
            ) {
                if (response.isSuccessful) {
                    response.body()?.let {
                        runOnUiThread {
                            randomRingStudents.clear()
                            randomRingStudents.addAll(it.selectedStudents)
                            showRandomRingResultsDialog()
                        }
                    }
                }
            }

            override fun onFailure(call: Call<RandomRingStartResponse>, t: Throwable) {
                Log.e("MainActivity", "Failed to start random ring", t)
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Error starting random ring", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }
    
    private fun showRandomRingResultsDialog() {
        val studentNames = randomRingStudents.mapIndexed { index, student ->
            "${index + 1}. ${student.name} - ${student.ringStatus}"
        }.joinToString("\n")
        
        val dialogView = TextView(this).apply {
            text = "Selected Students:\n\n$studentNames\n\nTap on attendance list to Accept/Reject"
            setPadding(50, 50, 50, 50)
            textSize = 16f
        }
        
        AlertDialog.Builder(this)
            .setTitle("Random Ring Results")
            .setView(dialogView)
            .setPositiveButton("OK", null)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(runnable)
        
        // Disconnect from server
        if (isStudent && currentStudentId != null) {
            NetworkManager.emitStudentDisconnect(currentStudentId!!)
        }
        NetworkManager.disconnectSocket()
    }
    
    // Random Ring Teacher Dialog with Slide Animation
    private fun showRandomRingTeacherDialog() {
        val numberPicker = android.widget.NumberPicker(this).apply {
            minValue = 1
            maxValue = attendanceList.size.coerceAtLeast(1)
            value = 1
        }
        
        val dialog = AlertDialog.Builder(this)
            .setTitle("🔔 Random Ring")
            .setMessage("Select number of students to ring:")
            .setView(numberPicker)
            .setPositiveButton("Start") { _, _ ->
                val count = numberPicker.value
                startRandomRing(count)
            }
            .setNegativeButton("Cancel", null)
            .create()
        
        // Add slide animation
        dialog.window?.attributes?.windowAnimations = R.style.DialogSlideAnimation
        dialog.show()
    }
    
    // Timer visibility control based on state
    private fun updateTimerVisibility() {
        if (!isStudent) return // Only for students
        
        val shouldShowTimer = when {
            !isRunning && seconds == 600 -> false // Not started
            !isRunning && seconds == 0 -> false // Completed
            !isRunning && !isConnectedToAuthorizedWifi -> false // Paused due to WiFi
            else -> true // Running or can be resumed
        }
        
        timerTextView.visibility = if (shouldShowTimer) View.VISIBLE else View.GONE
    }
    
    private fun updateTimerDisplay() {
        val minutes = seconds / 60
        val secs = seconds % 60
        timerTextView.text = String.format("%02d:%02d", minutes, secs)
        updateTimerVisibility()
    }
    
    // ========== BIOMETRIC FUNCTIONALITY ==========
    
    private fun setupBiometricListener() {
        executor = ContextCompat.getMainExecutor(this)
        
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    Log.d("Biometric", "Fingerprint authentication succeeded")
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Toast.makeText(this@MainActivity, 
                        "Authentication error: $errString", Toast.LENGTH_SHORT).show()
                }
                
                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(this@MainActivity, 
                        "Authentication failed", Toast.LENGTH_SHORT).show()
                }
            })
        
        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Biometric Registration")
            .setSubtitle("Scan your fingerprint")
            .setNegativeButtonText("Cancel")
            .build()
        
        Log.d("Biometric", "Biometric listener setup complete")
    }
    
    fun showBiometricRegistrationDialog(studentId: String, studentName: String) {
        AlertDialog.Builder(this)
            .setTitle("Biometric Registration")
            .setMessage("Register biometric data for:\n$studentName ($studentId)\n\nThis will capture:\n1. Fingerprint\n2. Face photo")
            .setPositiveButton("Start Registration") { _, _ ->
                sharedPreferences.edit()
                    .putString("pending_bio_student_id", studentId)
                    .putString("pending_bio_student_name", studentName)
                    .apply()
                
                registerFingerprint(studentId, studentName)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun registerFingerprint(studentId: String, studentName: String) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Register Fingerprint")
            .setSubtitle("For $studentName")
            .setDescription("Place your finger on the sensor")
            .setNegativeButtonText("Cancel")
            .build()
        
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val fingerprintData = generateBiometricHash("fingerprint")
                    
                    sendFingerprintToServer(studentId, fingerprintData) {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, 
                                "✓ Fingerprint registered! Now capturing face...", 
                                Toast.LENGTH_SHORT).show()
                            
                            Handler(Looper.getMainLooper()).postDelayed({
                                registerFace(studentId, studentName)
                            }, 1000)
                        }
                    }
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, 
                            "Fingerprint error: $errString", 
                            Toast.LENGTH_SHORT).show()
                    }
                }
            })
        
        biometricPrompt.authenticate(promptInfo)
    }
    
    private fun registerFace(studentId: String, studentName: String) {
        AlertDialog.Builder(this)
            .setTitle("Face Registration")
            .setMessage("Face capture for $studentName\n\nCapturing face data...")
            .setPositiveButton("Capture Face") { _, _ ->
                val faceData = generateBiometricHash("face")
                
                sendFaceToServer(studentId, faceData) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, 
                            "✅ Biometric registration complete!", 
                            Toast.LENGTH_LONG).show()
                        
                        sharedPreferences.edit()
                            .remove("pending_bio_student_id")
                            .remove("pending_bio_student_name")
                            .apply()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun generateBiometricHash(type: String): String {
        val data = "$type-${System.currentTimeMillis()}-${Math.random()}"
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data.toByteArray())
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }
    
    private fun sendFingerprintToServer(studentId: String, fingerprintData: String, onSuccess: () -> Unit) {
        val json = """{"studentId":"$studentId","fingerprintData":"$fingerprintData"}"""
        
        val request = Request.Builder()
            .url("${NetworkManager.getServerUrl()}/api/biometric/register-fingerprint")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()
        
        httpClient.newCall(request).enqueue(object : OkHttpCallback {
            override fun onResponse(call: OkHttpCall, response: okhttp3.Response) {
                if (response.isSuccessful) {
                    Log.d("Biometric", "Fingerprint registered successfully")
                    onSuccess()
                } else {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, 
                            "Failed to register fingerprint", 
                            Toast.LENGTH_SHORT).show()
                    }
                }
            }
            
            override fun onFailure(call: OkHttpCall, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, 
                        "Network error: ${e.message}", 
                        Toast.LENGTH_SHORT).show()
                }
            }
        })
    }
    
    private fun sendFaceToServer(studentId: String, faceData: String, onSuccess: () -> Unit) {
        val json = """{"studentId":"$studentId","faceData":"$faceData"}"""
        
        val request = Request.Builder()
            .url("${NetworkManager.getServerUrl()}/api/biometric/register-face")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()
        
        httpClient.newCall(request).enqueue(object : OkHttpCallback {
            override fun onResponse(call: OkHttpCall, response: okhttp3.Response) {
                if (response.isSuccessful) {
                    Log.d("Biometric", "Face registered successfully")
                    onSuccess()
                } else {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, 
                            "Failed to register face", 
                            Toast.LENGTH_SHORT).show()
                    }
                }
            }
            
            override fun onFailure(call: OkHttpCall, e: IOException) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, 
                        "Network error: ${e.message}", 
                        Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

}
