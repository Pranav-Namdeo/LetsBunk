package com.example.enrollmentapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    // ── Views ──────────────────────────────────────────────────────────────────
    private lateinit var semesterSpinner: Spinner
    private lateinit var branchSpinner: Spinner
    private lateinit var searchInput: EditText
    private lateinit var statsText: TextView
    private lateinit var pageText: TextView
    private lateinit var headerSubtitle: TextView
    private lateinit var studentRecyclerView: RecyclerView
    private lateinit var paginationBar: View
    private lateinit var prevButton: Button
    private lateinit var nextButton: Button
    private lateinit var pageIndicator: TextView

    // ── State ──────────────────────────────────────────────────────────────────
    private lateinit var apiService: ApiService
    private lateinit var adapter: StudentAdapter

    private var allStudents: List<StudentItem> = emptyList()   // full filtered list
    private var displayedStudents: List<StudentItem> = emptyList() // after search
    private val pageSize = 50
    private var currentPage = 0  // 0-indexed

    private var selectedSemester = ""
    private var selectedBranch   = ""
    private var searchQuery      = ""

    private var semesterList: List<String> = emptyList()
    private var branchList: List<String>   = emptyList()

    // Pending enrollment after camera
    private var pendingStudent: StudentItem? = null
    private var faceEmbedding: FloatArray?   = null

    private val CAMERA_PERMISSION_CODE = 100
    private val CAMERA_REQUEST_CODE    = 200

    private var searchDebounceJob: Job? = null

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        apiService = ApiService(this)

        bindViews()
        setupRecyclerView()
        setupSearch()
        setupPagination()
        loadFilters()
    }

    private fun bindViews() {
        semesterSpinner    = findViewById(R.id.semesterSpinner)
        branchSpinner      = findViewById(R.id.branchSpinner)
        searchInput        = findViewById(R.id.searchInput)
        statsText          = findViewById(R.id.statsText)
        pageText           = findViewById(R.id.pageText)
        headerSubtitle     = findViewById(R.id.headerSubtitle)
        studentRecyclerView = findViewById(R.id.studentRecyclerView)
        paginationBar      = findViewById(R.id.paginationBar)
        prevButton         = findViewById(R.id.prevButton)
        nextButton         = findViewById(R.id.nextButton)
        pageIndicator      = findViewById(R.id.pageIndicator)
    }

    private fun setupRecyclerView() {
        adapter = StudentAdapter { student -> onStudentClicked(student) }
        studentRecyclerView.layoutManager = LinearLayoutManager(this)
        studentRecyclerView.adapter = adapter
    }

    private fun setupSearch() {
        searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                searchDebounceJob?.cancel()
                searchDebounceJob = lifecycleScope.launch {
                    delay(300)
                    searchQuery = s?.toString()?.trim() ?: ""
                    currentPage = 0
                    applySearchAndPaginate()
                }
            }
        })
    }

    private fun setupPagination() {
        prevButton.setOnClickListener {
            if (currentPage > 0) {
                currentPage--
                renderPage()
                studentRecyclerView.scrollToPosition(0)
            }
        }
        nextButton.setOnClickListener {
            val totalPages = totalPages()
            if (currentPage < totalPages - 1) {
                currentPage++
                renderPage()
                studentRecyclerView.scrollToPosition(0)
            }
        }
    }

    // ── Load filters from server ───────────────────────────────────────────────

    private fun loadFilters() {
        statsText.text = "Loading filters..."
        lifecycleScope.launch {
            val semesters = apiService.getSemesters()
            val branches  = apiService.getBranches()

            semesterList = listOf("All Semesters") + semesters
            branchList   = listOf("All Branches")  + branches

            setupSemesterSpinner()
            setupBranchSpinner()

            // Load all students initially
            loadStudents()
        }
    }

    private fun setupSemesterSpinner() {
        val spinnerAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, semesterList)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        semesterSpinner.adapter = spinnerAdapter

        semesterSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val sel = semesterList[position]
                selectedSemester = if (sel == "All Semesters") "" else sel
                currentPage = 0
                loadStudents()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun setupBranchSpinner() {
        val spinnerAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, branchList)
        spinnerAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        branchSpinner.adapter = spinnerAdapter

        branchSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val sel = branchList[position]
                selectedBranch = if (sel == "All Branches") "" else sel
                currentPage = 0
                loadStudents()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    // ── Load students ──────────────────────────────────────────────────────────

    private fun loadStudents() {
        statsText.text = "Fetching students..."
        paginationBar.visibility = View.GONE

        lifecycleScope.launch {
            val response = apiService.getStudents(selectedSemester, selectedBranch)

            if (response.success) {
                allStudents = response.students
                applySearchAndPaginate()

                // Update header subtitle
                val filterDesc = buildString {
                    if (selectedSemester.isNotEmpty()) append("Sem $selectedSemester")
                    if (selectedSemester.isNotEmpty() && selectedBranch.isNotEmpty()) append(" · ")
                    if (selectedBranch.isNotEmpty()) append(selectedBranch)
                    if (isEmpty()) append("All Students")
                }
                headerSubtitle.text = filterDesc
            } else {
                statsText.text = "Error: ${response.message}"
                Toast.makeText(this@MainActivity, response.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    // ── Search + paginate ──────────────────────────────────────────────────────

    private fun applySearchAndPaginate() {
        displayedStudents = if (searchQuery.isEmpty()) {
            allStudents
        } else {
            val q = searchQuery.lowercase()
            allStudents.filter {
                it.name.lowercase().contains(q) ||
                it.enrollmentNo.lowercase().contains(q)
            }
        }

        val enrolled = displayedStudents.count { it.hasEmbedding }
        val total    = displayedStudents.size
        statsText.text = "$total students · $enrolled enrolled"

        val totalPages = totalPages()
        if (totalPages > 1) {
            pageText.text = "Page ${currentPage + 1}/$totalPages"
        } else {
            pageText.text = ""
        }

        renderPage()
    }

    private fun renderPage() {
        val totalPages = totalPages()
        val start = currentPage * pageSize
        val end   = minOf(start + pageSize, displayedStudents.size)
        val page  = if (start < displayedStudents.size) displayedStudents.subList(start, end) else emptyList()

        adapter.submitList(page)

        // Pagination bar
        if (totalPages > 1) {
            paginationBar.visibility = View.VISIBLE
            pageIndicator.text = "Page ${currentPage + 1} of $totalPages"
            prevButton.isEnabled = currentPage > 0
            nextButton.isEnabled = currentPage < totalPages - 1
            prevButton.alpha = if (prevButton.isEnabled) 1f else 0.4f
            nextButton.alpha = if (nextButton.isEnabled) 1f else 0.4f
        } else {
            paginationBar.visibility = View.GONE
        }

        // Update page text in stats bar
        if (totalPages > 1) {
            pageText.text = "Page ${currentPage + 1}/$totalPages"
        } else {
            pageText.text = ""
        }
    }

    private fun totalPages(): Int {
        if (displayedStudents.isEmpty()) return 1
        return (displayedStudents.size + pageSize - 1) / pageSize
    }

    // ── Student click → enrollment dialog ─────────────────────────────────────

    private fun onStudentClicked(student: StudentItem) {
        val statusMsg = if (student.hasEmbedding) "✅ Face data already enrolled" else "⚠️ No face data yet"
        val actionLabel = if (student.hasEmbedding) "Re-enroll" else "Enroll Face"

        AlertDialog.Builder(this)
            .setTitle(student.name)
            .setMessage(
                "Enrollment No: ${student.enrollmentNo}\n" +
                "Branch: ${student.branch}  |  Sem: ${student.semester}\n\n" +
                statusMsg
            )
            .setPositiveButton(actionLabel) { _, _ ->
                pendingStudent = student
                faceEmbedding  = null
                startCameraForStudent()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── Camera ─────────────────────────────────────────────────────────────────

    private fun startCameraForStudent() {
        if (checkCameraPermission()) {
            val intent = Intent(this, CameraActivity::class.java)
            @Suppress("DEPRECATION")
            startActivityForResult(intent, CAMERA_REQUEST_CODE)
        } else {
            requestCameraPermission()
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        android.util.Log.d("EnrollDebug", "onActivityResult: requestCode=$requestCode resultCode=$resultCode data=$data")
        if (requestCode == CAMERA_REQUEST_CODE && resultCode == RESULT_OK) {
            faceEmbedding = data?.getFloatArrayExtra("face_embedding")
            android.util.Log.d("EnrollDebug", "onActivityResult: faceEmbedding=${faceEmbedding?.size ?: "NULL"}")
            if (faceEmbedding != null) {
                saveEnrollment()
            } else {
                Toast.makeText(this, "No face data captured", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun saveEnrollment() {
        val student   = pendingStudent ?: run {
            android.util.Log.e("EnrollDebug", "saveEnrollment: pendingStudent is NULL")
            return
        }
        val embedding = faceEmbedding  ?: run {
            android.util.Log.e("EnrollDebug", "saveEnrollment: faceEmbedding is NULL")
            return
        }
        android.util.Log.d("EnrollDebug", "saveEnrollment: student=${student.enrollmentNo} embedding.size=${embedding.size}")

        val progressDialog = AlertDialog.Builder(this)
            .setMessage("Saving face data for ${student.name}...")
            .setCancelable(false)
            .create()
        progressDialog.show()

        lifecycleScope.launch {
            try {
                val response = apiService.createEnrollment(student.enrollmentNo, embedding)
                progressDialog.dismiss()

                if (response.success) {
                    Toast.makeText(
                        this@MainActivity,
                        "✅ Enrolled: ${student.name}",
                        Toast.LENGTH_LONG
                    ).show()
                    // Refresh list to update badge
                    loadStudents()
                } else {
                    Toast.makeText(
                        this@MainActivity,
                        "Error: ${response.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                progressDialog.dismiss()
                Toast.makeText(this@MainActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                pendingStudent = null
                faceEmbedding  = null
            }
        }
    }

    // ── Permissions ────────────────────────────────────────────────────────────

    private fun checkCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCameraForStudent()
            } else {
                Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
