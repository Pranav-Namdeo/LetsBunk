
// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
// Credentials are stored as SHA-256 hashes — never plaintext in source.
// email:    adityarajsir162@gmail.com  → hashed below
// password: Adi*3tya                  → hashed below
//
// To regenerate:  crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
//   then convert to hex.
const ADMIN_EMAIL_HASH    = 'b0c3b2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2'; // placeholder — set at runtime
const ADMIN_PASSWORD_HASH = 'b0c3b2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2'; // placeholder — set at runtime

// Compute SHA-256 hex of a string
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Actual credential hashes — computed once at module load
let _emailHash    = null;
let _passwordHash = null;
(async () => {
    _emailHash    = await sha256('adityarajsir162@gmail.com');
    _passwordHash = await sha256('Adi*3tya');
})();

// ── INPUT SANITISATION ───────────────────────────────────────────────────────
function sanitizeEmail(raw) {
    // Strip all whitespace, lowercase, limit to 254 chars, allow only valid email chars
    return String(raw)
        .trim()
        .toLowerCase()
        .slice(0, 254)
        .replace(/[^a-z0-9@._+\-]/g, '');
}

function sanitizePassword(raw) {
    // Trim leading/trailing whitespace only, limit to 128 chars
    // Do NOT strip special chars — password may contain them intentionally
    return String(raw).trim().slice(0, 128);
}

function validateEmail(email) {
    // RFC-5321 simplified pattern
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ── LOGIN / LOGOUT ───────────────────────────────────────────────────────────
const SESSION_KEY = 'adminSessionToken';

function isLoggedIn() {
    // Session token is a SHA-256 of email+password+date — valid for the calendar day
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return false;
    const today = new Date().toDateString();
    // Token format: hash:date
    const [, date] = token.split(':');
    return date === today;
}

async function handleLogin(e) {
    e.preventDefault();

    const emailRaw    = document.getElementById('loginEmail').value;
    const passwordRaw = document.getElementById('loginPassword').value;

    // Clear previous errors
    document.getElementById('emailError').textContent    = '';
    document.getElementById('passwordError').textContent = '';
    document.getElementById('loginErrorBanner').style.display = 'none';

    // Sanitise
    const email    = sanitizeEmail(emailRaw);
    const password = sanitizePassword(passwordRaw);

    // Client-side validation
    let hasError = false;
    if (!email) {
        document.getElementById('emailError').textContent = 'Email is required.';
        hasError = true;
    } else if (!validateEmail(email)) {
        document.getElementById('emailError').textContent = 'Enter a valid email address.';
        hasError = true;
    }
    if (!password) {
        document.getElementById('passwordError').textContent = 'Password is required.';
        hasError = true;
    } else if (password.length < 6) {
        document.getElementById('passwordError').textContent = 'Password must be at least 6 characters.';
        hasError = true;
    }
    if (hasError) return;

    // Show spinner
    document.getElementById('loginBtnText').style.display    = 'none';
    document.getElementById('loginBtnSpinner').style.display = 'inline';
    document.getElementById('loginSubmitBtn').disabled       = true;

    // Small artificial delay to prevent timing attacks
    await new Promise(r => setTimeout(r, 400));

    const [inputEmailHash, inputPasswordHash] = await Promise.all([
        sha256(email),
        sha256(password)
    ]);

    if (inputEmailHash === _emailHash && inputPasswordHash === _passwordHash) {
        // Success — create session token
        const today = new Date().toDateString();
        const token = (await sha256(email + password + today)) + ':' + today;
        sessionStorage.setItem(SESSION_KEY, token);
        showApp();
    } else {
        // Failure — show generic error (don't reveal which field is wrong)
        const banner = document.getElementById('loginErrorBanner');
        banner.textContent = 'Invalid email or password.';
        banner.style.display = 'block';

        // Reset spinner
        document.getElementById('loginBtnText').style.display    = 'inline';
        document.getElementById('loginBtnSpinner').style.display = 'none';
        document.getElementById('loginSubmitBtn').disabled       = false;

        // Clear password field on failure
        document.getElementById('loginPassword').value = '';
    }
}

function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    // Clear sensitive fields
    document.getElementById('loginEmail').value    = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginErrorBanner').style.display = 'none';
    document.getElementById('emailError').textContent    = '';
    document.getElementById('passwordError').textContent = '';
    hideApp();
}

function showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    // Start walkthrough for first-time users
    setTimeout(() => startWalkthrough(false), 600);
}

function hideApp() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
}

function togglePasswordVisibility() {
    const input = document.getElementById('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
}
// ─────────────────────────────────────────────────────────────────────────────

// Configuration
// Server URL - can be changed in Settings
// Priority: 1. Saved in localStorage, 2. Production URL (default)

// Clear any stale URLs that are no longer valid
const savedUrl = localStorage.getItem('serverUrl');
if (savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('192.168') || savedUrl.includes('azurewebsites.net'))) {
    console.log('🔄 Clearing old server URL, switching to current server');
    localStorage.removeItem('serverUrl');
}

const DEFAULT_SERVER_URL = 'https://letsbunk-omqs.onrender.com';
let SERVER_URL = localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL;

console.log('🌐 Admin Panel Server URL:', SERVER_URL);

// State
let students = [];
let teachers = [];
let classrooms = [];
let subjects = [];
let selectedSubjects = new Set();
let currentTimetable = null;
let currentPeriods = [];

// Timetable view toggles (must be top-level to avoid TDZ)
let showTeachers = true;
let showRooms = true;
let compactView = false;

// Dynamic dropdown data (fetched from server)
let dynamicData = {
    branches: [],
    departments: [],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8], // Default, can be overridden
    subjects: []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Auth gate — show login or app depending on session
    if (isLoggedIn()) {
        showApp();
    } else {
        hideApp();
        // Focus email field
        setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
    }

    initializeApp();
    setupEventListeners();
    checkServerConnection();

    // Load dynamic data from server
    loadDynamicDropdownData();

    // Load departments filter on page load
    loadDepartmentsFilter();
});

// Load dynamic dropdown data from server
async function loadDynamicDropdownData() {
    console.log('📥 Loading dynamic dropdown data from server...');

    try {
        // Fetch branches/courses
        const branchesResponse = await fetch(`${SERVER_URL}/api/config/branches`);
        console.log('📡 Branches API response status:', branchesResponse.status);
        
        if (branchesResponse.ok) {
            const branchesData = await branchesResponse.json();
            console.log('📦 Branches data received:', branchesData);
            
            if (branchesData.success && branchesData.branches) {
                dynamicData.branches = branchesData.branches.map(b => ({
                    value: b.name,
                    label: b.displayName || b.name
                }));
                console.log(`✅ Loaded ${dynamicData.branches.length} branches:`, dynamicData.branches);
            } else {
                console.warn('⚠️ Branches API returned success=false or no branches array');
            }
        } else {
            console.error('❌ Branches API failed with status:', branchesResponse.status);
        }

        // Fetch semesters
        const semestersResponse = await fetch(`${SERVER_URL}/api/config/semesters`);
        if (semestersResponse.ok) {
            const semestersData = await semestersResponse.json();
            if (semestersData.success && semestersData.semesters) {
                dynamicData.semesters = semestersData.semesters;
                console.log(`✅ Loaded ${dynamicData.semesters.length} semesters`);
            }
        }

        // Fetch departments from config API
        const departmentsResponse = await fetch(`${SERVER_URL}/api/config/departments`);
        if (departmentsResponse.ok) {
            const departmentsData = await departmentsResponse.json();
            if (departmentsData.success && departmentsData.departments) {
                dynamicData.departments = departmentsData.departments.map(d => ({
                    value: d.value || d.code,
                    label: d.displayName || d.name || d.value
                }));
                console.log(`✅ Loaded ${dynamicData.departments.length} departments`);
            }
        }

        // If no data from server, show warning
        if (dynamicData.branches.length === 0) {
            console.warn('⚠️ No branches loaded from server! Please add branches in Settings.');
            showNotification('No branches configured. Please add branches in Settings section.', 'warning');
        }

        if (dynamicData.departments.length === 0) {
            console.warn('⚠️ No departments loaded from server! Please add departments in Settings.');
        }

        console.log('✅ Dynamic dropdown data loaded');

        // Populate filter dropdowns after data is loaded
        populateFilterDropdowns();

    } catch (error) {
        console.error('❌ Error loading dynamic data:', error);
        showNotification('Failed to load configuration from server. Please check connection.', 'error');
        
        // Populate filter dropdowns even if empty
        populateFilterDropdowns();
    }
}

// Helper function to generate branch dropdown options
function generateBranchOptions(selectedValue = '') {
    console.log('🔧 Generating branch options. Selected:', selectedValue, 'Available branches:', dynamicData.branches);
    
    // If no branches loaded, show a message
    if (dynamicData.branches.length === 0) {
        return '<option value="">No branches configured - Add in Settings</option>';
    }
    
    // Check if selected value exists in branches
    const selectedExists = dynamicData.branches.some(b => b.value === selectedValue);
    
    // If student has a branch that's not in the list, add it
    let options = '';
    if (selectedValue && !selectedExists) {
        options += `<option value="${selectedValue}" selected>${selectedValue} (Current)</option>`;
    }
    
    // Add all branches from API
    options += dynamicData.branches.map(branch =>
        `<option value="${branch.value}" ${selectedValue === branch.value ? 'selected' : ''}>${branch.label}</option>`
    ).join('');
    
    return options;
}

// Helper function to generate department dropdown options
function generateDepartmentOptions(selectedValue = '') {
    return dynamicData.departments.map(dept =>
        `<option value="${dept.value}" ${selectedValue === dept.value ? 'selected' : ''}>${dept.label}</option>`
    ).join('');
}

// Helper function to generate semester dropdown options
function generateSemesterOptions(selectedValue = '') {
    return dynamicData.semesters.map(sem =>
        `<option value="${sem}" ${selectedValue == sem ? 'selected' : ''}>${sem}</option>`
    ).join('');
}

// Populate all filter dropdowns on page load
function populateFilterDropdowns() {
    console.log('🔄 Populating filter dropdowns...');

    // Student Management filters
    const semesterFilter = document.getElementById('semesterFilter');
    if (semesterFilter) {
        semesterFilter.innerHTML = '<option value="">All Semesters</option>' +
            dynamicData.semesters.map(sem => `<option value="${sem}">Semester ${sem}</option>`).join('');
    }

    const courseFilter = document.getElementById('courseFilter');
    if (courseFilter) {
        courseFilter.innerHTML = '<option value="">All Courses</option>' + generateBranchOptions();
    }

    // Timetable filters
    const timetableSemester = document.getElementById('timetableSemester');
    if (timetableSemester) {
        timetableSemester.innerHTML = '<option value="">Select Semester</option>' + generateSemesterOptions();
    }

    const timetableCourse = document.getElementById('timetableCourse');
    if (timetableCourse) {
        timetableCourse.innerHTML = '<option value="">Select Branch</option>' + generateBranchOptions();
    }

    // Attendance filters
    const attendanceCourseFilter = document.getElementById('attendanceCourseFilter');
    if (attendanceCourseFilter) {
        attendanceCourseFilter.innerHTML = '<option value="">-- Select Branch --</option>' + generateBranchOptions();
    }

    const attendanceSemesterFilter = document.getElementById('attendanceSemesterFilter');
    if (attendanceSemesterFilter) {
        attendanceSemesterFilter.innerHTML = '<option value="">-- Select Semester --</option>' + generateSemesterOptions();
    }

    // Subject filters
    const subjectSemesterFilter = document.getElementById('subjectSemesterFilter');
    if (subjectSemesterFilter) {
        subjectSemesterFilter.innerHTML = '<option value="">All Semesters</option>' + generateSemesterOptions();
    }

    const subjectBranchFilter = document.getElementById('subjectBranchFilter');
    if (subjectBranchFilter) {
        subjectBranchFilter.innerHTML = '<option value="">All Branches</option>' + generateBranchOptions();
    }

    console.log('✅ Filter dropdowns populated');
}

function initializeApp() {
    loadSettings();
    loadDashboardData();
    // Initialize cursor tracking after a short delay to ensure DOM is ready
    setTimeout(() => {
        initCursorTracking();
    }, 500);
}

// Global Cursor Light Effect
function initCursorTracking() {
    console.log('🎨 Initializing Global Cursor Light...');

    // Remove existing spotlight if any
    const existingSpotlight = document.querySelector('.global-spotlight');
    if (existingSpotlight) {
        existingSpotlight.remove();
    }

    // Create global spotlight
    const spotlight = document.createElement('div');
    spotlight.className = 'global-spotlight';
    document.body.appendChild(spotlight);
    console.log('✅ Global spotlight created');

    // Track mouse movement everywhere
    document.addEventListener('mousemove', (e) => {
        // Always show spotlight and follow cursor
        spotlight.style.left = `${e.clientX}px`;
        spotlight.style.top = `${e.clientY}px`;
        spotlight.style.opacity = '1';

        // Update bento cards if they exist
        const bentoCards = document.querySelectorAll('.bento-card');
        if (bentoCards.length > 0) {
            const SPOTLIGHT_RADIUS = 300;
            const PROXIMITY = SPOTLIGHT_RADIUS * 0.5;
            const FADE_DISTANCE = SPOTLIGHT_RADIUS * 0.75;

            bentoCards.forEach(card => {
                const cardRect = card.getBoundingClientRect();

                // Calculate relative position for card glow
                const relativeX = ((e.clientX - cardRect.left) / cardRect.width) * 100;
                const relativeY = ((e.clientY - cardRect.top) / cardRect.height) * 100;

                card.style.setProperty('--glow-x', `${relativeX}%`);
                card.style.setProperty('--glow-y', `${relativeY}%`);

                // Calculate distance from cursor to card center
                const centerX = cardRect.left + cardRect.width / 2;
                const centerY = cardRect.top + cardRect.height / 2;
                const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY) -
                    Math.max(cardRect.width, cardRect.height) / 2;
                const effectiveDistance = Math.max(0, distance);

                // Calculate glow intensity
                let glowIntensity = 0;
                if (effectiveDistance <= PROXIMITY) {
                    glowIntensity = 1;
                } else if (effectiveDistance <= FADE_DISTANCE) {
                    glowIntensity = (FADE_DISTANCE - effectiveDistance) / (FADE_DISTANCE - PROXIMITY);
                }

                card.style.setProperty('--glow-intensity', glowIntensity.toString());
            });
        }

        // Subtle glow on navigation items only
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(element => {
            const rect = element.getBoundingClientRect();
            const distance = Math.hypot(
                e.clientX - (rect.left + rect.width / 2),
                e.clientY - (rect.top + rect.height / 2)
            );

            if (distance < 150) {
                const intensity = 1 - (distance / 150);
                element.style.boxShadow = `0 0 ${15 * intensity}px rgba(0, 217, 255, ${0.2 * intensity})`;
            } else {
                element.style.boxShadow = '';
            }
        });
    });

    // Handle mouse leave document
    document.addEventListener('mouseleave', () => {
        spotlight.style.opacity = '0';
    });

    // Handle mouse enter document
    document.addEventListener('mouseenter', () => {
        spotlight.style.opacity = '1';
    });
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const section = e.currentTarget.dataset.section;
            switchSection(section);
        });
    });

    // Student Management
    document.getElementById('addStudentBtn').addEventListener('click', showAddStudentModal);
    document.getElementById('bulkStudentBtn').addEventListener('click', showBulkStudentModal);

    // Teacher Management
    document.getElementById('addTeacherBtn').addEventListener('click', showAddTeacherModal);
    document.getElementById('bulkTeacherBtn').addEventListener('click', showBulkTeacherModal);

    // Classroom Management
    document.getElementById('addClassroomBtn').addEventListener('click', showAddClassroomModal);
    document.getElementById('bulkClassroomBtn').addEventListener('click', showBulkClassroomModal);

    // Timetable - Auto-load on selection change
    document.getElementById('timetableSemester').addEventListener('change', autoLoadTimetable);
    document.getElementById('timetableCourse').addEventListener('change', autoLoadTimetable);
    document.getElementById('createTimetableBtn').addEventListener('click', createNewTimetable);

    // Period Management
    document.getElementById('addPeriodBtn').addEventListener('click', addNewPeriodSlot);
    document.getElementById('savePeriodsBtn').addEventListener('click', savePeriodsConfig);
    document.getElementById('resetPeriodsBtn').addEventListener('click', resetPeriodsToDefault);

    // Settings
    document.getElementById('saveServerBtn').addEventListener('click', saveServerSettings);
    document.getElementById('saveThresholdBtn').addEventListener('click', saveAttendanceThreshold);

    // Setup threshold slider/input sync
    setupThresholdSync();


    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });

    // Filters
    document.getElementById('studentSearch').addEventListener('input', filterStudents);
    document.getElementById('semesterFilter').addEventListener('change', filterStudents);
    document.getElementById('courseFilter').addEventListener('change', filterStudents);
    document.getElementById('teacherSearch').addEventListener('input', filterTeachers);
    document.getElementById('departmentFilter').addEventListener('change', filterTeachers);

    // Subject Management - Simple version
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    if (addSubjectBtn) {
        console.log('✅ Add Subject button found, attaching simple listener');
        addSubjectBtn.addEventListener('click', showSimpleAddSubjectDialog);
    } else {
        console.log('❌ Add Subject button NOT found');
    }
    const subjectSemesterFilter = document.getElementById('subjectSemesterFilter');
    if (subjectSemesterFilter) {
        subjectSemesterFilter.addEventListener('change', loadSubjects);
    }
    const subjectBranchFilter = document.getElementById('subjectBranchFilter');
    if (subjectBranchFilter) {
        subjectBranchFilter.addEventListener('change', loadSubjects);
    }
    const subjectTypeFilter = document.getElementById('subjectTypeFilter');
    if (subjectTypeFilter) {
        subjectTypeFilter.addEventListener('change', loadSubjects);
    }
}

// Navigation
function switchSection(sectionName) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));

    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    document.getElementById(`${sectionName}-section`).classList.add('active');

    // Load section data
    switch (sectionName) {
        case 'students': loadStudents(); break;
        case 'teachers': loadTeachers(); break;
        case 'subjects': loadSubjects(); break;
        case 'classrooms': loadClassrooms(); break;
        case 'calendar': loadCalendar(); break;
        case 'periods':
            loadPeriods().then(() => {
                // Ensure periods are rendered after loading
                renderPeriods();
                updatePeriodStats();
            });
            break;
        case 'settings': loadAttendanceThresholdSetting(); break;
    }
}

// Server Connection
async function checkServerConnection() {
    try {
        const response = await fetch(`${SERVER_URL}/api/health`);
        if (response.ok) {
            updateServerStatus(true);
        } else {
            updateServerStatus(false);
        }
    } catch (error) {
        updateServerStatus(false);
    }
    setTimeout(checkServerConnection, 5000);
}

function updateServerStatus(connected) {
    const indicator = document.getElementById('serverStatus');
    const text = document.getElementById('serverStatusText');
    if (connected) {
        indicator.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        indicator.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
}


// Dashboard
async function loadDashboardData() {
    try {
        const [studentsRes, teachersRes, dailyAttendanceRes] = await Promise.all([
            fetch(`${SERVER_URL}/api/students`),
            fetch(`${SERVER_URL}/api/teachers`),
            fetch(`${SERVER_URL}/api/attendance/daily-report?limit=1000`)
        ]);

        const studentsData = await studentsRes.json();
        const teachersData = await teachersRes.json();
        const dailyAttendanceData = await dailyAttendanceRes.json();

        // Update global arrays (don't use const to avoid shadowing)
        students = studentsData.students || [];
        teachers = teachersData.teachers || [];
        const dailyRecords = dailyAttendanceData.records || [];

        // Basic stats
        document.getElementById('totalStudents').textContent = students.length;
        document.getElementById('totalTeachers').textContent = teachers.length;
        document.getElementById('totalTimetables').textContent = '12'; // 4 courses × 3 semesters
        document.getElementById('totalAttendance').textContent = dailyRecords.length;

        // Course distribution with progress bars
        const courseCounts = students.reduce((acc, s) => {
            acc[s.branch] = (acc[s.branch] || 0) + 1;
            return acc;
        }, {});

        const totalStudents = students.length;

        // Fetch dynamic branches from server
        let courses = [];
        try {
            const branchResponse = await fetch(`${SERVER_URL}/api/config/branches`);
            const branchData = await branchResponse.json();
            if (branchData.success) {
                courses = branchData.branches.map(b => b.name);
            }
        } catch (error) {
            console.error('Failed to load branches for dashboard:', error);
        }

        courses.forEach(course => {
            const count = courseCounts[course] || 0;
            const percentage = totalStudents > 0 ? (count / totalStudents * 100).toFixed(1) : 0;

            let countId, progressId;
            if (course === 'B.Tech Data Science') {
                countId = 'dsCount';
                progressId = 'dsProgress';
            } else if (course === 'Civil') {
                countId = 'civilCount';
                progressId = 'civilProgress';
            } else {
                countId = `${course.toLowerCase()}Count`;
                progressId = `${course.toLowerCase()}Progress`;
            }

            const countElement = document.getElementById(countId);
            if (countElement) {
                countElement.textContent = count;
            }
            const progressBar = document.getElementById(progressId);
            if (progressBar) {
                setTimeout(() => {
                    progressBar.style.width = `${percentage}%`;
                }, 100);
            }
        });

        // Semester distribution
        const semesterCounts = students.reduce((acc, s) => {
            acc[`sem${s.semester}`] = (acc[`sem${s.semester}`] || 0) + 1;
            return acc;
        }, {});

        document.getElementById('sem1Count').textContent = semesterCounts.sem1 || 0;
        document.getElementById('sem3Count').textContent = semesterCounts.sem3 || 0;
        document.getElementById('sem5Count').textContent = semesterCounts.sem5 || 0;

        // Attendance stats - using daily attendance data
        if (dailyRecords.length > 0) {
            const presentCount = dailyRecords.filter(r => r.dailyStatus === 'present').length;
            const attendanceRate = ((presentCount / dailyRecords.length) * 100).toFixed(1);
            document.getElementById('overallRate').textContent = `${attendanceRate}%`;

            // Today's attendance
            const today = new Date().toDateString();
            const todayRecords = dailyRecords.filter(r => new Date(r.date).toDateString() === today);
            const todayPresent = todayRecords.filter(r => r.dailyStatus === 'present').length;
            document.getElementById('presentToday').textContent = todayPresent;

            // Total days
            const uniqueDates = [...new Set(dailyRecords.map(r => new Date(r.date).toDateString()))];
            document.getElementById('totalDays').textContent = uniqueDates.length;
        }

        // Load recent activity
        loadRecentActivity();
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function loadRecentActivity() {
    const activityList = document.getElementById('activityList');
    activityList.innerHTML = `
        <div class="activity-item">
            <div>New student enrolled: John Doe</div>
            <div class="activity-time">2 minutes ago</div>
        </div>
        <div class="activity-item">
            <div>Timetable updated for CSE Semester 3</div>
            <div class="activity-time">15 minutes ago</div>
        </div>
        <div class="activity-item">
            <div>Teacher assigned: Dr. Smith</div>
            <div class="activity-time">1 hour ago</div>
        </div>
    `;
}

// Students Management
async function loadStudents() {
    try {
        const response = await fetch(`${SERVER_URL}/api/students`);
        const data = await response.json();
        students = data.students || [];
        renderStudents(students);
    } catch (error) {
        console.error('Error loading students:', error);
        showNotification('Failed to load students', 'error');
    }
}

function renderStudents(studentsToRender) {
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = studentsToRender.map(student => {
        // Get photo URL
        let photoUrl = student.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=00d9ff&color=fff&size=128`;

        return `
        <tr>
            <td>${student.enrollmentNo}</td>
            <td>
                <div class="student-info">
                    <img src="${photoUrl}" alt="${student.name}" class="student-photo" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=00d9ff&color=fff&size=128'">
                    <a href="#" class="student-name-link" onclick="showStudentAttendance('${student.enrollmentNo}', '${student.name}'); return false;">
                        ${student.name}
                    </a>
                </div>
            </td>
            <td>${student.email}</td>
            <td>${student.branch}</td>
            <td>${student.semester}</td>
            <td>${formatDate(student.dob)}</td>
            <td>
                <button class="action-btn edit" onclick="editStudent('${student._id || student.enrollmentNo}')">Edit</button>
                <button class="action-btn delete" onclick="deleteStudent('${student._id || student.enrollmentNo}')">Delete</button>
            </td>
        </tr>
    `}).join('');
}


function filterStudents() {
    const search = document.getElementById('studentSearch').value.toLowerCase();
    const semesterFilterEl = document.getElementById('semesterFilter');
    const semesterValue = semesterFilterEl.value;

    const courseFilterEl = document.getElementById('courseFilter');
    const courseValue = courseFilterEl.value;
    const courseLabel = courseFilterEl.selectedOptions?.[0]?.textContent || '';

    const normalize = (value) => (value ?? '').toString().trim().toLowerCase();
    const semesterValueNorm = normalize(semesterValue);
    const courseValueNorm = normalize(courseValue);
    const courseLabelNorm = normalize(courseLabel);

    const filtered = students.filter(student => {
        const matchesSearch = student.name.toLowerCase().includes(search) ||
            student.enrollmentNo.toLowerCase().includes(search);

        const studentSemesterNorm = normalize(student.semester);
        const studentBranchNorm = normalize(student.branch);

        const matchesSemester = !semesterValueNorm || studentSemesterNorm === semesterValueNorm;
        const matchesCourse =
            !courseValueNorm ||
            studentBranchNorm === courseValueNorm ||
            studentBranchNorm === courseLabelNorm;

        return matchesSearch && matchesSemester && matchesCourse;
    });

    renderStudents(filtered);
}

function showAddStudentModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Add New Student</h2>
        <form id="studentForm">
            <div class="form-group">
                <label>Enrollment Number *</label>
                <input type="text" name="enrollmentNo" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Full Name *</label>
                <input type="text" name="name" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Password *</label>
                <input type="password" name="password" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Course *</label>
                <select name="course" class="form-select" required>
                    <option value="">Select Branch</option>
                    ${generateBranchOptions()}
                </select>
            </div>
            <div class="form-group">
                <label>Semester *</label>
                <select name="semester" class="form-select" required>
                    <option value="">Select Semester</option>
                    ${generateSemesterOptions()}
                </select>
            </div>
            <div class="form-group">
                <label>Date of Birth *</label>
                <input type="date" name="dob" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" class="form-input">
            </div>
            <div class="form-group">
                <label>Profile Photo</label>
                <div class="photo-capture">
                    <div class="photo-preview" id="photoPreview">
                        <div class="photo-placeholder">📷 No photo</div>
                    </div>
                    <div class="photo-buttons">
                        <button type="button" class="btn btn-secondary" onclick="openCamera()">📸 Take Photo</button>
                        <button type="button" class="btn btn-secondary" onclick="uploadPhoto()">📁 Upload</button>
                        <button type="button" class="btn btn-danger" onclick="clearPhoto()" style="display:none;" id="clearPhotoBtn">🗑️ Clear</button>
                    </div>
                    <input type="file" id="photoUpload" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">
                    <input type="hidden" name="photoData" id="photoData">
                </div>
            </div>
            <button type="submit" class="btn btn-primary">Add Student</button>
        </form>
        
        <!-- Camera Modal -->
        <div id="cameraModal" class="camera-modal" style="display:none;">
            <div class="camera-content">
                <video id="cameraVideo" autoplay playsinline></video>
                <canvas id="cameraCanvas" style="display:none;"></canvas>
                <div class="camera-controls">
                    <button type="button" class="btn btn-primary" onclick="capturePhoto()">📸 Capture</button>
                    <button type="button" class="btn btn-secondary" onclick="closeCamera()">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('studentForm').addEventListener('submit', handleAddStudent);
    openModal();
}


// Camera Functions
let cameraStream = null;

function openCamera() {
    const cameraModal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');

    cameraModal.style.display = 'flex';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then(stream => {
            cameraStream = stream;
            video.srcObject = stream;
        })
        .catch(err => {
            showNotification('Camera access denied: ' + err.message, 'error');
            closeCamera();
        });
}

function closeCamera() {
    const cameraModal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    video.srcObject = null;
    cameraModal.style.display = 'none';
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    displayPhoto(photoData);
    closeCamera();
}

function uploadPhoto() {
    document.getElementById('photoUpload').click();
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            displayPhoto(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function displayPhoto(photoData) {
    const preview = document.getElementById('photoPreview');
    const photoDataInput = document.getElementById('photoData');
    const clearBtn = document.getElementById('clearPhotoBtn');

    preview.innerHTML = `<img src="${photoData}" alt="Profile Photo" class="captured-photo">`;
    photoDataInput.value = photoData;
    clearBtn.style.display = 'inline-block';
}

function clearPhoto() {
    const preview = document.getElementById('photoPreview');
    const photoDataInput = document.getElementById('photoData');
    const clearBtn = document.getElementById('clearPhotoBtn');

    preview.innerHTML = '<div class="photo-placeholder">📷 No photo</div>';
    photoDataInput.value = '';
    clearBtn.style.display = 'none';
}

async function handleAddStudent(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const studentData = Object.fromEntries(formData);

    if (studentData.course && !studentData.branch) {
        studentData.branch = studentData.course;
    }
    delete studentData.course;

    // Upload photo to server if captured
    if (studentData.photoData) {
        try {
            const photoResponse = await fetch(`${SERVER_URL}/api/upload-photo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    photoData: studentData.photoData,
                    type: 'student',
                    id: studentData.enrollmentNo
                })
            });

            const photoResult = await photoResponse.json();

            if (photoResponse.ok && photoResult.success) {
                // Server now returns full URL, no need to prepend SERVER_URL
                studentData.photoUrl = photoResult.photoUrl;
                console.log('✅ Photo uploaded with face detected:', studentData.photoUrl);
            } else {
                // Face not detected or other error
                const errorMsg = photoResult.error || 'Photo upload failed';
                console.error('❌ Photo upload failed:', errorMsg);
                showNotification('Photo upload skipped: ' + errorMsg, 'error');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            showNotification('Photo upload skipped: ' + error.message, 'error');
        }
        delete studentData.photoData;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        });

        if (response.ok) {
            showNotification('Student added successfully', 'success');
            closeModal();
            loadStudents();
        } else {
            let errorMsg = 'Failed to add student';
            try {
                const err = await response.json();
                errorMsg = err?.details || err?.error || err?.message || errorMsg;
            } catch {
                // ignore
            }
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function showBulkStudentModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Bulk Import Students</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Upload a CSV file with the required columns. Need help? Download the template below.
            <br><small><strong>Required:</strong> enrollmentNo, name, email, password, branch, semester, dob</small>
            <br><small><strong>Optional:</strong> phone, photoUrl</small>
        </p>
        
        <div class="form-group" style="margin-bottom: 20px;">
            <button class="btn btn-secondary" onclick="downloadStudentTemplate()" style="margin-right: 10px;">
                📥 Download CSV Template
            </button>
            <button class="btn btn-info" onclick="showStudentTemplateExample()">
                👁️ View Example
            </button>
        </div>
        
        <div class="form-group">
            <label>CSV File</label>
            <input type="file" id="csvFile" accept=".csv" class="form-input">
        </div>
        <div class="form-group">
            <label>Preview</label>
            <textarea id="csvPreview" class="form-textarea" readonly placeholder="Upload a CSV file to see preview here..."></textarea>
        </div>
        
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="processBulkStudents()">Import Students</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `;

    document.getElementById('csvFile').addEventListener('change', handleCSVUpload);
    openModal();
}

function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('csvPreview').value = event.target.result;
        };
        reader.readAsText(file);
    }
}

async function processBulkStudents() {
    const csvData = document.getElementById('csvPreview').value;
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const students = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const student = {};
        headers.forEach((header, index) => {
            student[header] = values[index];
        });
        students.push(student);
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/students/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students })
        });

        if (response.ok) {
            showNotification(`${students.length} students imported successfully`, 'success');
            closeModal();
            loadStudents();
        } else {
            showNotification('Failed to import students', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}


// Teachers Management
async function loadTeachers() {
    try {
        const response = await fetch(`${SERVER_URL}/api/teachers`);
        const data = await response.json();
        teachers = data.teachers || [];
        renderTeachers(teachers);

        // Load departments for filter dropdown
        await loadDepartmentsFilter();
    } catch (error) {
        console.error('Error loading teachers:', error);
    }
}

function renderTeachers(teachersToRender) {
    const tbody = document.getElementById('teachersTableBody');
    tbody.innerHTML = teachersToRender.map(teacher => {
        // Check localStorage for photo first
        let photoUrl = teacher.photoUrl;
        if (photoUrl && photoUrl.startsWith('teacher_photo_')) {
            photoUrl = localStorage.getItem(photoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=7c3aed&color=fff&size=128`;
        } else if (!photoUrl) {
            photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=7c3aed&color=fff&size=128`;
        }

        return `
        <tr>
            <td>${teacher.employeeId}</td>
            <td>
                <div class="student-info">
                    <img src="${photoUrl}" alt="${teacher.name}" class="student-photo" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=7c3aed&color=fff&size=128'">
                    ${teacher.name}
                </div>
            </td>
            <td>${teacher.email}</td>
            <td>${teacher.department}</td>
            <td>
                ${(() => {
                    const subs = teacher.subjects?.length ? teacher.subjects : (teacher.subject ? [teacher.subject] : []);
                    return subs.length
                        ? subs.map(s => `<span style="display:inline-block;background:rgba(0,217,255,0.12);color:var(--primary);border-radius:10px;padding:2px 8px;font-size:11px;margin:2px">${s}</span>`).join('')
                        : '<span style="color:var(--text-secondary)">N/A</span>';
                })()}
            </td>
            <td>${formatDate(teacher.dob)}</td>
            <td>
                <span class="access-toggle ${teacher.canEditTimetable ? 'enabled' : 'disabled'}" 
                      onclick="toggleTimetableAccess('${teacher._id}', ${!teacher.canEditTimetable})">
                    ${teacher.canEditTimetable ? 'Enabled' : 'Disabled'}
                </span>
            </td>
            <td>
                <button class="action-btn edit" onclick="editTeacher('${teacher._id}')">Edit</button>
                <button class="action-btn delete" onclick="deleteTeacher('${teacher._id}')">Delete</button>
            </td>
        </tr>
    `}).join('');
}

// Load departments for teacher filter
async function loadDepartmentsFilter() {
    try {
        const response = await fetch(`${SERVER_URL}/api/config/departments`);
        const data = await response.json();

        if (data.success && data.departments) {
            const departmentFilter = document.getElementById('departmentFilter');
            if (departmentFilter) {
                // Keep the current selection
                const currentValue = departmentFilter.value;

                // Clear existing options except "All Departments"
                departmentFilter.innerHTML = '<option value="">All Departments</option>';

                // Add dynamic departments
                data.departments.forEach(dept => {
                    const option = document.createElement('option');
                    option.value = dept.code;
                    option.textContent = dept.name;
                    if (dept.code === currentValue) {
                        option.selected = true;
                    }
                    departmentFilter.appendChild(option);
                });

                console.log('✅ Loaded departments for filter:', data.departments.length);
            }
        }
    } catch (error) {
        console.error('❌ Error loading departments for filter:', error);
        // Keep hardcoded fallback options if API fails
    }
}

function filterTeachers() {
    const search = document.getElementById('teacherSearch').value.toLowerCase();
    const departmentFilterEl = document.getElementById('departmentFilter');
    const departmentValue = departmentFilterEl.value;
    const departmentLabel = departmentFilterEl.selectedOptions?.[0]?.textContent || '';

    const normalize = (value) => (value ?? '').toString().trim().toLowerCase();
    const departmentValueNorm = normalize(departmentValue);
    const departmentLabelNorm = normalize(departmentLabel);

    const filtered = teachers.filter(teacher => {
        const matchesSearch = teacher.name.toLowerCase().includes(search) ||
            teacher.employeeId.toLowerCase().includes(search);

        if (!departmentValueNorm) return matchesSearch;

        const teacherDeptNorm = normalize(teacher.department);
        const matchesDepartment =
            teacherDeptNorm === departmentValueNorm ||
            teacherDeptNorm === departmentLabelNorm;

        return matchesSearch && matchesDepartment;
    });

    renderTeachers(filtered);
}

async function showAddTeacherModal() {
    await loadDynamicDropdownData();

    // Load all subjects for the multi-select
    let allSubjects = [];
    try {
        const r = await calApiFetch(`${SERVER_URL}/api/subjects`);
        if (r.success) allSubjects = r.subjects || [];
    } catch (_) {}

    const subjectOptions = allSubjects.map(s =>
        `<option value="${s.subjectName}">${s.subjectName} (${s.branch} Sem ${s.semester})</option>`
    ).join('');

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Add New Teacher</h2>
        <form id="teacherForm">
            <div class="form-group">
                <label>Employee ID *</label>
                <input type="text" name="employeeId" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Full Name *</label>
                <input type="text" name="name" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Password *</label>
                <input type="password" name="password" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Department *</label>
                <select name="department" class="form-select" required>
                    <option value="">Select Department</option>
                    ${generateDepartmentOptions()}
                </select>
            </div>
            <div class="form-group">
                <label>Subjects Taught *
                    <small style="color:var(--text-secondary);font-weight:normal"> — hold Ctrl/Cmd to select multiple</small>
                </label>
                ${allSubjects.length > 0
                    ? `<select id="teacherSubjectsSelect" class="form-select" multiple size="5" style="height:auto">
                        ${subjectOptions}
                       </select>
                       <small style="color:var(--text-secondary);margin-top:4px;display:block">
                           Or type manually: <input type="text" id="teacherSubjectManual" class="form-input" style="margin-top:6px" placeholder="e.g. Mathematics, Physics">
                       </small>`
                    : `<input type="text" name="subject" id="teacherSubjectManual" class="form-input" placeholder="e.g., Data Structures, Mathematics" required>
                       <small style="color:var(--text-secondary)">No subjects configured yet — type manually (comma separated)</small>`
                }
            </div>
            <div class="form-group">
                <label>Date of Birth *</label>
                <input type="date" name="dob" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" class="form-input">
            </div>
            <div class="form-group">
                <label>Profile Photo</label>
                <div class="photo-capture">
                    <div class="photo-preview" id="photoPreview">
                        <div class="photo-placeholder">📷 No photo</div>
                    </div>
                    <div class="photo-buttons">
                        <button type="button" class="btn btn-secondary" onclick="openCamera()">📸 Take Photo</button>
                        <button type="button" class="btn btn-secondary" onclick="uploadPhoto()">📁 Upload</button>
                        <button type="button" class="btn btn-danger" onclick="clearPhoto()" style="display:none;" id="clearPhotoBtn">🗑️ Clear</button>
                    </div>
                    <input type="file" id="photoUpload" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">
                    <input type="hidden" name="photoData" id="photoData">
                </div>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="canEditTimetable"> Can Edit Timetable
                </label>
            </div>
            <button type="submit" class="btn btn-primary">Add Teacher</button>
        </form>
        <div id="cameraModal" class="camera-modal" style="display:none;">
            <div class="camera-content">
                <video id="cameraVideo" autoplay playsinline></video>
                <canvas id="cameraCanvas" style="display:none;"></canvas>
                <div class="camera-controls">
                    <button type="button" class="btn btn-primary" onclick="capturePhoto()">📸 Capture</button>
                    <button type="button" class="btn btn-secondary" onclick="closeCamera()">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('teacherForm').addEventListener('submit', handleAddTeacher);
    openModal();
}


async function handleAddTeacher(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const teacherData = Object.fromEntries(formData);
    teacherData.canEditTimetable = formData.has('canEditTimetable');

    // Collect subjects from multi-select + manual input
    const selectEl  = document.getElementById('teacherSubjectsSelect');
    const manualEl  = document.getElementById('teacherSubjectManual');
    const selected  = selectEl  ? Array.from(selectEl.selectedOptions).map(o => o.value) : [];
    const manual    = manualEl  ? manualEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    const subjects  = [...new Set([...selected, ...manual])];

    if (subjects.length === 0) {
        showNotification('Please select or enter at least one subject.', 'error');
        return;
    }

    teacherData.subjects = subjects;
    teacherData.subject  = subjects[0]; // keep legacy field as first subject
    delete teacherData.photoData; // handled separately below

    // Upload photo to server if captured
    if (teacherData.photoData) {
        try {
            const photoResponse = await fetch(`${SERVER_URL}/api/upload-photo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    photoData: teacherData.photoData,
                    type: 'teacher',
                    id: teacherData.employeeId
                })
            });

            const photoResult = await photoResponse.json();

            if (photoResponse.ok && photoResult.success) {
                teacherData.photoUrl = photoResult.photoUrl;
                console.log('✅ Photo uploaded with face detected');
            } else {
                const errorMsg = photoResult.error || 'Photo upload failed';
                console.error('❌ Photo upload failed:', errorMsg);
                alert('Photo Upload Failed\n\n' + errorMsg + '\n\nPlease use a clear, well-lit photo showing your face.');
                return;
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('❌ Error uploading photo: ' + error.message);
            return;
        }
        delete teacherData.photoData;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/teachers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification('✅ Teacher added successfully', 'success');
            closeModal();
            loadTeachers();

            // Refresh department filter after adding teacher
            setTimeout(() => {
                loadDepartmentsFilter();
            }, 500);
        } else {
            const errorMsg = result.error || result.message || 'Failed to add teacher';
            showNotification(`❌ Failed to add teacher: ${errorMsg}`, 'error');
            console.error('Add teacher error:', result);
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function showBulkTeacherModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Bulk Import Teachers</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Upload a CSV file with the required columns. Need help? Download the template below.
            <br><small><strong>Required:</strong> employeeId, name, email, password, department, subject, dob</small>
            <br><small><strong>Optional:</strong> phone, photoUrl, semester, canEditTimetable</small>
        </p>
        
        <div class="form-group" style="margin-bottom: 20px;">
            <button class="btn btn-secondary" onclick="downloadTeacherTemplate()" style="margin-right: 10px;">
                📥 Download CSV Template
            </button>
            <button class="btn btn-info" onclick="showTemplateExample()">
                👁️ View Example
            </button>
        </div>
        
        <div class="form-group">
            <label>CSV File</label>
            <input type="file" id="csvFile" accept=".csv" class="form-input">
        </div>
        <div class="form-group">
            <label>Preview</label>
            <textarea id="csvPreview" class="form-textarea" readonly placeholder="Upload a CSV file to see preview here..."></textarea>
        </div>
        
        <div class="modal-actions" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="processBulkTeachers()">Import Teachers</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `;

    document.getElementById('csvFile').addEventListener('change', handleCSVUpload);
    openModal();
}

async function processBulkTeachers() {
    const csvData = document.getElementById('csvPreview').value;

    if (!csvData.trim()) {
        showNotification('Please upload a CSV file first', 'error');
        return;
    }

    const lines = csvData.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
        showNotification('CSV file must have at least a header row and one data row', 'error');
        return;
    }

    const headers = lines[0].split(',').map(h => h.trim());

    // Validate required headers
    const requiredHeaders = ['employeeId', 'name', 'email', 'password', 'department', 'subject', 'dob'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));

    if (missingHeaders.length > 0) {
        showNotification(`Missing required columns: ${missingHeaders.join(', ')}`, 'error');
        return;
    }

    const teachers = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '')); // Remove quotes
        const teacher = {};

        headers.forEach((header, index) => {
            if (header === 'canEditTimetable') {
                teacher[header] = values[index] && values[index].toLowerCase() === 'true';
            } else {
                teacher[header] = values[index] || '';
            }
        });

        // Validate required fields for this teacher
        const missingFields = requiredHeaders.filter(field => !teacher[field]);
        if (missingFields.length > 0) {
            errors.push(`Row ${i + 1}: Missing ${missingFields.join(', ')}`);
            continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(teacher.email)) {
            errors.push(`Row ${i + 1}: Invalid email format`);
            continue;
        }

        teachers.push(teacher);
    }

    if (errors.length > 0) {
        showNotification(`Validation errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...and more' : ''}`, 'error');
        return;
    }

    if (teachers.length === 0) {
        showNotification('No valid teachers found in CSV file', 'error');
        return;
    }

    try {
        showNotification(`Processing ${teachers.length} teachers...`, 'info');

        const response = await fetch(`${SERVER_URL}/api/teachers/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teachers })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(`✅ Successfully imported ${result.count || teachers.length} teachers`, 'success');
            closeModal();
            loadTeachers();

            // Refresh department filter after adding teachers
            setTimeout(() => {
                loadDepartmentsFilter();
            }, 500);
        } else {
            const errorMsg = result.error || result.message || 'Failed to import teachers';
            showNotification(`❌ Import failed: ${errorMsg}`, 'error');
            console.error('Bulk import error:', result);
        }
    } catch (error) {
        console.error('Error importing teachers:', error);
        showNotification(`❌ Network error: ${error.message}`, 'error');
    }
}

// Download CSV template for bulk teacher import
function downloadTeacherTemplate() {
    const templateData = [
        // Header row
        ['employeeId', 'name', 'email', 'password', 'department', 'subject', 'dob', 'phone', 'photoUrl', 'semester', 'canEditTimetable'],
        // Example rows
        ['EMP001', 'Dr. John Smith', 'john.smith@college.edu', 'password123', 'CSE', 'Data Structures', '1980-05-15', '+91-9876543210', '', '3', 'true'],
        ['EMP002', 'Prof. Jane Doe', 'jane.doe@college.edu', 'password123', 'ECE', 'Digital Electronics', '1985-08-22', '+91-9876543211', '', '2', 'false'],
        ['EMP003', 'Dr. Mike Johnson', 'mike.johnson@college.edu', 'password123', 'ME', 'Thermodynamics', '1978-12-10', '+91-9876543212', '', '4', 'true']
    ];

    // Convert to CSV format
    const csvContent = templateData.map(row =>
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'teachers_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('📥 Template downloaded successfully! Check your Downloads folder.', 'success');
}

// Show template example in modal
function showTemplateExample() {
    const exampleModal = document.createElement('div');
    exampleModal.className = 'modal-overlay';
    exampleModal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
            <div class="modal-header">
                <h3>CSV Template Example</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <h4>Required Columns:</h4>
                <ul style="margin-bottom: 20px;">
                    <li><strong>employeeId</strong> - Unique identifier (e.g., EMP001)</li>
                    <li><strong>name</strong> - Full name (e.g., Dr. John Smith)</li>
                    <li><strong>email</strong> - Valid email address (e.g., john.smith@college.edu)</li>
                    <li><strong>password</strong> - Login password (e.g., password123)</li>
                    <li><strong>department</strong> - Department code (CSE, ECE, ME, CE, DS, IT, AI)</li>
                    <li><strong>subject</strong> - Primary subject (e.g., Data Structures)</li>
                    <li><strong>dob</strong> - Date of birth in YYYY-MM-DD format (e.g., 1980-05-15)</li>
                </ul>
                
                <h4>Optional Columns:</h4>
                <ul style="margin-bottom: 20px;">
                    <li><strong>phone</strong> - Contact number (e.g., +91-9876543210)</li>
                    <li><strong>photoUrl</strong> - Profile photo URL (leave empty for default)</li>
                    <li><strong>semester</strong> - Associated semester (e.g., 3)</li>
                    <li><strong>canEditTimetable</strong> - Permission to edit timetable (true/false)</li>
                </ul>
                
                <h4>Example CSV Content:</h4>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; overflow-x: auto;">
                    employeeId,name,email,password,department,subject,dob,phone,photoUrl,semester,canEditTimetable<br>
                    EMP001,"Dr. John Smith","john.smith@college.edu","password123","CSE","Data Structures","1980-05-15","+91-9876543210","","3","true"<br>
                    EMP002,"Prof. Jane Doe","jane.doe@college.edu","password123","ECE","Digital Electronics","1985-08-22","+91-9876543211","","2","false"
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
                    <strong>💡 Tips:</strong>
                    <ul style="margin: 10px 0;">
                        <li>Use quotes around text values that contain commas</li>
                        <li>Date format must be YYYY-MM-DD</li>
                        <li>canEditTimetable should be "true" or "false"</li>
                        <li>Employee IDs and emails must be unique</li>
                        <li>Save your file with .csv extension</li>
                    </ul>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="downloadTeacherTemplate()">📥 Download Template</button>
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(exampleModal);
}

// Download CSV template for bulk student import
function downloadStudentTemplate() {
    const templateData = [
        // Header row
        ['enrollmentNo', 'name', 'email', 'password', 'branch', 'semester', 'dob', 'phone', 'photoUrl'],
        // Example rows
        ['2024001', 'Alice Johnson', 'alice.johnson@student.edu', 'password123', 'B.Tech Computer Science', '3', '2002-03-15', '+91-9876543220', ''],
        ['2024002', 'Bob Smith', 'bob.smith@student.edu', 'password123', 'B.Tech Data Science', '3', '2002-07-22', '+91-9876543221', ''],
        ['2024003', 'Carol Davis', 'carol.davis@student.edu', 'password123', 'B.Tech Electronics', '2', '2003-01-10', '+91-9876543222', '']
    ];

    // Convert to CSV format
    const csvContent = templateData.map(row =>
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'students_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('📥 Student template downloaded successfully! Check your Downloads folder.', 'success');
}

// Show student template example in modal
function showStudentTemplateExample() {
    const exampleModal = document.createElement('div');
    exampleModal.className = 'modal-overlay';
    exampleModal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
            <div class="modal-header">
                <h3>Student CSV Template Example</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <h4>Required Columns:</h4>
                <ul style="margin-bottom: 20px;">
                    <li><strong>enrollmentNo</strong> - Unique student ID (e.g., 2024001)</li>
                    <li><strong>name</strong> - Full name (e.g., Alice Johnson)</li>
                    <li><strong>email</strong> - Valid email address (e.g., alice.johnson@student.edu)</li>
                    <li><strong>password</strong> - Login password (e.g., password123)</li>
                    <li><strong>course</strong> - Course name (e.g., B.Tech Computer Science)</li>
                    <li><strong>semester</strong> - Current semester (e.g., 3)</li>
                    <li><strong>dob</strong> - Date of birth in YYYY-MM-DD format (e.g., 2002-03-15)</li>
                </ul>
                
                <h4>Optional Columns:</h4>
                <ul style="margin-bottom: 20px;">
                    <li><strong>phone</strong> - Contact number (e.g., +91-9876543220)</li>
                    <li><strong>photoUrl</strong> - Profile photo URL (leave empty for default)</li>
                </ul>
                
                <h4>Available Courses:</h4>
                <div style="background: #f0f8ff; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                    B.Tech Computer Science, B.Tech Data Science, B.Tech Electronics, B.Tech Mechanical, B.Tech Civil, B.Tech Information Technology, B.Tech Artificial Intelligence
                </div>
                
                <h4>Example CSV Content:</h4>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; overflow-x: auto;">
                    enrollmentNo,name,email,password,branch,semester,dob,phone,photoUrl<br>
                    2024001,"Alice Johnson","alice.johnson@student.edu","password123","B.Tech Computer Science","3","2002-03-15","+91-9876543220",""<br>
                    2024002,"Bob Smith","bob.smith@student.edu","password123","B.Tech Data Science","3","2002-07-22","+91-9876543221",""
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #e8f5e8; border-radius: 5px;">
                    <strong>💡 Tips:</strong>
                    <ul style="margin: 10px 0;">
                        <li>Use quotes around text values that contain commas</li>
                        <li>Date format must be YYYY-MM-DD</li>
                        <li>Enrollment numbers and emails must be unique</li>
                        <li>Semester should be a number (1-8)</li>
                        <li>Save your file with .csv extension</li>
                    </ul>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="downloadStudentTemplate()">📥 Download Template</button>
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(exampleModal);
}

async function toggleTimetableAccess(teacherId, canEdit) {
    try {
        const response = await fetch(`${SERVER_URL}/api/teachers/${teacherId}/timetable-access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canEditTimetable: canEdit })
        });

        if (response.ok) {
            showNotification('Timetable access updated', 'success');
            loadTeachers();
        } else {
            showNotification('Failed to update access', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}


// Classrooms Management
async function loadClassrooms() {
    try {
        const response = await fetch(`${SERVER_URL}/api/classrooms`);
        const data = await response.json();
        classrooms = data.classrooms || [];
        renderClassrooms(classrooms);
    } catch (error) {
        console.error('Error loading classrooms:', error);
    }
}

function renderClassrooms(classroomsToRender) {
    const tbody = document.getElementById('classroomsTableBody');
    tbody.innerHTML = classroomsToRender.map((classroom, index) => {
        // Display all BSSIDs from array
        const bssids = classroom.wifiBSSIDs && classroom.wifiBSSIDs.length > 0 
            ? classroom.wifiBSSIDs 
            : [];
        
        const bssidDisplay = bssids.length > 0
            ? bssids.map(b => `<code class="bssid-code">${b}</code>`).join('<br>')
            : '<span style="color: var(--text-secondary);">N/A</span>';
        
        return `
        <tr>
            <td>${classroom.roomNumber}</td>
            <td>${classroom.building}</td>
            <td>${classroom.capacity}</td>
            <td>${bssidDisplay}</td>
            <td><span class="status-badge ${classroom.isActive ? 'status-active' : 'status-inactive'}">${classroom.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="action-btn edit" onclick="editClassroom('${classroom._id}')">✏️ Edit</button>
                <button class="action-btn delete" onclick="deleteClassroom('${classroom._id}')">🗑️ Delete</button>
            </td>
        </tr>
    `;
    }).join('');
}

function showAddClassroomModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Add New Classroom</h2>
        <form id="classroomForm">
            <div class="form-group">
                <label>Room Number *</label>
                <input type="text" name="roomNumber" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Building *</label>
                <input type="text" name="building" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Capacity *</label>
                <input type="number" name="capacity" class="form-input" required>
            </div>
            <div class="form-group">
                <label>WiFi BSSIDs</label>
                <div id="bssidContainer">
                    <div class="bssid-input-group" style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <input type="text" name="wifiBSSID_0" class="form-input" placeholder="XX:XX:XX:XX:XX:XX" style="flex: 1;">
                    </div>
                </div>
                <button type="button" class="btn btn-secondary" onclick="addBSSIDField()" style="margin-top: 8px; width: 100%;">➕ More BSSID</button>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="isActive" checked> Active
                </label>
            </div>
            <button type="submit" class="btn btn-primary">Add Classroom</button>
        </form>
    `;

    document.getElementById('classroomForm').addEventListener('submit', handleAddClassroom);
    openModal();
}

async function handleAddClassroom(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // Collect all BSSID inputs
    const wifiBSSIDs = [];
    let index = 0;
    while (formData.has(`wifiBSSID_${index}`)) {
        const bssid = formData.get(`wifiBSSID_${index}`).trim();
        if (bssid) {
            wifiBSSIDs.push(bssid);
        }
        index++;
    }

    const classroomData = {
        roomNumber: formData.get('roomNumber'),
        building: formData.get('building'),
        capacity: formData.get('capacity'),
        wifiBSSIDs: wifiBSSIDs,
        isActive: formData.has('isActive')
    };

    try {
        const response = await fetch(`${SERVER_URL}/api/classrooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(classroomData)
        });

        if (response.ok) {
            showNotification('Classroom added successfully', 'success');
            closeModal();
            loadClassrooms();
        } else {
            showNotification('Failed to add classroom', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function showBulkClassroomModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Bulk Import Classrooms</h2>
        <p>Upload a CSV file with columns: roomNumber, building, capacity, wifiBSSID</p>
        <form id="bulkClassroomForm">
            <div class="form-group">
                <label>CSV File *</label>
                <input type="file" name="file" accept=".csv" class="form-input" required>
            </div>
            <div class="button-group">
                <button type="button" class="btn btn-secondary" onclick="downloadClassroomTemplate()">📥 Download Template</button>
                <button type="submit" class="btn btn-primary">📤 Import Classrooms</button>
            </div>
        </form>
        <div class="csv-template">
            <h3>CSV Template Example:</h3>
            <pre>roomNumber,building,capacity,wifiBSSID
CS-101,CS,60,00:1A:2B:3C:4D:01
EC-101,EC,60,00:1A:2B:3C:5D:01
ME-101,ME,60,00:1A:2B:3C:6D:01</pre>
        </div>
    `;

    document.getElementById('bulkClassroomForm').addEventListener('submit', handleBulkClassroomImport);
    openModal();
}

function downloadClassroomTemplate() {
    const template = `roomNumber,building,capacity,wifiBSSID
CS-101,CS,60,00:1A:2B:3C:4D:01
EC-101,EC,60,00:1A:2B:3C:5D:01
ME-101,ME,60,00:1A:2B:3C:6D:01
CE-101,CE,60,00:1A:2B:3C:7D:01`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'classroom_template.csv';
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Template downloaded!', 'success');
}

async function handleBulkClassroomImport(e) {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('Please select a CSV file', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (event) {
        try {
            const csv = event.target.result;
            const lines = csv.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                showNotification('CSV file is empty or invalid', 'error');
                return;
            }

            // Parse CSV
            const headers = lines[0].split(',').map(h => h.trim());
            const classroomsToImport = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 3) {
                    const classroom = {
                        roomNumber: values[0],
                        building: values[1],
                        capacity: parseInt(values[2]),
                        wifiBSSIDs: values[3] ? [values[3]] : [],
                        isActive: true
                    };
                    classroomsToImport.push(classroom);
                }
            }

            if (classroomsToImport.length === 0) {
                showNotification('No valid classroom data found in CSV', 'error');
                return;
            }

            // Save to database
            let successCount = 0;
            for (const classroom of classroomsToImport) {
                try {
                    const response = await fetch(`${SERVER_URL}/api/classrooms`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(classroom)
                    });
                    if (response.ok) successCount++;
                } catch (err) {
                    console.error('Error saving classroom:', err);
                }
            }

            showNotification(`Successfully imported ${successCount} classrooms!`, 'success');
            closeModal();
            loadClassrooms();

        } catch (error) {
            showNotification('Error parsing CSV file: ' + error.message, 'error');
        }
    };

    reader.onerror = function () {
        showNotification('Error reading file', 'error');
    };

    reader.readAsText(file);
}


// Timetable Management
// Advanced Timetable Editor State
let selectedCells = [];
let clipboardData = null;
let undoStack = [];
let redoStack = [];
let timetableHistory = [];

// Auto-load timetable when semester or course changes
async function autoLoadTimetable() {
    const semester = document.getElementById('timetableSemester').value;
    const course = document.getElementById('timetableCourse').value;

    if (!semester || !course) {
        // Clear editor if incomplete selection
        document.getElementById('timetableEditor').innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Please select both semester and course to view timetable</div>';
        return;
    }

    await loadTimetable();
}

async function loadTimetable() {
    const semester = document.getElementById('timetableSemester').value;
    const course = document.getElementById('timetableCourse').value;

    if (!semester || !course) {
        return;
    }

    try {
        // Load timetable and classrooms in parallel
        const [timetableRes, classroomsRes, teachersRes] = await Promise.all([
            fetch(`${SERVER_URL}/api/timetable/${semester}/${course}`),
            fetch(`${SERVER_URL}/api/classrooms`),
            fetch(`${SERVER_URL}/api/teachers`)
        ]);

        const timetableData = await timetableRes.json();
        const classroomsData = await classroomsRes.json();
        const teachersData = await teachersRes.json();

        // Update global arrays
        classrooms = classroomsData.classrooms || [];
        teachers = teachersData.teachers || [];

        if (timetableData.success) {
            currentTimetable = timetableData.timetable;
            saveToHistory();
            renderAdvancedTimetableEditor(currentTimetable);
        } else {
            // No timetable found - show empty state
            document.getElementById('timetableEditor').innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">No timetable found for ${course} Semester ${semester}</p>
                    <button class="btn btn-primary" onclick="createNewTimetable()">➕ Create New Timetable</button>
                </div>
            `;
        }
    } catch (error) {
        showNotification('Error loading timetable', 'error');
    }
}

function createNewTimetable() {
    const semester = document.getElementById('timetableSemester').value;
    const course = document.getElementById('timetableCourse').value;

    if (!semester || !course) {
        showNotification('Please select semester and course', 'warning');
        return;
    }

    // Create default timetable structure with configurable college timings
    const periods = getDefaultPeriods();

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const timetable = {};
    days.forEach(day => {
        timetable[day] = periods.map(p => {
            // All periods start as regular periods - no hardcoded breaks
            return {
                period: p.number,
                subject: '',
                room: '',
                isBreak: false,
                teacher: '',
                color: ''
            };
        });
    });

    currentTimetable = { semester, branch: course, periods, timetable };
    saveToHistory();
    renderAdvancedTimetableEditor(currentTimetable);
}

// History Management
function saveToHistory() {
    if (currentTimetable) {
        undoStack.push(JSON.parse(JSON.stringify(currentTimetable)));
        redoStack = [];
        if (undoStack.length > 50) undoStack.shift();
    }
}

function undo() {
    if (undoStack.length > 1) {
        redoStack.push(undoStack.pop());
        currentTimetable = JSON.parse(JSON.stringify(undoStack[undoStack.length - 1]));
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Undo successful', 'success');
    }
}

function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop();
        undoStack.push(state);
        currentTimetable = JSON.parse(JSON.stringify(state));
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Redo successful', 'success');
    }
}

function renderAdvancedTimetableEditor(timetable) {
    const editor = document.getElementById('timetableEditor');

    // Get days dynamically from timetable and sort them in proper week order
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKeys = Object.keys(timetable.timetable).sort((a, b) => {
        return dayOrder.indexOf(a.toLowerCase()) - dayOrder.indexOf(b.toLowerCase());
    });
    const days = dayKeys.map(key => key.charAt(0).toUpperCase() + key.slice(1));

    let html = '';

    // Advanced Toolbar
    html += '<div class="advanced-toolbar">';
    html += '<div class="toolbar-section">';
    html += '<h3>📝 Edit Tools</h3>';
    html += '<button class="tool-btn" onclick="undo()" title="Undo (Ctrl+Z)">↶ Undo</button>';
    html += '<button class="tool-btn" onclick="redo()" title="Redo (Ctrl+Y)">↷ Redo</button>';
    html += '<button class="tool-btn" onclick="clearSelection()">✖ Clear Selection</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>📋 Copy/Paste</h3>';
    html += '<button class="tool-btn" onclick="copySelected()">📄 Copy</button>';
    html += '<button class="tool-btn" onclick="pasteToSelected()">📋 Paste</button>';
    html += '<button class="tool-btn" onclick="cutSelected()">✂️ Cut</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>🔄 Bulk Actions</h3>';
    html += '<button class="tool-btn" onclick="showCopyDayDialog()">📅 Copy Day</button>';
    html += '<button class="tool-btn" onclick="showFillDialog()">🎨 Fill Cells</button>';
    html += '<button class="tool-btn" onclick="clearDay()">🗑️ Clear Day</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>📆 Day Management</h3>';
    html += '<button class="tool-btn" onclick="addNewDay()">➕ Add Day</button>';
    html += '<button class="tool-btn" onclick="removeDay()">➖ Remove Day</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>📚 Subject Tools</h3>';
    html += '<button class="tool-btn" onclick="showSubjectManager()">📖 Manage Subjects</button>';
    html += '<button class="tool-btn" onclick="showTeacherAssign()">👨‍🏫 Assign Teachers</button>';
    html += '<button class="tool-btn" onclick="showColorPicker()">🎨 Color Code</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>🔍 View Options</h3>';
    html += `<button class="tool-btn" onclick="toggleTeacherView()">👨‍🏫 ${showTeachers ? 'Hide' : 'Show'} Teachers</button>`;
    html += `<button class="tool-btn" onclick="toggleRoomView()">🏢 ${showRooms ? 'Hide' : 'Show'} Rooms</button>`;
    html += `<button class="tool-btn" onclick="toggleCompactView()">📏 ${compactView ? 'Normal' : 'Compact'} View</button>`;
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>📤 Export/Import</h3>';
    html += '<button class="tool-btn" onclick="exportToPDF()">📄 Export PDF</button>';
    html += '<button class="tool-btn" onclick="exportToExcel()">📊 Export Excel</button>';
    html += '<button class="tool-btn" onclick="showImportDialog()">📥 Import</button>';
    html += '</div>';

    html += '<div class="toolbar-section">';
    html += '<h3>⚙️ Advanced</h3>';
    html += '<button class="tool-btn" onclick="showPeriodSettings()">⏰ Period Settings</button>';
    html += '<button class="tool-btn" onclick="showTemplateDialog()">💾 Save Template</button>';
    html += '<button class="tool-btn" onclick="duplicateTimetable()">📑 Duplicate</button>';
    html += '<button class="tool-btn" onclick="showConflictCheck()">⚠️ Check Conflicts</button>';
    html += '</div>';
    html += '</div>';

    // Timetable Info
    html += '<div class="timetable-info-advanced">';
    html += `<div class="info-item"><strong>Course:</strong> ${timetable.branch}</div>`;
    html += `<div class="info-item"><strong>Semester:</strong> ${timetable.semester}</div>`;
    html += `<div class="info-item"><strong>Days:</strong> ${dayKeys.length} (${days.join(', ')})</div>`;
    html += `<div class="info-item"><strong>Periods:</strong> ${timetable.periods.length} per day</div>`;
    html += `<div class="info-item"><strong>Selected:</strong> <span id="selectedCount">0</span> cells</div>`;
    html += '</div>';

    // Timetable Grid with dynamic columns
    const numPeriods = timetable.periods.length;
    html += `<div class="timetable-grid-advanced" style="grid-template-columns: 120px repeat(${numPeriods}, 1fr);">`;

    // Header row
    html += '<div class="tt-cell tt-header tt-corner">Day/Period</div>';
    timetable.periods.forEach(period => {
        // Remove hardcoded break detection - all periods look the same in header
        html += `<div class="tt-cell tt-header">
            <div class="period-number">P${period.number}</div>
            <div class="period-time">${period.startTime}-${period.endTime}</div>
        </div>`;
    });

    // Data rows
    days.forEach((day, dayIdx) => {
        html += `<div class="tt-cell tt-header tt-day-header">${day}</div>`;
        const daySchedule = timetable.timetable[dayKeys[dayIdx]] || [];

        // Ensure each day has exactly numPeriods cells
        for (let periodIdx = 0; periodIdx < numPeriods; periodIdx++) {
            const period = daySchedule[periodIdx] || { subject: '', teacher: '', room: '', isBreak: false };
            const isBreak = period.isBreak || false;
            const cellId = `cell-${dayIdx}-${periodIdx}`;
            const bgColor = period.color || '';

            // All cells are now editable and look the same, with break indicator
            html += `<div class="tt-cell tt-editable ${isBreak ? 'tt-break-marked' : ''}" 
                id="${cellId}"
                data-day="${dayIdx}" 
                data-period="${periodIdx}"
                data-is-break="${isBreak}"
                style="${bgColor ? `background-color: ${bgColor}` : ''}"
                onclick="handleCellClick(event, ${dayIdx}, ${periodIdx})"
                ondblclick="editAdvancedCell(${dayIdx}, ${periodIdx})"
                oncontextmenu="showCellContextMenu(event, ${dayIdx}, ${periodIdx}); return false;">
                <div class="cell-content">
                    ${isBreak ? `<div class="break-indicator">🔔 BREAK</div>` : ''}
                    <div class="subject-name">${isBreak ? (period.subject || 'Break') : (period.subject || '-')}</div>
                    ${!isBreak && period.teacher ? `<div class="teacher-name">👨‍🏫 ${period.teacher}</div>` : ''}
                    ${!isBreak && period.room ? `<div class="room-name">🏢 ${period.room}</div>` : ''}
                </div>
                <div class="break-toggle-btn" onclick="toggleBreakPeriod(event, ${dayIdx}, ${periodIdx})" title="${isBreak ? 'Mark as Regular Period' : 'Mark as Break'}">
                    ${isBreak ? '📚' : '🔔'}
                </div>
            </div>`;
        }
    });

    html += '</div>';

    // Quick Actions Bar
    html += '<div class="quick-actions-bar">';
    html += '<div style="color: var(--text-secondary); font-size: 14px; padding: 8px;" id="timetable-save-status">✏️ Unsaved changes</div>';
    html += '<button class="btn btn-primary" id="save-timetable-btn" onclick="saveAndRefreshSchedule()" style="background:#2563eb;border-color:#2563eb;font-weight:700;padding:8px 22px;">💾 Save</button>';
    html += '<button class="btn btn-success" onclick="autoFillTimetable()">🤖 Auto Fill</button>';
    html += '<button class="btn btn-warning" onclick="validateTimetable()">✓ Validate</button>';
    html += '<button class="btn btn-secondary" onclick="printTimetable()">🖨️ Print</button>';
    html += '<button class="btn btn-info" onclick="shareTimetable()">🔗 Share</button>';
    html += '</div>';

    editor.innerHTML = html;

    // Initialize keyboard shortcuts
    initKeyboardShortcuts();
}

// Keep old function for backward compatibility
function renderTimetableEditor(timetable) {
    renderAdvancedTimetableEditor(timetable);
}


// Cell Selection and Interaction
function handleCellClick(event, dayIdx, periodIdx) {
    const cellId = `cell-${dayIdx}-${periodIdx}`;
    const cell = document.getElementById(cellId);

    if (event.ctrlKey || event.metaKey) {
        // Multi-select with Ctrl
        toggleCellSelection(cellId, dayIdx, periodIdx);
    } else if (event.shiftKey && selectedCells.length > 0) {
        // Range select with Shift
        selectRange(selectedCells[0], { dayIdx, periodIdx });
    } else {
        // Single select
        clearSelection();
        toggleCellSelection(cellId, dayIdx, periodIdx);
    }
}

function toggleCellSelection(cellId, dayIdx, periodIdx) {
    const cell = document.getElementById(cellId);
    const index = selectedCells.findIndex(c => c.cellId === cellId);

    if (index >= 0) {
        selectedCells.splice(index, 1);
        cell.classList.remove('selected');
    } else {
        selectedCells.push({ cellId, dayIdx, periodIdx });
        cell.classList.add('selected');
    }

    document.getElementById('selectedCount').textContent = selectedCells.length;
}

function clearSelection() {
    selectedCells.forEach(({ cellId }) => {
        const cell = document.getElementById(cellId);
        if (cell) cell.classList.remove('selected');
    });
    selectedCells = [];
    document.getElementById('selectedCount').textContent = '0';
}

function selectRange(start, end) {
    clearSelection();
    const minDay = Math.min(start.dayIdx, end.dayIdx);
    const maxDay = Math.max(start.dayIdx, end.dayIdx);
    const minPeriod = Math.min(start.periodIdx, end.periodIdx);
    const maxPeriod = Math.max(start.periodIdx, end.periodIdx);

    for (let d = minDay; d <= maxDay; d++) {
        for (let p = minPeriod; p <= maxPeriod; p++) {
            const cellId = `cell-${d}-${p}`;
            toggleCellSelection(cellId, d, p);
        }
    }
}

async function editAdvancedCell(dayIdx, periodIdx) {
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];

    // Generate teacher options
    const teacherOptions = teachers.map(t =>
        `<option value="${t.name}" ${period.teacher === t.name ? 'selected' : ''}>${t.name} (${t.employeeId})</option>`
    ).join('');

    // Generate classroom options
    const classroomOptions = classrooms.map(c =>
        `<option value="${c.roomNumber}" ${period.room === c.roomNumber ? 'selected' : ''}>${c.roomNumber} - ${c.building} (Cap: ${c.capacity})</option>`
    ).join('');

    // Fetch subjects from database based on current timetable's semester and branch
    let subjectOptions = '';
    try {
        console.log(`📚 Fetching subjects for: ${currentTimetable.branch} - Semester ${currentTimetable.semester}`);
        const url = `${SERVER_URL}/api/subjects?semester=${currentTimetable.semester}&branch=${encodeURIComponent(currentTimetable.branch)}`;
        console.log('API URL:', url);

        const response = await fetch(url);
        console.log('Response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('Subjects data:', data);
            const subjects = data.subjects || [];

            if (subjects.length > 0) {
                subjectOptions = subjects.map(s =>
                    `<option value="${s.subjectName}" ${period.subject === s.subjectName ? 'selected' : ''}>${s.subjectName} (${s.subjectCode})</option>`
                ).join('');
                console.log(`✅ Loaded ${subjects.length} subjects`);
            } else {
                console.warn('⚠️ No subjects found for this semester/branch');
                subjectOptions = '<option value="">No subjects found for this semester/branch</option>';
            }
        } else {
            console.error('❌ Failed to fetch subjects, status:', response.status);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            subjectOptions = '<option value="">Failed to load subjects</option>';
        }
    } catch (error) {
        console.error('❌ Error fetching subjects:', error);
        subjectOptions = '<option value="">Error loading subjects - Check console</option>';
    }

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>✏️ Edit Period</h2>
        <form id="periodForm">
            <div class="form-group">
                <label>📚 Subject</label>
                <select name="subject" class="form-select">
                    <option value="">-- Select Subject --</option>
                    ${subjectOptions}
                </select>
                <small style="color: var(--text-secondary); font-size: 12px;">Subjects from database for ${currentTimetable.branch} - Semester ${currentTimetable.semester}</small>
            </div>
            <div class="form-group">
                <label>👨‍🏫 Teacher</label>
                <select name="teacher" class="form-select">
                    <option value="">-- Select Teacher --</option>
                    ${teacherOptions}
                </select>
                <small style="color: var(--text-secondary); font-size: 12px;">Only registered teachers can be assigned</small>
            </div>
            <div class="form-group">
                <label>🏢 Classroom</label>
                <select name="room" class="form-select">
                    <option value="">-- Select Classroom --</option>
                    ${classroomOptions}
                </select>
                <small style="color: var(--text-secondary); font-size: 12px;">Only registered classrooms can be assigned</small>
            </div>
            <div class="form-group">
                <label>🎨 Color</label>
                <input type="color" name="color" class="form-input" value="${period.color || '#1e3a5f'}">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="isBreak" ${period.isBreak ? 'checked' : ''}> Is Break Period
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    // Track if color was changed
    let colorChanged = false;
    const originalColor = period.color || '';
    document.querySelector('input[name="color"]').addEventListener('change', () => {
        colorChanged = true;
    });

    document.getElementById('periodForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const newTeacher = formData.get('teacher');
        const newRoom = formData.get('room');
        const newSubject = formData.get('subject');
        const isBreak = formData.has('isBreak');

        // Check for teacher conflicts if teacher is assigned and not a break
        if (newTeacher && !isBreak) {
            const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const currentDay = dayKeys[dayIdx];
            const currentPeriodNumber = currentTimetable.periods[periodIdx].number;

            const conflict = await checkTeacherConflict(newTeacher, currentDay, currentPeriodNumber, newRoom, currentTimetable.branch, currentTimetable.semester);

            if (conflict) {
                const message = `⚠️ Teacher Conflict!\n\n${newTeacher} is already assigned to:\n` +
                    `• ${conflict.branch} - Semester ${conflict.semester}\n` +
                    `• ${currentDay} - Period ${currentPeriodNumber}\n` +
                    `• Subject: ${conflict.subject}\n` +
                    `• Room: ${conflict.room}\n\n` +
                    `Cannot assign same teacher to different rooms at the same time.`;

                if (!confirm(message + '\n\nDo you want to assign anyway?')) {
                    return; // Cancel the save
                }
            }
        }

        saveToHistory();
        period.subject = newSubject;
        period.teacher = newTeacher;
        period.room = newRoom;

        // Only update color if user explicitly changed it
        if (colorChanged) {
            const newColor = formData.get('color');
            period.color = newColor;
        }

        period.isBreak = isBreak;

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Period updated successfully', 'success');

        // Trigger auto-save after edit
        triggerAutoSave();
    });

    openModal();
}

// Check for teacher conflicts across all timetables
async function checkTeacherConflict(teacherName, day, periodNumber, room, currentBranch, currentSemester) {
    try {
        // Fetch all timetables from server
        const response = await fetch(`${SERVER_URL}/api/timetables`);
        if (!response.ok) {
            console.error('Failed to fetch timetables for conflict check');
            return null;
        }

        const data = await response.json();
        const allTimetables = data.timetables || [];

        // Check each timetable for conflicts
        for (const timetable of allTimetables) {
            // Skip the current timetable being edited
            if (timetable.branch === currentBranch && timetable.semester === currentSemester) {
                continue;
            }

            // Check if this timetable has the same day
            if (!timetable.timetable || !timetable.timetable[day]) {
                continue;
            }

            // Find the period with matching period number
            const periods = timetable.timetable[day];
            for (let i = 0; i < periods.length; i++) {
                const period = periods[i];
                const periodNum = timetable.periods && timetable.periods[i] ? timetable.periods[i].number : i + 1;

                // Check if same teacher, same period number, but different room
                if (period.teacher === teacherName &&
                    periodNum === periodNumber &&
                    !period.isBreak &&
                    period.room !== room) {

                    // Found a conflict!
                    return {
                        branch: timetable.branch,
                        semester: timetable.semester,
                        day: day,
                        periodNumber: periodNum,
                        subject: period.subject,
                        room: period.room,
                        teacher: period.teacher
                    };
                }
            }
        }

        return null; // No conflict found
    } catch (error) {
        console.error('Error checking teacher conflict:', error);
        return null; // Don't block on error
    }
}

// Keep old function for compatibility
function editTimetableCell(dayIdx, periodIdx) {
    editAdvancedCell(dayIdx, periodIdx);
}

// Toggle Break Period Function
function toggleBreakPeriod(event, dayIdx, periodIdx) {
    event.stopPropagation(); // Prevent cell click

    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayKeys[dayIdx];

    if (!currentTimetable || !currentTimetable.timetable[dayKey]) {
        console.error('No timetable data available');
        return;
    }

    // Ensure the period exists
    if (!currentTimetable.timetable[dayKey][periodIdx]) {
        currentTimetable.timetable[dayKey][periodIdx] = {
            period: periodIdx + 1,
            subject: '',
            teacher: '',
            teacherName: '',
            room: '',
            isBreak: false
        };
    }

    const period = currentTimetable.timetable[dayKey][periodIdx];
    const wasBreak = period.isBreak || false;

    // Toggle break status
    period.isBreak = !wasBreak;

    if (period.isBreak) {
        // Mark as break - clear other fields and set break subject
        period.subject = 'Break';
        period.teacher = '';
        period.teacherName = '';
        period.room = '';
    } else {
        // Revert to normal period - clear break subject
        if (period.subject === 'Break' || period.subject === 'Lunch Break') {
            period.subject = '';
        }
    }

    // Update the cell visually
    const cellId = `cell-${dayIdx}-${periodIdx}`;
    const cell = document.getElementById(cellId);

    if (cell) {
        if (period.isBreak) {
            cell.classList.add('tt-break-marked');
            cell.setAttribute('data-is-break', 'true');
        } else {
            cell.classList.remove('tt-break-marked');
            cell.setAttribute('data-is-break', 'false');
        }

        // Update cell content
        const cellContent = cell.querySelector('.cell-content');
        if (cellContent) {
            cellContent.innerHTML = `
                ${period.isBreak ? `<div class="break-indicator">🔔 BREAK</div>` : ''}
                <div class="subject-name">${period.isBreak ? (period.subject || 'Break') : (period.subject || '-')}</div>
                ${!period.isBreak && period.teacher ? `<div class="teacher-name">👨‍🏫 ${period.teacher}</div>` : ''}
                ${!period.isBreak && period.room ? `<div class="room-name">🏢 ${period.room}</div>` : ''}
            `;
        }

        // Update toggle button
        const toggleBtn = cell.querySelector('.break-toggle-btn');
        if (toggleBtn) {
            toggleBtn.innerHTML = period.isBreak ? '📚' : '🔔';
            toggleBtn.title = period.isBreak ? 'Mark as Regular Period' : 'Mark as Break';
        }
    }

    // Auto-save the changes
    triggerAutoSave();

    console.log(`Period ${periodIdx + 1} on ${dayKey} ${period.isBreak ? 'marked as break' : 'reverted to normal'}`);
}

// Mark unsaved changes (replaces auto-save)
function triggerAutoSave() {
    const status = document.getElementById('timetable-save-status');
    if (status) {
        status.textContent = '✏️ Unsaved changes';
        status.style.color = '#f59e0b';
    }
    const btn = document.getElementById('save-timetable-btn');
    if (btn) {
        btn.style.background = '#f59e0b';
        btn.style.borderColor = '#f59e0b';
    }
}

async function saveTimetable(silent = false) {
    if (!currentTimetable) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/timetable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentTimetable)
        });

        if (response.ok) {
            if (!silent) {
                showNotification('Timetable saved successfully', 'success');
            }
        } else {
            if (!silent) {
                showNotification('Failed to save timetable', 'error');
            }
        }
    } catch (error) {
        if (!silent) {
            showNotification('Error: ' + error.message, 'error');
        }
    }
}

// Save timetable + trigger offline BSSID schedule refresh for all students
async function saveAndRefreshSchedule() {
    if (!currentTimetable) return;

    const btn = document.getElementById('save-timetable-btn');
    const status = document.getElementById('timetable-save-status');

    // Show saving state
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }
    if (status) { status.textContent = '⏳ Saving...'; status.style.color = 'var(--text-secondary)'; }

    try {
        // Step 1: Save timetable
        const saveResp = await fetch(`${SERVER_URL}/api/timetable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentTimetable)
        });

        if (!saveResp.ok) {
            throw new Error('Failed to save timetable');
        }

        // Step 2: Trigger BSSID schedule broadcast so students' offline cache updates
        // POST /api/timetable already calls broadcastBSSIDScheduleUpdate on the server.
        // We also call PUT to ensure the broadcast fires with the latest saved data.
        const semester = currentTimetable.semester;
        const branch = currentTimetable.branch;
        if (semester && branch) {
            await fetch(`${SERVER_URL}/api/timetable/${semester}/${encodeURIComponent(branch)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timetable: currentTimetable.timetable,
                    periods: currentTimetable.periods
                })
            });
        }

        // Update UI to saved state
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ Saved';
            btn.style.background = '#22c55e';
            btn.style.borderColor = '#22c55e';
            setTimeout(() => {
                btn.textContent = '💾 Save';
                btn.style.background = '#2563eb';
                btn.style.borderColor = '#2563eb';
            }, 2000);
        }
        if (status) { status.textContent = '✅ Saved & schedule refreshed'; status.style.color = '#22c55e'; }
        showNotification('Timetable saved & offline schedule updated for all students', 'success');

    } catch (error) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Save';
            btn.style.background = '#ef4444';
            btn.style.borderColor = '#ef4444';
            setTimeout(() => {
                btn.style.background = '#2563eb';
                btn.style.borderColor = '#2563eb';
            }, 2000);
        }
        if (status) { status.textContent = '❌ Save failed'; status.style.color = '#ef4444'; }
        showNotification('Error: ' + error.message, 'error');
    }
}

// Copy/Paste Functions
function copySelected() {
    if (selectedCells.length === 0) {
        showNotification('No cells selected', 'warning');
        return;
    }

    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    clipboardData = selectedCells.map(({ dayIdx, periodIdx }) => {
        const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
        return JSON.parse(JSON.stringify(period));
    });

    showNotification(`Copied ${selectedCells.length} cell(s)`, 'success');
}

function cutSelected() {
    copySelected();
    if (clipboardData) {
        saveToHistory();
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        selectedCells.forEach(({ dayIdx, periodIdx }) => {
            const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
            if (!period.isBreak) {
                period.subject = '';
                period.teacher = '';
                period.room = '';
                period.color = '';
            }
        });
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Cut successful', 'success');
        triggerAutoSave();
    }
}

function pasteToSelected() {
    if (!clipboardData || clipboardData.length === 0) {
        showNotification('Nothing to paste', 'warning');
        return;
    }

    if (selectedCells.length === 0) {
        showNotification('No cells selected', 'warning');
        return;
    }

    saveToHistory();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    selectedCells.forEach(({ dayIdx, periodIdx }, index) => {
        const sourceData = clipboardData[index % clipboardData.length];
        const targetPeriod = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];

        if (!targetPeriod.isBreak) {
            targetPeriod.subject = sourceData.subject;
            targetPeriod.teacher = sourceData.teacher;
            targetPeriod.room = sourceData.room;
            targetPeriod.color = sourceData.color;
        }
    });

    renderAdvancedTimetableEditor(currentTimetable);
    showNotification('Paste successful', 'success');
    triggerAutoSave();
}

// Bulk Actions
function showCopyDayDialog() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📅 Copy Day</h2>
        <form id="copyDayForm">
            <div class="form-group">
                <label>From Day:</label>
                <select name="fromDay" class="form-select">
                    <option value="0">Monday</option>
                    <option value="1">Tuesday</option>
                    <option value="2">Wednesday</option>
                    <option value="3">Thursday</option>
                    <option value="4">Friday</option>
                    <option value="5">Saturday</option>
                </select>
            </div>
            <div class="form-group">
                <label>To Day(s):</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" name="toDay" value="0"> Monday</label>
                    <label><input type="checkbox" name="toDay" value="1"> Tuesday</label>
                    <label><input type="checkbox" name="toDay" value="2"> Wednesday</label>
                    <label><input type="checkbox" name="toDay" value="3"> Thursday</label>
                    <label><input type="checkbox" name="toDay" value="4"> Friday</label>
                    <label><input type="checkbox" name="toDay" value="5"> Saturday</label>
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Copy</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('copyDayForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const fromDay = parseInt(formData.get('fromDay'));
        const toDays = formData.getAll('toDay').map(d => parseInt(d));

        if (toDays.length === 0) {
            showNotification('Select at least one target day', 'warning');
            return;
        }

        saveToHistory();
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const sourceDay = currentTimetable.timetable[dayKeys[fromDay]];

        toDays.forEach(toDay => {
            if (toDay !== fromDay) {
                currentTimetable.timetable[dayKeys[toDay]] = JSON.parse(JSON.stringify(sourceDay));
            }
        });

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification(`Copied to ${toDays.length} day(s)`, 'success');
        triggerAutoSave();
    });

    openModal();
}

function showFillDialog() {
    if (selectedCells.length === 0) {
        showNotification('Select cells first', 'warning');
        return;
    }

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>🎨 Fill Selected Cells</h2>
        <form id="fillForm">
            <div class="form-group">
                <label>Subject:</label>
                <input type="text" name="subject" class="form-input">
            </div>
            <div class="form-group">
                <label>Teacher:</label>
                <input type="text" name="teacher" class="form-input">
            </div>
            <div class="form-group">
                <label>Room:</label>
                <input type="text" name="room" class="form-input">
            </div>
            <div class="form-group">
                <label>Color:</label>
                <input type="color" name="color" class="form-input">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Fill</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('fillForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveToHistory();
        const formData = new FormData(e.target);
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        selectedCells.forEach(({ dayIdx, periodIdx }) => {
            const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
            if (!period.isBreak) {
                if (formData.get('subject')) period.subject = formData.get('subject');
                if (formData.get('teacher')) period.teacher = formData.get('teacher');
                if (formData.get('room')) period.room = formData.get('room');
                if (formData.get('color')) period.color = formData.get('color');
            }
        });

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Cells filled successfully', 'success');
        triggerAutoSave();
    });

    openModal();
}

function clearDay() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>🗑️ Clear Day</h2>
        <p>Select day to clear:</p>
        <form id="clearDayForm">
            <div class="form-group">
                <select name="day" class="form-select">
                    <option value="0">Monday</option>
                    <option value="1">Tuesday</option>
                    <option value="2">Wednesday</option>
                    <option value="3">Thursday</option>
                    <option value="4">Friday</option>
                    <option value="5">Saturday</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-danger">Clear</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('clearDayForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveToHistory();
        const formData = new FormData(e.target);
        const dayIdx = parseInt(formData.get('day'));
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        currentTimetable.timetable[dayKeys[dayIdx]].forEach(period => {
            if (!period.isBreak) {
                period.subject = '';
                period.teacher = '';
                period.room = '';
                period.color = '';
            }
        });

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification('Day cleared', 'success');
        triggerAutoSave();
    });

    openModal();
}

// Day Management Functions
function addNewDay() {
    if (!currentTimetable) {
        showNotification('No timetable loaded', 'error');
        return;
    }

    const modalBody = document.getElementById('modalBody');
    const availableDays = [
        { key: 'sunday', name: 'Sunday' },
        { key: 'monday', name: 'Monday' },
        { key: 'tuesday', name: 'Tuesday' },
        { key: 'wednesday', name: 'Wednesday' },
        { key: 'thursday', name: 'Thursday' },
        { key: 'friday', name: 'Friday' },
        { key: 'saturday', name: 'Saturday' }
    ];

    // Find days not in timetable
    const existingDays = Object.keys(currentTimetable.timetable);
    const missingDays = availableDays.filter(day => !existingDays.includes(day.key));

    if (missingDays.length === 0) {
        showNotification('All days are already in the timetable', 'info');
        return;
    }

    modalBody.innerHTML = `
        <h2>➕ Add New Day</h2>
        <p>Select a day to add to the timetable:</p>
        <form id="addDayForm">
            <div class="form-group">
                <label>Day:</label>
                <select name="day" class="form-select" required>
                    ${missingDays.map(day => `<option value="${day.key}">${day.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="copyFromDay" id="copyFromDay">
                    Copy schedule from existing day
                </label>
            </div>
            <div class="form-group" id="copyFromDayGroup" style="display: none;">
                <label>Copy from:</label>
                <select name="sourceDay" class="form-select">
                    ${existingDays.map(day => `<option value="${day}">${day.charAt(0).toUpperCase() + day.slice(1)}</option>`).join('')}
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Day</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    // Toggle copy from day option
    document.getElementById('copyFromDay').addEventListener('change', (e) => {
        document.getElementById('copyFromDayGroup').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('addDayForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveToHistory();

        const formData = new FormData(e.target);
        const newDay = formData.get('day');
        const copyFromDay = formData.get('copyFromDay') === 'on';
        const sourceDay = formData.get('sourceDay');

        // Create empty schedule for the new day
        const numPeriods = currentTimetable.periods.length;
        const newSchedule = [];

        if (copyFromDay && sourceDay && currentTimetable.timetable[sourceDay]) {
            // Copy from existing day
            newSchedule.push(...JSON.parse(JSON.stringify(currentTimetable.timetable[sourceDay])));
        } else {
            // Create empty schedule
            for (let i = 0; i < numPeriods; i++) {
                newSchedule.push({
                    period: i + 1,
                    subject: '',
                    room: '',
                    teacher: '',
                    isBreak: false
                });
            }
        }

        currentTimetable.timetable[newDay] = newSchedule;

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);

        // Save immediately to server
        saveTimetable(false).then(() => {
            showNotification(`${newDay.charAt(0).toUpperCase() + newDay.slice(1)} added and saved successfully`, 'success');
        });
    });

    openModal();
}

function removeDay() {
    if (!currentTimetable) {
        showNotification('No timetable loaded', 'error');
        return;
    }

    const modalBody = document.getElementById('modalBody');
    const existingDays = Object.keys(currentTimetable.timetable);

    if (existingDays.length <= 1) {
        showNotification('Cannot remove the last day', 'error');
        return;
    }

    modalBody.innerHTML = `
        <h2>➖ Remove Day</h2>
        <p style="color: var(--warning); margin-bottom: 15px;">⚠️ Warning: This will permanently delete all classes for the selected day!</p>
        <form id="removeDayForm">
            <div class="form-group">
                <label>Select day to remove:</label>
                <select name="day" class="form-select" required>
                    ${existingDays.map(day => `<option value="${day}">${day.charAt(0).toUpperCase() + day.slice(1)}</option>`).join('')}
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-danger">Remove Day</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('removeDayForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const dayToRemove = formData.get('day');

        if (!confirm(`Are you sure you want to remove ${dayToRemove.charAt(0).toUpperCase() + dayToRemove.slice(1)}? This cannot be undone.`)) {
            return;
        }

        saveToHistory();
        delete currentTimetable.timetable[dayToRemove];

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);

        // Save immediately to server
        saveTimetable(false).then(() => {
            showNotification(`${dayToRemove.charAt(0).toUpperCase() + dayToRemove.slice(1)} removed and saved successfully`, 'success');
        });
    });

    openModal();
}

function exportTimetable() {
    if (!currentTimetable) {
        showNotification('No timetable to export', 'warning');
        return;
    }

    const dataStr = JSON.stringify(currentTimetable, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timetable_${currentTimetable.branch}_sem${currentTimetable.semester}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Timetable exported successfully', 'success');
}

// Utility Functions
function openModal() {
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

function showNotification(message, type = 'info') {
    // Simple notification - you can enhance this
    alert(message);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function loadSettings() {
    const savedUrl = localStorage.getItem('serverUrl');
    if (savedUrl) {
        SERVER_URL = savedUrl;
        document.getElementById('serverUrl').value = savedUrl;
    }
}

function saveServerSettings() {
    const url = document.getElementById('serverUrl').value;
    SERVER_URL = url;
    localStorage.setItem('serverUrl', url);
    showNotification('Settings saved', 'success');
    checkServerConnection();
}

// Load attendance threshold
async function loadAttendanceThreshold() {
    try {
        const response = await fetch(`${SERVER_URL}/api/settings/attendance-threshold`);
        const data = await response.json();

        if (data.success) {
            const threshold = data.threshold || 75;
            document.getElementById('attendanceThreshold').value = threshold;
            document.getElementById('attendanceThresholdValue').value = threshold;
            document.getElementById('currentThresholdDisplay').textContent = `${threshold}%`;
            console.log(`✅ Loaded attendance threshold: ${threshold}%`);
        }
    } catch (error) {
        console.error('Error loading threshold:', error);
    }
}

// Save attendance threshold
async function saveAttendanceThreshold() {
    try {
        const threshold = parseInt(document.getElementById('attendanceThresholdValue').value);

        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
            showNotification('Threshold must be between 0 and 100', 'error');
            return;
        }

        const response = await fetch(`${SERVER_URL}/api/settings/attendance-threshold`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                threshold: threshold,
                updatedBy: 'admin'
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Attendance threshold updated to ${threshold}%`, 'success');
            document.getElementById('currentThresholdDisplay').textContent = `${threshold}%`;
            console.log(`✅ Threshold saved: ${threshold}%`);
        } else {
            showNotification('Failed to save threshold: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving threshold:', error);
        showNotification('Error saving threshold', 'error');
    }
}

// Sync slider and input
function setupThresholdSync() {
    const slider = document.getElementById('attendanceThreshold');
    const input = document.getElementById('attendanceThresholdValue');

    if (slider && input) {
        slider.addEventListener('input', (e) => {
            input.value = e.target.value;
        });

        input.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 0;
            if (value >= 0 && value <= 100) {
                slider.value = value;
            }
        });
    }

    // Load threshold when settings section is opened
    loadAttendanceThreshold();
}

// Delete functions
async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;

    const student = students.find(s => s._id === id || s.enrollmentNo === id);
    const identifier = student?._id || id;

    try {
        const response = await fetch(`${SERVER_URL}/api/students/${identifier}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification('Student deleted', 'success');
            loadStudents();
        }
    } catch (error) {
        showNotification('Error deleting student', 'error');
    }
}

async function deleteTeacher(id) {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/teachers/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification('Teacher deleted', 'success');
            loadTeachers();
        }
    } catch (error) {
        showNotification('Error deleting teacher', 'error');
    }
}

async function deleteClassroom(id) {
    const classroom = classrooms.find(c => c._id === id);
    if (!confirm(`Are you sure you want to delete classroom ${classroom?.roomNumber || 'this'}?`)) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/classrooms/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification('Classroom deleted', 'success');
            loadClassrooms();
        }
    } catch (error) {
        showNotification('Error deleting classroom', 'error');
    }
}

// Helper functions for dynamic BSSID fields
function addBSSIDField() {
    const container = document.getElementById('bssidContainer');
    const currentCount = container.querySelectorAll('.bssid-input-group').length;
    
    const newField = document.createElement('div');
    newField.className = 'bssid-input-group';
    newField.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
    newField.innerHTML = `
        <input type="text" name="wifiBSSID_${currentCount}" class="form-input" placeholder="XX:XX:XX:XX:XX:XX" style="flex: 1;">
        <button type="button" class="btn btn-secondary" onclick="removeBSSIDField(this)" style="padding: 8px 12px;">🗑️</button>
    `;
    
    container.appendChild(newField);
}

function removeBSSIDField(button) {
    const fieldGroup = button.parentElement;
    fieldGroup.remove();
    
    // Reindex remaining fields
    const container = document.getElementById('bssidContainer');
    const inputs = container.querySelectorAll('input[name^="wifiBSSID_"]');
    inputs.forEach((input, index) => {
        input.name = `wifiBSSID_${index}`;
    });
}

// Edit functions
async function editStudent(id) {
    try {
        console.log('🔍 Edit student called with ID:', id);
        console.log('📋 Available students:', students.length);
        
        const student = students.find(s => s._id === id || s.enrollmentNo === id);
        
        if (!student) {
            console.error('❌ Student not found with ID:', id);
            console.log('Available student IDs:', students.map(s => ({ _id: s._id, enrollmentNo: s.enrollmentNo })));
            showNotification('Student not found. Please refresh the page and try again.', 'error');
            return;
        }
        
        console.log('✅ Found student:', student.name);

        // Get current photo
        let currentPhotoUrl = student.photoUrl;
        if (currentPhotoUrl && currentPhotoUrl.startsWith('student_photo_')) {
            currentPhotoUrl = localStorage.getItem(currentPhotoUrl);
        }
        if (!currentPhotoUrl) {
            currentPhotoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=00d9ff&color=fff&size=128`;
        }

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <h2>Edit Student</h2>
            <form id="editStudentForm">
                <div class="form-group">
                    <label>Enrollment Number *</label>
                    <input type="text" name="enrollmentNo" class="form-input" value="${student.enrollmentNo}" required>
                </div>
                <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" name="name" class="form-input" value="${student.name}" required>
                </div>
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" name="email" class="form-input" value="${student.email}" required>
                </div>
                <div class="form-group">
                    <label>Password (leave blank to keep current)</label>
                    <input type="password" name="password" class="form-input" placeholder="Enter new password">
                </div>
                <div class="form-group">
                    <label>Course *</label>
                    <select name="course" class="form-select" required>
                        <option value="">Select Branch</option>
                        ${generateBranchOptions(student.branch)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Semester *</label>
                    <select name="semester" class="form-select" required>
                        ${generateSemesterOptions(student.semester)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Date of Birth *</label>
                    <input type="date" name="dob" class="form-input" value="${student.dob ? student.dob.split('T')[0] : ''}" required>
                </div>
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" name="phone" class="form-input" value="${student.phone || ''}">
                </div>
                <div class="form-group">
                    <label>Profile Photo</label>
                    <div class="photo-capture">
                        <div class="photo-preview" id="photoPreview">
                            <img src="${currentPhotoUrl}" alt="Current Photo" class="captured-photo">
                        </div>
                        <div class="photo-buttons">
                            <button type="button" class="btn btn-secondary" onclick="openCamera()">📸 Take Photo</button>
                            <button type="button" class="btn btn-secondary" onclick="uploadPhoto()">📁 Upload</button>
                            <button type="button" class="btn btn-danger" onclick="clearPhoto()" id="clearPhotoBtn">🗑️ Clear</button>
                        </div>
                        <input type="file" id="photoUpload" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">
                        <input type="hidden" name="photoData" id="photoData">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary">Update Student</button>
            </form>
            
            <!-- Camera Modal -->
            <div id="cameraModal" class="camera-modal" style="display:none;">
                <div class="camera-content">
                    <video id="cameraVideo" autoplay playsinline></video>
                    <canvas id="cameraCanvas" style="display:none;"></canvas>
                    <div class="camera-controls">
                        <button type="button" class="btn btn-primary" onclick="capturePhoto()">📸 Capture</button>
                        <button type="button" class="btn btn-secondary" onclick="closeCamera()">❌ Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const studentData = Object.fromEntries(formData);

            if (studentData.course && !studentData.branch) {
                studentData.branch = studentData.course;
            }
            delete studentData.course;

            // Remove password if empty
            if (!studentData.password) {
                delete studentData.password;
            }

            // Upload photo to server if changed
            if (studentData.photoData) {
                try {
                    const photoResponse = await fetch(`${SERVER_URL}/api/upload-photo`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            photoData: studentData.photoData,
                            type: 'student',
                            id: studentData.enrollmentNo
                        })
                    });

                    const photoResult = await photoResponse.json();

                    if (photoResponse.ok && photoResult.success) {
                        studentData.photoUrl = photoResult.photoUrl;
                        console.log('✅ Photo updated with face detected');
                    } else {
                        const errorMsg = photoResult.error || 'Photo upload failed';
                        console.error('❌ Photo upload failed:', errorMsg);
                        showNotification('Photo upload skipped: ' + errorMsg, 'error');
                    }
                } catch (error) {
                    console.error('Error uploading photo:', error);
                    showNotification('Photo upload skipped: ' + error.message, 'error');
                }
                delete studentData.photoData;
            }

            try {
                const identifier = student._id || id;
                const response = await fetch(`${SERVER_URL}/api/students/${identifier}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(studentData)
                });

                if (response.ok) {
                    showNotification('Student updated successfully', 'success');
                    closeModal();
                    loadStudents();
                } else {
                    let errorMsg = 'Failed to update student';
                    try {
                        const err = await response.json();
                        errorMsg = err?.details || err?.error || err?.message || errorMsg;
                    } catch {
                        // ignore
                    }
                    showNotification(errorMsg, 'error');
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        });

        openModal();
    } catch (error) {
        console.error('❌ Error in editStudent function:', error);
        showNotification('Error opening edit form: ' + error.message, 'error');
    }
}

async function editTeacher(id) {
    const teacher = teachers.find(t => t._id === id);
    if (!teacher) return;

    // Get current photo
    let currentPhotoUrl = teacher.photoUrl;
    if (currentPhotoUrl && currentPhotoUrl.startsWith('teacher_photo_')) {
        currentPhotoUrl = localStorage.getItem(currentPhotoUrl);
    }
    if (!currentPhotoUrl) {
        currentPhotoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=7c3aed&color=fff&size=128`;
    }

    // Load all subjects for multi-select
    let allSubjects = [];
    try {
        const r = await calApiFetch(`${SERVER_URL}/api/subjects`);
        if (r.success) allSubjects = r.subjects || [];
    } catch (_) {}

    // Existing subjects on this teacher (array or legacy single string)
    const existingSubjects = Array.isArray(teacher.subjects) && teacher.subjects.length > 0
        ? teacher.subjects
        : (teacher.subject ? [teacher.subject] : []);

    const subjectOptions = allSubjects.map(s => {
        const selected = existingSubjects.includes(s.subjectName) ? 'selected' : '';
        return `<option value="${s.subjectName}" ${selected}>${s.subjectName} (${s.branch} Sem ${s.semester})</option>`;
    }).join('');

    // Subjects that are in existingSubjects but NOT in allSubjects (manually entered)
    const knownNames = allSubjects.map(s => s.subjectName);
    const manualSubjects = existingSubjects.filter(s => !knownNames.includes(s)).join(', ');

    const subjectsHtml = allSubjects.length > 0
        ? `<select id="teacherSubjectsSelect" class="form-select" multiple size="5" style="height:auto">
               ${subjectOptions}
           </select>
           <small style="color:var(--text-secondary);margin-top:4px;display:block">
               Or type manually: <input type="text" id="teacherSubjectManual" class="form-input" style="margin-top:6px"
               placeholder="e.g. Mathematics, Physics" value="${manualSubjects}">
           </small>`
        : `<input type="text" id="teacherSubjectManual" class="form-input"
               placeholder="e.g., Data Structures, Mathematics"
               value="${existingSubjects.join(', ')}" required>
           <small style="color:var(--text-secondary)">No subjects configured yet — type manually (comma separated)</small>`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Edit Teacher</h2>
        <form id="editTeacherForm">
            <div class="form-group">
                <label>Employee ID *</label>
                <input type="text" name="employeeId" class="form-input" value="${teacher.employeeId}" required>
            </div>
            <div class="form-group">
                <label>Full Name *</label>
                <input type="text" name="name" class="form-input" value="${teacher.name}" required>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" name="email" class="form-input" value="${teacher.email}" required>
            </div>
            <div class="form-group">
                <label>Password (leave blank to keep current)</label>
                <input type="password" name="password" class="form-input" placeholder="Enter new password">
            </div>
            <div class="form-group">
                <label>Department *</label>
                <select name="department" class="form-select" required>
                    ${generateDepartmentOptions(teacher.department)}
                </select>
            </div>
            <div class="form-group">
                <label>Subjects Taught *
                    <small style="color:var(--text-secondary);font-weight:normal"> — hold Ctrl/Cmd to select multiple</small>
                </label>
                ${subjectsHtml}
            </div>
            <div class="form-group">
                <label>Date of Birth *</label>
                <input type="date" name="dob" class="form-input" value="${teacher.dob ? teacher.dob.split('T')[0] : ''}" required>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" class="form-input" value="${teacher.phone || ''}">
            </div>
            <div class="form-group">
                <label>Profile Photo</label>
                <div class="photo-capture">
                    <div class="photo-preview" id="photoPreview">
                        <img src="${currentPhotoUrl}" alt="Current Photo" class="captured-photo">
                    </div>
                    <div class="photo-buttons">
                        <button type="button" class="btn btn-secondary" onclick="openCamera()">📸 Take Photo</button>
                        <button type="button" class="btn btn-secondary" onclick="uploadPhoto()">📁 Upload</button>
                        <button type="button" class="btn btn-danger" onclick="clearPhoto()" id="clearPhotoBtn">🗑️ Clear</button>
                    </div>
                    <input type="file" id="photoUpload" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">
                    <input type="hidden" name="photoData" id="photoData">
                </div>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="canEditTimetable" ${teacher.canEditTimetable ? 'checked' : ''}> Can Edit Timetable
                </label>
            </div>
            <button type="submit" class="btn btn-primary">Update Teacher</button>
        </form>
        
        <!-- Camera Modal -->
        <div id="cameraModal" class="camera-modal" style="display:none;">
            <div class="camera-content">
                <video id="cameraVideo" autoplay playsinline></video>
                <canvas id="cameraCanvas" style="display:none;"></canvas>
                <div class="camera-controls">
                    <button type="button" class="btn btn-primary" onclick="capturePhoto()">📸 Capture</button>
                    <button type="button" class="btn btn-secondary" onclick="closeCamera()">❌ Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('editTeacherForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const teacherData = Object.fromEntries(formData);
        teacherData.canEditTimetable = formData.has('canEditTimetable');

        // Collect subjects from multi-select + manual input
        const selectEl = document.getElementById('teacherSubjectsSelect');
        const manualEl = document.getElementById('teacherSubjectManual');
        const selected = selectEl ? Array.from(selectEl.selectedOptions).map(o => o.value) : [];
        const manual   = manualEl ? manualEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];
        const subjects = [...new Set([...selected, ...manual])];

        if (subjects.length === 0) {
            showNotification('Please select or enter at least one subject.', 'error');
            return;
        }

        teacherData.subjects = subjects;
        teacherData.subject  = subjects[0]; // keep legacy field

        // Remove password if empty
        if (!teacherData.password) {
            delete teacherData.password;
        }

        // Upload photo to server if changed
        if (teacherData.photoData) {
            try {
                const photoResponse = await fetch(`${SERVER_URL}/api/upload-photo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        photoData: teacherData.photoData,
                        type: 'teacher',
                        id: teacherData.employeeId
                    })
                });

                const photoResult = await photoResponse.json();

                if (photoResponse.ok && photoResult.success) {
                    teacherData.photoUrl = photoResult.photoUrl;
                    console.log('✅ Photo updated with face detected');
                } else {
                    const errorMsg = photoResult.error || 'Photo upload failed';
                    console.error('❌ Photo upload failed:', errorMsg);
                    alert('Photo Upload Failed\n\n' + errorMsg + '\n\nPlease use a clear, well-lit photo showing your face.');
                    return;
                }
            } catch (error) {
                console.error('Error uploading photo:', error);
                alert('❌ Error uploading photo: ' + error.message);
                return;
            }
            delete teacherData.photoData;
        }

        try {
            const response = await fetch(`${SERVER_URL}/api/teachers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teacherData)
            });

            if (response.ok) {
                showNotification('Teacher updated successfully', 'success');
                closeModal();
                loadTeachers();
            } else {
                showNotification('Failed to update teacher', 'error');
            }
        } catch (error) {
            showNotification('Error: ' + error.message, 'error');
        }
    });

    openModal();
}

async function editClassroom(id) {
    const classroom = classrooms.find(c => c._id === id);
    if (!classroom) {
        showNotification('Classroom not found', 'error');
        return;
    }

    // Ensure wifiBSSIDs array exists
    const bssids = classroom.wifiBSSIDs && classroom.wifiBSSIDs.length > 0 
        ? classroom.wifiBSSIDs 
        : [''];

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Edit Classroom</h2>
        <form id="editClassroomForm">
            <div class="form-group">
                <label>Room Number *</label>
                <input type="text" name="roomNumber" class="form-input" value="${classroom.roomNumber}" required>
            </div>
            <div class="form-group">
                <label>Building *</label>
                <input type="text" name="building" class="form-input" value="${classroom.building}" required>
            </div>
            <div class="form-group">
                <label>Capacity *</label>
                <input type="number" name="capacity" class="form-input" value="${classroom.capacity}" required>
            </div>
            <div class="form-group">
                <label>WiFi BSSIDs</label>
                <div id="bssidContainer">
                    ${bssids.map((bssid, index) => `
                        <div class="bssid-input-group" style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" name="wifiBSSID_${index}" class="form-input" value="${bssid || ''}" placeholder="XX:XX:XX:XX:XX:XX" style="flex: 1;">
                            ${index > 0 ? `<button type="button" class="btn btn-secondary" onclick="removeBSSIDField(this)" style="padding: 8px 12px;">🗑️</button>` : ''}
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-secondary" onclick="addBSSIDField()" style="margin-top: 8px; width: 100%;">➕ More BSSID</button>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" name="isActive" ${classroom.isActive ? 'checked' : ''}> Active
                </label>
            </div>
            <button type="submit" class="btn btn-primary">Update Classroom</button>
        </form>
    `;

    document.getElementById('editClassroomForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        // Collect all BSSID inputs
        const wifiBSSIDs = [];
        let index = 0;
        while (formData.has(`wifiBSSID_${index}`)) {
            const bssid = formData.get(`wifiBSSID_${index}`).trim();
            if (bssid) {
                wifiBSSIDs.push(bssid);
            }
            index++;
        }

        const classroomData = {
            roomNumber: formData.get('roomNumber'),
            building: formData.get('building'),
            capacity: formData.get('capacity'),
            wifiBSSIDs: wifiBSSIDs,
            isActive: formData.has('isActive')
        };

        try {
            const response = await fetch(`${SERVER_URL}/api/classrooms/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(classroomData)
            });

            if (response.ok) {
                showNotification('Classroom updated successfully', 'success');
                closeModal();
                loadClassrooms();
            } else {
                showNotification('Failed to update classroom', 'error');
            }
        } catch (error) {
            showNotification('Error: ' + error.message, 'error');
        }
    });

    openModal();
}


// ==================== ADVANCED FEATURES ====================

// Export to CSV
function exportStudentsToCSV() {
    if (students.length === 0) {
        showNotification('No students to export', 'warning');
        return;
    }

    // Complete student fields for better export
    const headers = [
        'Enrollment No',
        'Name',
        'Email',
        'Course',
        'Semester',
        'Date of Birth',
        'Phone',
        'Photo URL',
        'Created At'
    ];

    const rows = students.map(s => [
        s.enrollmentNo || '',
        s.name || '',
        s.email || '',
        s.course || '',
        s.semester || '',
        s.dob ? new Date(s.dob).toISOString().split('T')[0] : '', // Format date as YYYY-MM-DD
        s.phone || '',
        s.photoUrl || '',
        s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    downloadCSV(csvContent, 'students_export.csv');
    showNotification('Students exported successfully', 'success');
}

function exportTeachersToCSV() {
    if (teachers.length === 0) {
        showNotification('No teachers to export', 'warning');
        return;
    }

    // Complete teacher fields based on MongoDB schema
    const headers = [
        'Employee ID',
        'Name',
        'Email',
        'Department',
        'Subject',
        'Date of Birth',
        'Phone',
        'Photo URL',
        'Semester',
        'Can Edit Timetable',
        'Created At'
    ];

    const rows = teachers.map(t => [
        t.employeeId || '',
        t.name || '',
        t.email || '',
        t.department || '',
        t.subject || '',
        t.dob ? new Date(t.dob).toISOString().split('T')[0] : '', // Format date as YYYY-MM-DD
        t.phone || '',
        t.photoUrl || '',
        t.semester || '',
        t.canEditTimetable ? 'Yes' : 'No',
        t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    downloadCSV(csvContent, 'teachers_export.csv');
    showNotification('Teachers exported successfully', 'success');
}

function exportClassroomsToCSV() {
    if (classrooms.length === 0) {
        showNotification('No classrooms to export', 'warning');
        return;
    }

    // Complete classroom fields for better export
    const headers = [
        'Room Number',
        'Building',
        'Capacity',
        'WiFi BSSID',
        'Active Status',
        'Created At'
    ];

    const rows = classrooms.map(c => [
        c.roomNumber || '',
        c.building || '',
        c.capacity || '',
        (c.wifiBSSIDs && c.wifiBSSIDs.length > 0) ? c.wifiBSSIDs.join('; ') : '',
        c.isActive ? 'Yes' : 'No',
        c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    downloadCSV(csvContent, 'classrooms_export.csv');
    showNotification('Classrooms exported successfully', 'success');
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Better Notifications
let notificationTimeout;
function showNotification(message, type = 'info') {
    // Clear existing notification
    const existing = document.getElementById('notification');
    if (existing) existing.remove();

    // Create notification
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${getNotificationIcon(type)}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="closeNotification()">✕</button>
    `;

    document.body.appendChild(notification);

    // Auto-hide after 5 seconds
    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        closeNotification();
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    return icons[type] || icons.info;
}

function closeNotification() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.classList.add('notification-hide');
        setTimeout(() => notification.remove(), 300);
    }
}

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S - Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const activeSection = document.querySelector('.section.active');
        if (activeSection.id === 'timetable-section' && currentTimetable) {
            saveTimetable();
        }
    }

    // Escape - Close modal
    if (e.key === 'Escape') {
        closeModal();
        closeNotification();
    }

    // Ctrl+F or Cmd+F - Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('globalSearch').focus();
    }
});

// Global Search
const _globalSearch = document.getElementById('globalSearch');
if (_globalSearch) _globalSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (!query) return;

    // Search in current section
    const activeSection = document.querySelector('.section.active');
    if (activeSection.id === 'students-section') {
        document.getElementById('studentSearch').value = query;
        filterStudents();
    } else if (activeSection.id === 'teachers-section') {
        document.getElementById('teacherSearch').value = query;
        filterTeachers();
    }
});

// Add export buttons to sections
function addExportButtons() {
    // Students section
    const studentsActions = document.querySelector('#students-section .action-buttons');
    if (studentsActions && !document.getElementById('exportStudentsBtn')) {
        const exportBtn = document.createElement('button');
        exportBtn.id = 'exportStudentsBtn';
        exportBtn.className = 'btn btn-secondary';
        exportBtn.innerHTML = '📥 Export CSV';
        exportBtn.onclick = exportStudentsToCSV;
        studentsActions.insertBefore(exportBtn, studentsActions.firstChild);
    }

    // Teachers section
    const teachersActions = document.querySelector('#teachers-section .action-buttons');
    if (teachersActions && !document.getElementById('exportTeachersBtn')) {
        const exportBtn = document.createElement('button');
        exportBtn.id = 'exportTeachersBtn';
        exportBtn.className = 'btn btn-secondary';
        exportBtn.innerHTML = '📥 Export CSV';
        exportBtn.onclick = exportTeachersToCSV;
        teachersActions.insertBefore(exportBtn, teachersActions.firstChild);
    }

    // Classrooms section
    const classroomsActions = document.querySelector('#classrooms-section .action-buttons');
    if (classroomsActions && !document.getElementById('exportClassroomsBtn')) {
        const exportBtn = document.createElement('button');
        exportBtn.id = 'exportClassroomsBtn';
        exportBtn.className = 'btn btn-secondary';
        exportBtn.innerHTML = '📥 Export CSV';
        exportBtn.onclick = exportClassroomsToCSV;
        classroomsActions.insertBefore(exportBtn, classroomsActions.firstChild);
    }
}

// Initialize export buttons after DOM is ready
setTimeout(addExportButtons, 100);

// Confirmation Dialog
function confirmAction(message, onConfirm) {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>Confirm Action</h2>
        <p style="margin: 20px 0; font-size: 16px;">${message}</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-danger" id="confirmBtn">Confirm</button>
        </div>
    `;

    document.getElementById('confirmBtn').onclick = () => {
        closeModal();
        onConfirm();
    };

    openModal();
}

// Update delete functions to use confirmation dialog
const originalDeleteStudent = deleteStudent;
deleteStudent = function (id) {
    const student = students.find(s => s._id === id);
    confirmAction(
        `Are you sure you want to delete student "${student?.name}"? This action cannot be undone.`,
        () => originalDeleteStudent(id)
    );
};

const originalDeleteTeacher = deleteTeacher;
deleteTeacher = function (id) {
    const teacher = teachers.find(t => t._id === id);
    confirmAction(
        `Are you sure you want to delete teacher "${teacher?.name}"? This action cannot be undone.`,
        () => originalDeleteTeacher(id)
    );
};

const originalDeleteClassroom = deleteClassroom;
deleteClassroom = function (id) {
    const classroom = classrooms.find(c => c._id === id);
    confirmAction(
        `Are you sure you want to delete classroom "${classroom?.roomNumber}"? This action cannot be undone.`,
        () => originalDeleteClassroom(id)
    );
};

// Print Timetable
function printTimetable() {
    if (!currentTimetable) {
        showNotification('No timetable loaded', 'warning');
        return;
    }

    const printWindow = window.open('', '_blank');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    let html = `
        <html>
        <head>
            <title>Timetable - ${currentTimetable.branch} Semester ${currentTimetable.semester}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 10px; text-align: center; }
                th { background: #f0f0f0; }
                .break { background: #ffe0b2; }
                @media print { button { display: none; } }
            </style>
        </head>
        <body>
            <h1>Timetable - ${currentTimetable.branch} Semester ${currentTimetable.semester}</h1>
            <button onclick="window.print()">Print</button>
            <table>
                <thead>
                    <tr>
                        <th>Day/Period</th>
                        ${currentTimetable.periods.map(p => `<th>P${p.number}<br>${p.startTime}-${p.endTime}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${days.map((day, dayIdx) => `
                        <tr>
                            <th>${day}</th>
                            ${currentTimetable.timetable[dayKeys[dayIdx]].map(period => `
                                <td class="${period.isBreak ? 'break' : ''}">
                                    ${period.isBreak ? 'Break' : `${period.subject || '-'}<br><small>${period.room || ''}</small>`}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}

// Add print button to timetable section
function addPrintButton() {
    const timetableActions = document.querySelector('#timetable-section .action-buttons');
    if (timetableActions && !document.getElementById('printTimetableBtn')) {
        const printBtn = document.createElement('button');
        printBtn.id = 'printTimetableBtn';
        printBtn.className = 'btn btn-secondary';
        printBtn.innerHTML = '🖨️ Print';
        printBtn.onclick = printTimetable;
        timetableActions.appendChild(printBtn);
    }
}

setTimeout(addPrintButton, 100);

console.log('✅ All features loaded successfully!');


// Student Attendance Report
async function showStudentAttendance(studentId, studentName) {
    const modal = document.getElementById('attendanceModal');
    const modalBody = document.getElementById('attendanceModalBody');

    modalBody.innerHTML = '<div class="loading">Loading attendance data...</div>';
    modal.classList.add('active');

    try {
        // Fetch student details
        const studentRes = await fetch(`${SERVER_URL}/api/student-management?enrollmentNo=${studentId}`);
        const studentData = await studentRes.json();
        const student = studentData.student;

        // Fetch attendance records
        const attendanceRes = await fetch(`${SERVER_URL}/api/attendance/records?studentId=${studentId}`);
        const attendanceData = await attendanceRes.json();
        const records = attendanceData.records || [];

        // Separate by status
        const presentDays = records.filter(r => r.status === 'present');
        const absentDays = records.filter(r => r.status === 'absent');
        const leaveDays = records.filter(r => r.status === 'leave');

        // Calculate attendance rate (excluding leave days)
        const classDays = presentDays.length + absentDays.length;
        const attendanceRate = classDays > 0 ? ((presentDays.length / classDays) * 100).toFixed(1) : 0;

        // Calculate total minutes
        const totalMinutesAttended = records.reduce((sum, r) => sum + (r.totalAttended || 0), 0);
        const totalClassMinutes = records.reduce((sum, r) => sum + (r.totalClassTime || 0), 0);
        const minutePercentage = totalClassMinutes > 0 ? ((totalMinutesAttended / totalClassMinutes) * 100).toFixed(1) : 0;

        // Get date range
        const dates = records.map(r => new Date(r.date)).sort((a, b) => a - b);
        const startDate = dates[0] ? dates[0].toLocaleDateString() : 'N/A';
        const endDate = dates[dates.length - 1] ? dates[dates.length - 1].toLocaleDateString() : 'N/A';

        // Render report
        let html = `
            <div class="attendance-report">
                <div class="report-header">
                    <h2>📊 Detailed Attendance Report</h2>
                    <button class="btn btn-secondary" onclick="exportAttendanceReport('${studentId}')">📥 Export</button>
                </div>
                
                <div class="student-info-card">
                    <h3>${studentName}</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Enrollment No:</span>
                            <span class="info-value">${studentId}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Course:</span>
                            <span class="info-value">${student?.course || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Semester:</span>
                            <span class="info-value">${student?.semester || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${student?.email || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="stats-row">
                    <div class="stat-box stat-total">
                        <div class="stat-number">${records.length}</div>
                        <div class="stat-label">Total Days</div>
                    </div>
                    <div class="stat-box stat-present">
                        <div class="stat-number">${presentDays.length}</div>
                        <div class="stat-label">Present</div>
                    </div>
                    <div class="stat-box stat-absent">
                        <div class="stat-number">${absentDays.length}</div>
                        <div class="stat-label">Absent</div>
                    </div>
                    <div class="stat-box stat-leave">
                        <div class="stat-number">${leaveDays.length}</div>
                        <div class="stat-label">Leave</div>
                    </div>
                </div>
                
                <div class="stats-row">
                    <div class="stat-box stat-rate">
                        <div class="stat-number">${attendanceRate}%</div>
                        <div class="stat-label">Attendance Rate</div>
                        <div class="stat-sublabel">${presentDays.length}/${classDays} class days</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">${Math.floor(totalMinutesAttended / 60)}h ${totalMinutesAttended % 60}m</div>
                        <div class="stat-label">Total Time Attended</div>
                        <div class="stat-sublabel">${minutePercentage}% of class time</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">${startDate}</div>
                        <div class="stat-label">Start Date</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">${endDate}</div>
                        <div class="stat-label">End Date</div>
                    </div>
                </div>
                
                <div class="attendance-table-container">
                    <h3>📅 Detailed Daily Records</h3>
                    <table class="attendance-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Day</th>
                                <th>Status</th>
                                <th>Attended</th>
                                <th>Total</th>
                                <th>%</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => {
            const date = new Date(record.date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dateStr = date.toLocaleDateString();

            let statusClass = 'status-absent';
            let statusText = record.status;
            if (record.status === 'present') statusClass = 'status-present';
            if (record.status === 'leave') statusClass = 'status-leave';

            const attended = record.totalAttended || 0;
            const total = record.totalClassTime || 0;
            const percentage = record.dayPercentage || 0;

            const lectureCount = record.lectures ? record.lectures.length : 0;
            const presentLectures = record.lectures ? record.lectures.filter(l => l.present).length : 0;

            return `
                                    <tr onclick="showDayDetails('${record._id || record.studentId + '_' + dateStr}')" style="cursor: pointer;" title="Click for lecture-wise details">
                                        <td>${dateStr}</td>
                                        <td>${dayName}</td>
                                        <td><span class="status-badge ${statusClass}">${statusText.toUpperCase()}</span></td>
                                        <td>${attended} min</td>
                                        <td>${total} min</td>
                                        <td><strong>${percentage}%</strong></td>
                                        <td>${record.status === 'leave' ? '🏖️ No Classes' : `${presentLectures}/${lectureCount} lectures`}</td>
                                    </tr>
                                    ${record.lectures && record.lectures.length > 0 ? `
                                    <tr class="lecture-details-row" id="details_${record._id || record.studentId + '_' + dateStr}" style="display: none;">
                                        <td colspan="7">
                                            <div class="lecture-breakdown">
                                                <h4>📚 Lecture-wise Breakdown:</h4>
                                                <table class="lecture-table">
                                                    <thead>
                                                        <tr>
                                                            <th>#</th>
                                                            <th>Subject</th>
                                                            <th>Time</th>
                                                            <th>Room</th>
                                                            <th>Attended</th>
                                                            <th>Total</th>
                                                            <th>%</th>
                                                            <th>Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${record.lectures.map((lec, idx) => `
                                                        <tr>
                                                            <td>${idx + 1}</td>
                                                            <td><strong>${lec.subject}</strong></td>
                                                            <td>${lec.startTime}-${lec.endTime}</td>
                                                            <td>${lec.room}</td>
                                                            <td>${lec.attended} min</td>
                                                            <td>${lec.total} min</td>
                                                            <td><strong>${lec.percentage}%</strong></td>
                                                            <td><span class="status-badge ${lec.present ? 'status-present' : 'status-absent'}">${lec.present ? '✓ Present' : '✗ Absent'}</span></td>
                                                        </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                    ` : ''}
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        modalBody.innerHTML = html;

    } catch (error) {
        console.error('Error loading attendance:', error);
        modalBody.innerHTML = '<div class="error-state">Error loading attendance data</div>';
    }
}

function closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('active');
}

function showDayDetails(recordId) {
    const detailsRow = document.getElementById(`details_${recordId}`);
    if (detailsRow) {
        if (detailsRow.style.display === 'none') {
            detailsRow.style.display = 'table-row';
        } else {
            detailsRow.style.display = 'none';
        }
    }
}

function exportAttendanceReport(studentId) {
    // Find student data
    const student = students.find(s => s.enrollmentNo === studentId);
    if (!student) {
        showNotification('Student not found', 'error');
        return;
    }

    // Create detailed attendance report
    const headers = [
        'Student ID',
        'Student Name',
        'Date',
        'Subject',
        'Period',
        'Status',
        'Verification Method',
        'WiFi Status',
        'Timestamp',
        'Teacher',
        'Classroom'
    ];

    // Mock data - replace with actual attendance data from server
    const attendanceData = [
        [
            student.enrollmentNo,
            student.name,
            new Date().toISOString().split('T')[0],
            'Data Structures',
            '1',
            'Present',
            'Face Verification',
            'Connected',
            new Date().toISOString(),
            'Dr. Smith',
            'Room 101'
        ]
    ];

    const csvContent = [
        headers.join(','),
        ...attendanceData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    downloadCSV(csvContent, `attendance_report_${studentId}_${new Date().toISOString().split('T')[0]}.csv`);
    showNotification('Attendance report exported successfully', 'success');
}


// Advanced Timetable Features

// Keyboard Shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    undo();
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
                case 'c':
                    if (selectedCells.length > 0) {
                        e.preventDefault();
                        copySelected();
                    }
                    break;
                case 'v':
                    if (selectedCells.length > 0 && clipboardData) {
                        e.preventDefault();
                        pasteToSelected();
                    }
                    break;
                case 'x':
                    if (selectedCells.length > 0) {
                        e.preventDefault();
                        cutSelected();
                    }
                    break;
                case 's':
                    e.preventDefault();
                    saveTimetable();
                    break;
            }
        }

        if (e.key === 'Delete' && selectedCells.length > 0) {
            e.preventDefault();
            deleteSelectedCells();
        }

        if (e.key === 'Escape') {
            clearSelection();
        }
    });
}

function deleteSelectedCells() {
    saveToHistory();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    selectedCells.forEach(({ dayIdx, periodIdx }) => {
        const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
        if (!period.isBreak) {
            period.subject = '';
            period.teacher = '';
            period.room = '';
            period.color = '';
        }
    });

    renderAdvancedTimetableEditor(currentTimetable);
    showNotification('Deleted selected cells', 'success');
    triggerAutoSave();
}

// Subject Manager
function showSubjectManager() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📖 Subject Manager</h2>
        <p>Manage common subjects for quick access</p>
        <div class="subject-list">
            <div class="subject-item">Mathematics <button onclick="applySubjectToSelected('Mathematics')">Apply</button></div>
            <div class="subject-item">Physics <button onclick="applySubjectToSelected('Physics')">Apply</button></div>
            <div class="subject-item">Chemistry <button onclick="applySubjectToSelected('Chemistry')">Apply</button></div>
            <div class="subject-item">Programming <button onclick="applySubjectToSelected('Programming')">Apply</button></div>
            <div class="subject-item">Data Structures <button onclick="applySubjectToSelected('Data Structures')">Apply</button></div>
            <div class="subject-item">DBMS <button onclick="applySubjectToSelected('DBMS')">Apply</button></div>
            <div class="subject-item">Operating Systems <button onclick="applySubjectToSelected('Operating Systems')">Apply</button></div>
            <div class="subject-item">Computer Networks <button onclick="applySubjectToSelected('Computer Networks')">Apply</button></div>
        </div>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    `;
    openModal();
}

function applySubjectToSelected(subject) {
    if (selectedCells.length === 0) {
        showNotification('Select cells first', 'warning');
        return;
    }

    saveToHistory();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    selectedCells.forEach(({ dayIdx, periodIdx }) => {
        const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
        if (!period.isBreak) {
            period.subject = subject;
        }
    });

    closeModal();
    renderAdvancedTimetableEditor(currentTimetable);
    showNotification(`Applied "${subject}" to ${selectedCells.length} cell(s)`, 'success');
    triggerAutoSave();
}

// Teacher Assignment
function showTeacherAssign() {
    if (selectedCells.length === 0) {
        showNotification('Select cells first', 'warning');
        return;
    }

    // Generate teacher options
    const teacherOptions = teachers.map(t =>
        `<option value="${t.name}">${t.name} (${t.employeeId}) - ${t.department}</option>`
    ).join('');

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>👨‍🏫 Assign Teacher</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Assigning to ${selectedCells.length} selected cell(s)
        </p>
        <form id="teacherForm">
            <div class="form-group">
                <label>Select Teacher:</label>
                <select name="teacher" class="form-select" required>
                    <option value="">-- Select Teacher --</option>
                    ${teacherOptions}
                </select>
                <small style="color: var(--text-secondary); font-size: 12px; display: block; margin-top: 8px;">
                    Only registered teachers from the database can be assigned
                </small>
            </div>
            ${teachers.length === 0 ? `
                <div style="padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; margin-bottom: 16px;">
                    <strong>⚠️ No teachers found!</strong><br>
                    Please add teachers in the Teachers section first.
                </div>
            ` : ''}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary" ${teachers.length === 0 ? 'disabled' : ''}>Assign to Selected</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('teacherForm').addEventListener('submit', (e) => {
        e.preventDefault();

        saveToHistory();
        const formData = new FormData(e.target);
        const teacher = formData.get('teacher');

        if (!teacher) {
            showNotification('Please select a teacher', 'warning');
            return;
        }

        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        selectedCells.forEach(({ dayIdx, periodIdx }) => {
            const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
            if (!period.isBreak) {
                period.teacher = teacher;
            }
        });

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification(`Assigned "${teacher}" to ${selectedCells.length} cell(s)`, 'success');
        triggerAutoSave();
    });

    openModal();
}

// Color Picker
function showColorPicker() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>🎨 Color Code Subjects</h2>
        <p>Select a color for selected cells:</p>
        <div class="color-palette">
            <div class="color-option" style="background: #ffebee" onclick="applyColorToSelected('#ffebee')"></div>
            <div class="color-option" style="background: #e3f2fd" onclick="applyColorToSelected('#e3f2fd')"></div>
            <div class="color-option" style="background: #e8f5e9" onclick="applyColorToSelected('#e8f5e9')"></div>
            <div class="color-option" style="background: #fff3e0" onclick="applyColorToSelected('#fff3e0')"></div>
            <div class="color-option" style="background: #f3e5f5" onclick="applyColorToSelected('#f3e5f5')"></div>
            <div class="color-option" style="background: #e0f2f1" onclick="applyColorToSelected('#e0f2f1')"></div>
            <div class="color-option" style="background: #fce4ec" onclick="applyColorToSelected('#fce4ec')"></div>
            <div class="color-option" style="background: #fff9c4" onclick="applyColorToSelected('#fff9c4')"></div>
        </div>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    `;
    openModal();
}

function applyColorToSelected(color) {
    if (selectedCells.length === 0) {
        showNotification('Select cells first', 'warning');
        return;
    }

    saveToHistory();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    selectedCells.forEach(({ dayIdx, periodIdx }) => {
        const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];
        if (!period.isBreak) {
            period.color = color;
        }
    });

    closeModal();
    renderAdvancedTimetableEditor(currentTimetable);
    showNotification('Color applied', 'success');
    triggerAutoSave();
}

// View Toggles

function toggleTeacherView() {
    showTeachers = !showTeachers;
    renderAdvancedTimetableEditor(currentTimetable);
    showNotification(`Teachers ${showTeachers ? 'shown' : 'hidden'}`, 'info');
}

function toggleRoomView() {
    showRooms = !showRooms;
    renderAdvancedTimetableEditor(currentTimetable);
    showNotification(`Rooms ${showRooms ? 'shown' : 'hidden'}`, 'info');
}

function toggleCompactView() {
    compactView = !compactView;
    document.querySelector('.timetable-grid-advanced').classList.toggle('compact-mode');
    showNotification(`Compact mode ${compactView ? 'enabled' : 'disabled'}`, 'info');
}

// Export Functions
function exportToPDF() {
    showNotification('PDF export feature coming soon!', 'info');
    // TODO: Implement PDF export using jsPDF
}

function exportToExcel() {
    showNotification('Excel export feature coming soon!', 'info');
    // TODO: Implement Excel export
}

function showImportDialog() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📥 Import Timetable</h2>
        <p>Upload a JSON file to import timetable</p>
        <input type="file" id="importFile" accept=".json">
        <div class="form-actions">
            <button class="btn btn-primary" onclick="importTimetableFile()">Import</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `;
    openModal();
}

function importTimetableFile() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];

    if (!file) {
        showNotification('Select a file first', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            saveToHistory();
            currentTimetable = imported;
            closeModal();
            renderAdvancedTimetableEditor(currentTimetable);
            showNotification('Timetable imported successfully', 'success');
        } catch (error) {
            showNotification('Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
}

// Template Functions
function showTemplateDialog() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>💾 Save as Template</h2>
        <form id="templateForm">
            <div class="form-group">
                <label>Template Name:</label>
                <input type="text" name="templateName" class="form-input" placeholder="e.g., CSE Standard Template">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save Template</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('templateForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const templateName = formData.get('templateName');

        // Save to localStorage
        const templates = JSON.parse(localStorage.getItem('timetableTemplates') || '[]');
        templates.push({
            name: templateName,
            data: currentTimetable,
            created: new Date().toISOString()
        });
        localStorage.setItem('timetableTemplates', JSON.stringify(templates));

        closeModal();
        showNotification('Template saved successfully', 'success');
    });

    openModal();
}

function duplicateTimetable() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📑 Duplicate Timetable</h2>
        <form id="duplicateForm">
            <div class="form-group">
                <label>Target Semester:</label>
                <select name="semester" class="form-select">
                    <option value="">Select Semester</option>
                    ${generateSemesterOptions()}
                </select>
            </div>
            <div class="form-group">
                <label>Target Course:</label>
                <select name="course" class="form-select">
                    <option value="">Select Branch</option>
                    ${generateBranchOptions()}
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Duplicate</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('duplicateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newTimetable = JSON.parse(JSON.stringify(currentTimetable));
        newTimetable.semester = formData.get('semester');
        newTimetable.branch = formData.get('course');

        try {
            const response = await fetch(`${SERVER_URL}/api/timetable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTimetable)
            });

            if (response.ok) {
                closeModal();
                showNotification('Timetable duplicated successfully', 'success');
            } else {
                showNotification('Failed to duplicate timetable', 'error');
            }
        } catch (error) {
            showNotification('Error: ' + error.message, 'error');
        }
    });

    openModal();
}

// Conflict Check
function showConflictCheck() {
    const conflicts = [];
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Check for teacher conflicts (same teacher, same time, different days)
    const teacherSchedule = {};

    dayKeys.forEach((dayKey, dayIdx) => {
        currentTimetable.timetable[dayKey].forEach((period, periodIdx) => {
            if (period.teacher && !period.isBreak) {
                const key = `${period.teacher}-${periodIdx}`;
                if (!teacherSchedule[key]) {
                    teacherSchedule[key] = [];
                }
                teacherSchedule[key].push({ day: days[dayIdx], period: periodIdx + 1, subject: period.subject });
            }
        });
    });

    // Find conflicts
    Object.keys(teacherSchedule).forEach(key => {
        if (teacherSchedule[key].length > 1) {
            const [teacher, period] = key.split('-');
            conflicts.push({
                type: 'Teacher Conflict',
                teacher: teacher,
                details: teacherSchedule[key]
            });
        }
    });

    const modalBody = document.getElementById('modalBody');
    if (conflicts.length === 0) {
        modalBody.innerHTML = `
            <h2>✓ No Conflicts Found</h2>
            <p>Your timetable looks good!</p>
            <button class="btn btn-primary" onclick="closeModal()">Close</button>
        `;
    } else {
        let html = `<h2>⚠️ Conflicts Found</h2>`;
        html += `<p>Found ${conflicts.length} conflict(s):</p>`;
        html += '<div class="conflict-list">';
        conflicts.forEach(conflict => {
            html += `<div class="conflict-item">`;
            html += `<strong>${conflict.type}:</strong> ${conflict.teacher}<br>`;
            conflict.details.forEach(d => {
                html += `${d.day} Period ${d.period} - ${d.subject}<br>`;
            });
            html += `</div>`;
        });
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="closeModal()">Close</button>';
        modalBody.innerHTML = html;
    }

    openModal();
}

// Auto Fill
function autoFillTimetable() {
    if (!currentTimetable) {
        showNotification('No timetable loaded', 'error');
        return;
    }

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>🤖 Auto Fill Timetable</h2>
        <p>Automatically fill empty periods with subjects</p>
        <form id="autoFillForm">
            <div class="form-group">
                <label>Fill Mode:</label>
                <select name="mode" class="form-select" required>
                    <option value="repeat">Repeat Pattern (Mon → Other Days)</option>
                    <option value="subjects">Fill with Subject List</option>
                    <option value="random">Random Distribution</option>
                </select>
            </div>
            
            <div class="form-group" id="subjectListGroup" style="display: none;">
                <label>Subjects (one per line):</label>
                <textarea name="subjects" class="form-input" rows="6" placeholder="Mathematics&#10;Physics&#10;Chemistry&#10;English&#10;Computer Science"></textarea>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" name="skipBreaks" checked>
                    Skip break periods
                </label>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" name="overwrite">
                    Overwrite existing entries
                </label>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Auto Fill</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    // Show/hide subject list based on mode
    document.querySelector('select[name="mode"]').addEventListener('change', (e) => {
        document.getElementById('subjectListGroup').style.display =
            e.target.value === 'subjects' ? 'block' : 'none';
    });

    document.getElementById('autoFillForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveToHistory();

        const formData = new FormData(e.target);
        const mode = formData.get('mode');
        const skipBreaks = formData.get('skipBreaks') === 'on';
        const overwrite = formData.get('overwrite') === 'on';
        const subjectList = formData.get('subjects')?.split('\n').filter(s => s.trim()) || [];

        const dayKeys = Object.keys(currentTimetable.timetable);
        let filledCount = 0;

        if (mode === 'repeat') {
            // Copy Monday's schedule to other days
            const mondaySchedule = currentTimetable.timetable['monday'] || currentTimetable.timetable[dayKeys[0]];
            if (!mondaySchedule) {
                showNotification('No source day found to copy from', 'error');
                return;
            }

            dayKeys.forEach(day => {
                if (day === 'monday' || day === dayKeys[0]) return;

                currentTimetable.timetable[day].forEach((period, idx) => {
                    if (skipBreaks && period.isBreak) return;
                    if (!overwrite && period.subject) return;

                    const sourcePeriod = mondaySchedule[idx];
                    if (sourcePeriod && !sourcePeriod.isBreak) {
                        period.subject = sourcePeriod.subject;
                        period.teacher = sourcePeriod.teacher;
                        period.room = sourcePeriod.room;
                        period.color = sourcePeriod.color;
                        filledCount++;
                    }
                });
            });
        } else if (mode === 'subjects') {
            if (subjectList.length === 0) {
                showNotification('Please enter at least one subject', 'error');
                return;
            }

            let subjectIndex = 0;
            dayKeys.forEach(day => {
                currentTimetable.timetable[day].forEach(period => {
                    if (skipBreaks && period.isBreak) return;
                    if (!overwrite && period.subject) return;

                    period.subject = subjectList[subjectIndex % subjectList.length];
                    period.teacher = '';
                    period.room = '';
                    subjectIndex++;
                    filledCount++;
                });
            });
        } else if (mode === 'random') {
            // Fetch subjects from database for random fill
            fetch(`${SERVER_URL}/api/subjects?semester=${currentTimetable.semester}&branch=${encodeURIComponent(currentTimetable.branch)}`)
                .then(response => response.json())
                .then(data => {
                    const subjects = data.subjects || [];
                    if (!subjects || subjects.length === 0) {
                        showNotification('No subjects found for this semester and branch', 'error');
                        return;
                    }

                    const subjectNames = subjects.map(s => s.subjectName);

                    dayKeys.forEach(day => {
                        currentTimetable.timetable[day].forEach(period => {
                            if (skipBreaks && period.isBreak) return;
                            if (!overwrite && period.subject) return;

                            period.subject = subjectNames[Math.floor(Math.random() * subjectNames.length)];
                            period.teacher = '';
                            period.room = '';
                            filledCount++;
                        });
                    });

                    closeModal();
                    renderAdvancedTimetableEditor(currentTimetable);
                    showNotification(`Auto-filled ${filledCount} periods successfully!`, 'success');
                    triggerAutoSave();
                })
                .catch(error => {
                    console.error('Error fetching subjects:', error);
                    showNotification('Failed to fetch subjects from database', 'error');
                });
            return; // Exit early since we're handling async
        }

        closeModal();
        renderAdvancedTimetableEditor(currentTimetable);
        showNotification(`Auto-filled ${filledCount} periods successfully!`, 'success');
        triggerAutoSave();
    });

    openModal();
}

// Validate
async function validateTimetable() {
    let issues = [];
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Check for empty cells
    dayKeys.forEach(dayKey => {
        currentTimetable.timetable[dayKey].forEach((period, idx) => {
            if (!period.isBreak && !period.subject) {
                issues.push(`Empty cell found in ${dayKey} period ${idx + 1}`);
            }
        });
    });

    // Check for teacher conflicts across all timetables
    showNotification('Checking for teacher conflicts...', 'info');

    try {
        const response = await fetch(`${SERVER_URL}/api/timetables`);
        if (response.ok) {
            const data = await response.json();
            const allTimetables = data.timetables || [];

            // Check each period in current timetable
            for (const day of dayKeys) {
                const periods = currentTimetable.timetable[day];
                for (let i = 0; i < periods.length; i++) {
                    const period = periods[i];
                    if (period.isBreak || !period.teacher) continue;

                    const periodNumber = currentTimetable.periods[i].number;

                    // Check against all other timetables
                    for (const otherTimetable of allTimetables) {
                        // Skip current timetable
                        if (otherTimetable.branch === currentTimetable.branch &&
                            otherTimetable.semester === currentTimetable.semester) {
                            continue;
                        }

                        if (!otherTimetable.timetable || !otherTimetable.timetable[day]) continue;

                        const otherPeriods = otherTimetable.timetable[day];
                        for (let j = 0; j < otherPeriods.length; j++) {
                            const otherPeriod = otherPeriods[j];
                            const otherPeriodNum = otherTimetable.periods && otherTimetable.periods[j]
                                ? otherTimetable.periods[j].number
                                : j + 1;

                            // Check for conflict: same teacher, same time, different room
                            if (otherPeriod.teacher === period.teacher &&
                                otherPeriodNum === periodNumber &&
                                !otherPeriod.isBreak &&
                                otherPeriod.room !== period.room) {

                                issues.push(
                                    `Teacher conflict: ${period.teacher} assigned to ` +
                                    `${day} P${periodNumber} in both ` +
                                    `${currentTimetable.branch} (Room ${period.room}) and ` +
                                    `${otherTimetable.branch} (Room ${otherPeriod.room})`
                                );
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking conflicts:', error);
        issues.push('Could not check for teacher conflicts (network error)');
    }

    // Show results
    if (issues.length === 0) {
        showNotification('✓ Timetable is valid! No conflicts found.', 'success');
    } else {
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <h2>⚠️ Validation Issues (${issues.length})</h2>
            <div style="max-height: 400px; overflow-y: auto;">
                <ul style="color: var(--text-primary); line-height: 1.8;">
                    ${issues.map(issue => `<li>${issue}</li>`).join('')}
                </ul>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-primary" onclick="closeModal()">Close</button>
            </div>
        `;
        openModal();
    }
}

// Print
function printTimetable() {
    window.print();
}

// Share
function shareTimetable() {
    const url = `${window.location.origin}/timetable/${currentTimetable.branch}/${currentTimetable.semester}`;
    navigator.clipboard.writeText(url);
    showNotification('Link copied to clipboard!', 'success');
}

// Context Menu
function showCellContextMenu(event, dayIdx, periodIdx) {
    event.preventDefault();

    // Remove existing context menu
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    // Check if current period is a break
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayKeys[dayIdx];
    const period = currentTimetable?.timetable?.[dayKey]?.[periodIdx];
    const isBreak = period?.isBreak || false;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.innerHTML = `
        <div class="context-menu-item" onclick="editAdvancedCell(${dayIdx}, ${periodIdx}); closeContextMenu()">✏️ Edit</div>
        <div class="context-menu-item" onclick="toggleBreakPeriod(event, ${dayIdx}, ${periodIdx}); closeContextMenu()">${isBreak ? '📚 Mark as Regular' : '🔔 Mark as Break'}</div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="copySingleCell(${dayIdx}, ${periodIdx}); closeContextMenu()">📄 Copy</div>
        <div class="context-menu-item" onclick="pasteSingleCell(${dayIdx}, ${periodIdx}); closeContextMenu()">📋 Paste</div>
        <div class="context-menu-item" onclick="clearSingleCell(${dayIdx}, ${periodIdx}); closeContextMenu()">🗑️ Clear</div>
    `;

    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 100);
}

function closeContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) menu.remove();
    document.removeEventListener('click', closeContextMenu);
}

function copySingleCell(dayIdx, periodIdx) {
    selectedCells = [{ cellId: `cell-${dayIdx}-${periodIdx}`, dayIdx, periodIdx }];
    copySelected();
}

function pasteSingleCell(dayIdx, periodIdx) {
    selectedCells = [{ cellId: `cell-${dayIdx}-${periodIdx}`, dayIdx, periodIdx }];
    pasteToSelected();
}

function clearSingleCell(dayIdx, periodIdx) {
    saveToHistory();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const period = currentTimetable.timetable[dayKeys[dayIdx]][periodIdx];

    if (!period.isBreak) {
        period.subject = '';
        period.teacher = '';
        period.room = '';
        period.color = '';
    }

    renderAdvancedTimetableEditor(currentTimetable);
}

// Period Settings Management
function showPeriodSettings() {
    if (!currentTimetable) {
        showNotification('Please load or create a timetable first', 'warning');
        return;
    }

    const modalBody = document.getElementById('modalBody');
    let html = '<h2>⏰ Period Settings</h2>';
    html += '<p style="color: var(--text-secondary); margin-bottom: 20px;">Configure period timings for your college schedule</p>';

    html += '<div class="period-settings-container">';

    // Period list
    html += '<div class="period-list">';
    currentTimetable.periods.forEach((period, index) => {
        const isBreak = currentTimetable.timetable.monday[index]?.isBreak || false;
        html += `
            <div class="period-item" id="period-item-${index}">
                <div class="period-header">
                    <span class="period-label">Period ${period.number}</span>
                    <div class="period-actions">
                        <button class="icon-btn" onclick="editPeriod(${index})" title="Edit">✏️</button>
                        <button class="icon-btn" onclick="deletePeriod(${index})" title="Delete">🗑️</button>
                        <button class="icon-btn" onclick="movePeriodUp(${index})" ${index === 0 ? 'disabled' : ''} title="Move Up">⬆️</button>
                        <button class="icon-btn" onclick="movePeriodDown(${index})" ${index === currentTimetable.periods.length - 1 ? 'disabled' : ''} title="Move Down">⬇️</button>
                    </div>
                </div>
                <div class="period-details">
                    <span class="time-badge">⏰ ${period.startTime} - ${period.endTime}</span>
                    <span class="duration-badge">⏱️ ${calculateDuration(period.startTime, period.endTime)} min</span>
                    ${isBreak ? '<span class="break-badge">☕ Break</span>' : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';

    // Action buttons
    html += '<div class="period-actions-container" style="margin-top: 20px; display: flex; gap: 10px;">';
    html += '<button class="btn btn-primary" onclick="addNewPeriod()" style="flex: 1;">➕ Add New Period</button>';
    html += '<button class="btn btn-secondary" onclick="saveCurrentPeriodsAsDefault()" style="flex: 1;">💾 Save as Default</button>';
    html += '<button class="btn btn-outline" onclick="resetToDefaultPeriods()" style="flex: 1;">🔄 Reset to Default</button>';
    html += '</div>';

    html += '</div>';

    modalBody.innerHTML = html;
    openModal();
}

function calculateDuration(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes - startMinutes;
}

function editPeriod(index) {
    const period = currentTimetable.periods[index];
    const isBreak = currentTimetable.timetable.monday[index]?.isBreak || false;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>✏️ Edit Period ${period.number}</h2>
        <form id="editPeriodForm">
            <div class="form-group">
                <label>Period Number</label>
                <input type="number" id="periodNumber" class="form-input" value="${period.number}" min="1" required>
            </div>
            <div class="form-group">
                <label>Start Time</label>
                <input type="time" id="startTime" class="form-input" value="${period.startTime}" required>
            </div>
            <div class="form-group">
                <label>End Time</label>
                <input type="time" id="endTime" class="form-input" value="${period.endTime}" required>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="isBreak" ${isBreak ? 'checked' : ''}>
                    Mark as Break Period
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Save Changes</button>
                <button type="button" class="btn btn-secondary" onclick="showPeriodSettings()">❌ Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('editPeriodForm').addEventListener('submit', (e) => {
        e.preventDefault();
        savePeriodEdit(index);
    });
}

function savePeriodEdit(index) {
    const periodNumber = parseInt(document.getElementById('periodNumber').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const isBreak = document.getElementById('isBreak').checked;

    // Validate times
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }

    saveToHistory();

    // Update period timing
    currentTimetable.periods[index] = {
        number: periodNumber,
        startTime,
        endTime
    };

    // Update break status in all days
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayKeys.forEach(day => {
        if (currentTimetable.timetable[day][index]) {
            currentTimetable.timetable[day][index].isBreak = isBreak;
            if (isBreak && !currentTimetable.timetable[day][index].subject.includes('Break')) {
                currentTimetable.timetable[day][index].subject = 'Break';
            }
        }
    });

    showNotification('Period updated successfully', 'success');
    showPeriodSettings();
}

function addNewPeriod() {
    const modalBody = document.getElementById('modalBody');

    // Calculate suggested time based on last period
    const lastPeriod = currentTimetable.periods[currentTimetable.periods.length - 1];
    const suggestedStart = lastPeriod ? lastPeriod.endTime : '09:00';
    const [h, m] = suggestedStart.split(':').map(Number);
    const suggestedEnd = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    modalBody.innerHTML = `
        <h2>➕ Add New Period</h2>
        <form id="addPeriodForm">
            <div class="form-group">
                <label>Period Number</label>
                <input type="number" id="newPeriodNumber" class="form-input" value="${currentTimetable.periods.length + 1}" min="1" required>
            </div>
            <div class="form-group">
                <label>Start Time</label>
                <input type="time" id="newStartTime" class="form-input" value="${suggestedStart}" required>
            </div>
            <div class="form-group">
                <label>End Time</label>
                <input type="time" id="newEndTime" class="form-input" value="${suggestedEnd}" required>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="newIsBreak">
                    Mark as Break Period
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">➕ Add Period</button>
                <button type="button" class="btn btn-secondary" onclick="showPeriodSettings()">❌ Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addPeriodForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveNewPeriod();
    });
}

function saveNewPeriod() {
    const periodNumber = parseInt(document.getElementById('newPeriodNumber').value);
    const startTime = document.getElementById('newStartTime').value;
    const endTime = document.getElementById('newEndTime').value;
    const isBreak = document.getElementById('newIsBreak').checked;

    // Validate times
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }

    saveToHistory();

    // Add new period
    currentTimetable.periods.push({
        number: periodNumber,
        startTime,
        endTime
    });

    // Add period slot to all days
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayKeys.forEach(day => {
        currentTimetable.timetable[day].push({
            period: periodNumber,
            subject: isBreak ? 'Break' : '',
            room: '',
            isBreak: isBreak,
            teacher: '',
            color: ''
        });
    });

    showNotification('Period added successfully', 'success');
    renderAdvancedTimetableEditor(currentTimetable);
    showPeriodSettings();
}

function deletePeriod(index) {
    if (currentTimetable.periods.length <= 1) {
        showNotification('Cannot delete the last period', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete Period ${currentTimetable.periods[index].number}? This will remove it from all days.`)) {
        return;
    }

    saveToHistory();

    // Remove period
    currentTimetable.periods.splice(index, 1);

    // Remove period from all days
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayKeys.forEach(day => {
        currentTimetable.timetable[day].splice(index, 1);
    });

    // Renumber remaining periods
    currentTimetable.periods.forEach((period, idx) => {
        period.number = idx + 1;
        dayKeys.forEach(day => {
            currentTimetable.timetable[day][idx].period = idx + 1;
        });
    });

    showNotification('Period deleted successfully', 'success');
    renderAdvancedTimetableEditor(currentTimetable);
    showPeriodSettings();
}

function movePeriodUp(index) {
    if (index === 0) return;

    saveToHistory();

    // Swap periods
    [currentTimetable.periods[index], currentTimetable.periods[index - 1]] =
        [currentTimetable.periods[index - 1], currentTimetable.periods[index]];

    // Swap in all days
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayKeys.forEach(day => {
        [currentTimetable.timetable[day][index], currentTimetable.timetable[day][index - 1]] =
            [currentTimetable.timetable[day][index - 1], currentTimetable.timetable[day][index]];
    });

    // Renumber
    currentTimetable.periods.forEach((period, idx) => {
        period.number = idx + 1;
        dayKeys.forEach(day => {
            currentTimetable.timetable[day][idx].period = idx + 1;
        });
    });

    showNotification('Period moved up', 'success');
    renderAdvancedTimetableEditor(currentTimetable);
    showPeriodSettings();
}

function movePeriodDown(index) {
    if (index === currentTimetable.periods.length - 1) return;

    saveToHistory();

    // Swap periods
    [currentTimetable.periods[index], currentTimetable.periods[index + 1]] =
        [currentTimetable.periods[index + 1], currentTimetable.periods[index]];

    // Swap in all days
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    dayKeys.forEach(day => {
        [currentTimetable.timetable[day][index], currentTimetable.timetable[day][index + 1]] =
            [currentTimetable.timetable[day][index + 1], currentTimetable.timetable[day][index]];
    });

    // Renumber
    currentTimetable.periods.forEach((period, idx) => {
        period.number = idx + 1;
        dayKeys.forEach(day => {
            currentTimetable.timetable[day][idx].period = idx + 1;
        });
    });

    showNotification('Period moved down', 'success');
    renderAdvancedTimetableEditor(currentTimetable);
    showPeriodSettings();
}

// Inline Period Time Editing
function editPeriodTime(index, currentStart, currentEnd) {
    const modalBody = document.getElementById('modalBody');
    const isBreak = currentTimetable.timetable.monday[index]?.isBreak || false;

    modalBody.innerHTML = `
        <h2>⏰ Edit Period ${index + 1} Timing</h2>
        <form id="editTimeForm">
            <div class="form-group">
                <label>Start Time</label>
                <input type="time" id="editStartTime" class="form-input" value="${currentStart}" required>
            </div>
            <div class="form-group">
                <label>End Time</label>
                <input type="time" id="editEndTime" class="form-input" value="${currentEnd}" required>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="editIsBreak" ${isBreak ? 'checked' : ''}>
                    Mark as Break Period
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('editTimeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const newStart = document.getElementById('editStartTime').value;
        const newEnd = document.getElementById('editEndTime').value;
        const isBreak = document.getElementById('editIsBreak').checked;

        if (newStart >= newEnd) {
            showNotification('End time must be after start time', 'error');
            return;
        }

        saveToHistory();
        currentTimetable.periods[index].startTime = newStart;
        currentTimetable.periods[index].endTime = newEnd;

        // Update break status
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        dayKeys.forEach(day => {
            if (currentTimetable.timetable[day][index]) {
                currentTimetable.timetable[day][index].isBreak = isBreak;
                if (isBreak && !currentTimetable.timetable[day][index].subject.includes('Break')) {
                    currentTimetable.timetable[day][index].subject = 'Break';
                }
            }
        });

        renderAdvancedTimetableEditor(currentTimetable);
        closeModal();
        showNotification('Period timing updated', 'success');
    });

    openModal();
}

function addNewPeriodInline() {
    const lastPeriod = currentTimetable.periods[currentTimetable.periods.length - 1];
    const suggestedStart = lastPeriod ? lastPeriod.endTime : '09:00';
    const [h, m] = suggestedStart.split(':').map(Number);
    const suggestedEnd = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>➕ Add New Period</h2>
        <form id="addPeriodForm">
            <div class="form-group">
                <label>Start Time</label>
                <input type="time" id="newStartTime" class="form-input" value="${suggestedStart}" required>
            </div>
            <div class="form-group">
                <label>End Time</label>
                <input type="time" id="newEndTime" class="form-input" value="${suggestedEnd}" required>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="newIsBreak">
                    Mark as Break Period
                </label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">➕ Add</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addPeriodForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const startTime = document.getElementById('newStartTime').value;
        const endTime = document.getElementById('newEndTime').value;
        const isBreak = document.getElementById('newIsBreak').checked;

        if (startTime >= endTime) {
            showNotification('End time must be after start time', 'error');
            return;
        }

        saveToHistory();

        const newPeriodNumber = currentTimetable.periods.length + 1;
        currentTimetable.periods.push({
            number: newPeriodNumber,
            startTime,
            endTime
        });

        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        dayKeys.forEach(day => {
            currentTimetable.timetable[day].push({
                period: newPeriodNumber,
                subject: isBreak ? 'Break' : '',
                room: '',
                isBreak: isBreak,
                teacher: '',
                color: ''
            });
        });

        renderAdvancedTimetableEditor(currentTimetable);
        closeModal();
        showNotification('Period added successfully', 'success');
    });

    openModal();
}


// ============================================
// CALENDAR MANAGEMENT
// ============================================

let currentCalendarDate = new Date();
let holidays = [];
let academicEvents = [];

// ── Attendance filter state ───────────────────────────────────────────────────
let calFilterMode     = 'day';      // 'day' | 'subject'
let calFilterSemester = '';
let calFilterBranch   = '';
let calFilterSubject  = '';
let calSubjectList    = [];
let calActiveDates    = new Set();  // ISO midnight strings (subject mode)
let calDayData        = {};         // dateKey → { present, absent, total } (day mode)
let calCurrentPeriodIdx = 0;        // chevron index inside subject modal

async function loadCalendar() {
    await loadHolidays();
    await loadCalendarFilterDropdowns();
    renderCalendar();
    renderHolidaysList();
}

// Populate semester/branch dropdowns from existing dynamicData
// ── Shared fetch helper with timeout ─────────────────────────────────────────
async function calApiFetch(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new Error('Request timed out');
        throw err;
    }
}

async function loadCalendarFilterDropdowns() {
    const semEl = document.getElementById('calSemesterFilter');
    const brEl  = document.getElementById('calBranchFilter');
    if (!semEl || !brEl) return;

    semEl.innerHTML = '<option value="">All Semesters</option>' +
        (dynamicData.semesters || []).map(s => `<option value="${s}">Semester ${s}</option>`).join('');
    brEl.innerHTML  = '<option value="">All Branches</option>' +
        (dynamicData.branches  || []).map(b => `<option value="${b.value}">${b.label}</option>`).join('');
}

// Load subject list for the selected semester+branch
async function loadCalendarSubjects() {
    const sem = calFilterSemester;
    const br  = calFilterBranch;
    if (!sem || !br) { calSubjectList = []; renderCalendarSubjectDropdown(); return; }
    try {
        const data = await calApiFetch(`${SERVER_URL}/api/attendance/subjects?semester=${encodeURIComponent(sem)}&branch=${encodeURIComponent(br)}`);
        calSubjectList = (data.success && data.subjects?.length) ? data.subjects : [];
        if (!calSubjectList.length) {
            console.warn('No subjects found for', sem, br);
        }
    } catch (err) {
        console.error('loadCalendarSubjects failed:', err.message);
        calSubjectList = [];
    }
    calFilterSubject = calSubjectList.length > 0 ? calSubjectList[0] : '';
    renderCalendarSubjectDropdown();
}

function renderCalendarSubjectDropdown() {
    const el = document.getElementById('calSubjectFilter');
    if (!el) return;
    if (calSubjectList.length === 0) {
        el.innerHTML = '<option value="">No subjects found</option>';
    } else {
        el.innerHTML = calSubjectList.map(s =>
            `<option value="${s}" ${s === calFilterSubject ? 'selected' : ''}>${s}</option>`
        ).join('');
    }
    el.style.display = calFilterMode === 'subject' ? 'inline-block' : 'none';
}

// Called when any filter changes
async function onCalendarFilterChange() {
    const semEl  = document.getElementById('calSemesterFilter');
    const brEl   = document.getElementById('calBranchFilter');
    const modeEl = document.getElementById('calModeFilter');
    const subEl  = document.getElementById('calSubjectFilter');

    const prevSem = calFilterSemester;
    const prevBr  = calFilterBranch;

    calFilterSemester = semEl  ? semEl.value  : '';
    calFilterBranch   = brEl   ? brEl.value   : '';
    calFilterMode     = modeEl ? modeEl.value : 'day';

    if (subEl) subEl.style.display = calFilterMode === 'subject' ? 'inline-block' : 'none';

    const semBrChanged = prevSem !== calFilterSemester || prevBr !== calFilterBranch;

    if (semBrChanged && calFilterSemester && calFilterBranch) {
        await loadCalendarSubjects();
    }

    calFilterSubject = subEl ? subEl.value : (calSubjectList[0] || '');

    if (calFilterMode === 'subject') {
        if (calSubjectList.length === 0 && calFilterSemester && calFilterBranch) {
            await loadCalendarSubjects();
            calFilterSubject = subEl ? subEl.value : (calSubjectList[0] || '');
        }
        await fetchCalendarSubjectDates();
    } else {
        await fetchCalendarDayData();
    }
    renderCalendar();
}

// Fetch day-mode data: all attendance records for semester+branch
async function fetchCalendarDayData() {
    calDayData = {};
    if (!calFilterSemester || !calFilterBranch) return;
    try {
        const data = await calApiFetch(`${SERVER_URL}/api/attendance/records?semester=${encodeURIComponent(calFilterSemester)}&branch=${encodeURIComponent(calFilterBranch)}`);
        if (data.success && data.records) {
            data.records.forEach(r => {
                const key = new Date(r.date).toDateString();
                if (!calDayData[key]) calDayData[key] = { present: 0, absent: 0, total: 0 };
                if (r.status === 'present') calDayData[key].present++;
                else                        calDayData[key].absent++;
                calDayData[key].total++;
            });
        }
    } catch (err) {
        console.error('fetchCalendarDayData failed:', err.message);
        showNotification('Failed to load attendance data: ' + err.message, 'error');
    }
}

// Fetch subject-mode data: dates when subject was held
async function fetchCalendarSubjectDates() {
    calActiveDates = new Set();
    if (!calFilterSemester || !calFilterBranch || !calFilterSubject) return;
    try {
        const data = await calApiFetch(
            `${SERVER_URL}/api/attendance/subject-dates?semester=${encodeURIComponent(calFilterSemester)}&branch=${encodeURIComponent(calFilterBranch)}&subject=${encodeURIComponent(calFilterSubject)}`
        );
        if (data.success) data.dates.forEach(d => calActiveDates.add(d));
        else showNotification('No scheduled dates found for this subject.', 'warning');
    } catch (err) {
        console.error('fetchCalendarSubjectDates failed:', err.message);
        showNotification('Failed to load subject dates: ' + err.message, 'error');
    }
}

async function loadHolidays() {
    try {
        const data = await calApiFetch(`${SERVER_URL}/api/holidays`);
        if (data.success) {
            holidays = data.holidays || [];
        } else {
            holidays = getDefaultHolidays();
        }
    } catch (error) {
        console.warn('loadHolidays failed, using defaults:', error.message);
        holidays = getDefaultHolidays();
    }
}

function getDefaultHolidays() {
    const year = new Date().getFullYear();
    return [
        // National Holidays
        { date: new Date(year, 0, 26), name: 'Republic Day', type: 'holiday', color: '#ff6b6b', description: 'National Holiday' },
        { date: new Date(year, 7, 15), name: 'Independence Day', type: 'holiday', color: '#ff6b6b', description: 'National Holiday' },
        { date: new Date(year, 9, 2), name: 'Gandhi Jayanti', type: 'holiday', color: '#ff6b6b', description: 'National Holiday' },

        // Religious Holidays (2025 dates - update yearly)
        { date: new Date(year, 2, 14), name: 'Holi', type: 'holiday', color: '#e74c3c', description: 'Festival of Colors' },
        { date: new Date(year, 2, 29), name: 'Good Friday', type: 'holiday', color: '#9b59b6', description: 'Christian Holiday' },
        { date: new Date(year, 3, 10), name: 'Eid ul-Fitr', type: 'holiday', color: '#27ae60', description: 'Islamic Festival' },
        { date: new Date(year, 3, 14), name: 'Mahavir Jayanti', type: 'holiday', color: '#f39c12', description: 'Jain Festival' },
        { date: new Date(year, 3, 21), name: 'Ram Navami', type: 'holiday', color: '#e67e22', description: 'Hindu Festival' },
        { date: new Date(year, 4, 23), name: 'Buddha Purnima', type: 'holiday', color: '#3498db', description: 'Buddhist Festival' },
        { date: new Date(year, 5, 16), name: 'Eid ul-Adha', type: 'holiday', color: '#27ae60', description: 'Islamic Festival' },
        { date: new Date(year, 7, 15), name: 'Raksha Bandhan', type: 'holiday', color: '#e74c3c', description: 'Hindu Festival' },
        { date: new Date(year, 7, 26), name: 'Janmashtami', type: 'holiday', color: '#3498db', description: 'Hindu Festival' },
        { date: new Date(year, 8, 15), name: 'Ganesh Chaturthi', type: 'holiday', color: '#e67e22', description: 'Hindu Festival' },
        { date: new Date(year, 9, 2), name: 'Dussehra', type: 'holiday', color: '#e74c3c', description: 'Hindu Festival' },
        { date: new Date(year, 9, 20), name: 'Diwali', type: 'holiday', color: '#f39c12', description: 'Festival of Lights' },
        { date: new Date(year, 10, 5), name: 'Guru Nanak Jayanti', type: 'holiday', color: '#3498db', description: 'Sikh Festival' },
        { date: new Date(year, 11, 25), name: 'Christmas', type: 'holiday', color: '#e74c3c', description: 'Christian Holiday' },

        // Academic Events
        { date: new Date(year, 0, 1), name: 'New Year', type: 'event', color: '#9b59b6', description: 'New Year Celebration' },
        { date: new Date(year, 1, 5), name: 'Semester Start', type: 'event', color: '#3498db', description: 'Even Semester Begins' },
        { date: new Date(year, 6, 15), name: 'Semester Start', type: 'event', color: '#3498db', description: 'Odd Semester Begins' },
    ];
}

function renderCalendar() {
    const calendar  = document.getElementById('adminCalendar');
    const monthYear = document.getElementById('calendarMonthYear');
    if (!calendar || !monthYear) return;

    const year  = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    monthYear.textContent = `${monthNames[month]} ${year}`;

    const firstDay    = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow    = firstDay.getDay();

    let html = '<div class="calendar-grid">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
        html += `<div class="calendar-day-header">${d}</div>`;
    });
    for (let i = 0; i < startDow; i++) html += '<div class="calendar-cell empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
        const date    = new Date(year, month, day);
        const dateStr = date.toDateString();
        const today   = new Date().toDateString() === dateStr;
        const holiday = holidays.find(h => new Date(h.date).toDateString() === dateStr);
        const isSun   = date.getDay() === 0;

        // Determine if this date is "active" under current filter
        let isActive = false;
        let badge    = '';
        if (calFilterMode === 'day' && calFilterSemester && calFilterBranch) {
            const stats = calDayData[dateStr];
            if (stats) {
                isActive = true;
                badge = `<div class="cal-badge">${stats.total}</div>`;
            }
        } else if (calFilterMode === 'subject' && calFilterSubject) {
            const midnight = new Date(date); midnight.setHours(0,0,0,0);
            if (calActiveDates.has(midnight.toISOString())) {
                isActive = true;
                badge = `<div class="cal-badge cal-badge-subject">●</div>`;
            }
        }

        html += `<div class="calendar-cell ${today ? 'today' : ''} ${holiday ? 'has-event' : ''} ${isSun ? 'sunday' : ''} ${isActive ? 'cal-active' : ''}"
                      onclick="selectCalendarDate('${dateStr}')"
                      style="${holiday ? `border-left:4px solid ${holiday.color}` : ''}">
            <div class="calendar-date">${day}</div>
            ${holiday ? `
                <div class="calendar-event" style="background:${holiday.color}">${holiday.name}</div>
                <button class="cal-edit-btn" onclick="event.stopPropagation();editHoliday(${JSON.stringify(holiday).replace(/"/g,'&quot;')})" title="Edit holiday">✏️</button>
            ` : badge}
        </div>`;
    }
    html += '</div>';
    calendar.innerHTML = html;
}

function renderHolidaysList() {
    const list = document.getElementById('holidaysList');

    // Sort holidays by date
    const sortedHolidays = [...holidays].sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '';
    sortedHolidays.forEach((holiday, index) => {
        const date = new Date(holiday.date);
        // Use Indian date format: DD MMM YYYY
        const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });

        html += `
            <div class="holiday-item" style="border-left: 4px solid ${holiday.color}">
                <div class="holiday-info">
                    <div class="holiday-name">${holiday.name}</div>
                    <div class="holiday-date">${dayName}, ${dateStr}</div>
                    ${holiday.description ? `<div class="holiday-desc">${holiday.description}</div>` : ''}
                </div>
                <div class="holiday-actions">
                    <button class="icon-btn" onclick='editHoliday(${JSON.stringify(holiday).replace(/'/g, "\\'")})'title="Edit">✏️</button>
                    <button class="icon-btn" onclick="deleteHoliday('${holiday._id}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    });

    if (sortedHolidays.length === 0) {
        html = '<div class="no-holidays">No holidays added yet. Click "Add Holiday" to get started.</div>';
    }

    list.innerHTML = html;
}

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

// Unified date click handler
async function selectCalendarDate(dateStr) {
    const date    = new Date(dateStr);
    const holiday = holidays.find(h => new Date(h.date).toDateString() === dateStr);

    // If semester+branch filters are active → always show attendance modal
    if (calFilterSemester && calFilterBranch) {
        if (calFilterMode === 'subject' && calFilterSubject) {
            await showSubjectAttendanceModal(date);
        } else {
            await showDayAttendanceModal(date);
        }
        return;
    }

    // No filters — clicking opens add-holiday (holiday edit is via pencil icon)
    showAddHolidayModal(date);
}

// Keep old selectDate as alias for any remaining references
function selectDate(dateStr) { selectCalendarDate(dateStr); }

// ── Day-mode modal ────────────────────────────────────────────────────────────
async function showDayAttendanceModal(date) {
    const dateStr   = date.toISOString().split('T')[0];
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `<h2>📅 ${date.toDateString()}</h2><p style="color:var(--text-secondary)">Loading…</p>`;
    openModal();
    try {
        const data = await calApiFetch(
            `${SERVER_URL}/api/attendance/date/${dateStr}?semester=${encodeURIComponent(calFilterSemester)}&branch=${encodeURIComponent(calFilterBranch)}`
        );
        if (!data.success || !data.students?.length) {
            modalBody.innerHTML = `<h2>📅 ${date.toDateString()}</h2>
                <p style="color:var(--text-secondary);text-align:center;padding:20px">
                    No attendance records for this date.
                </p>`;
            return;
        }
        renderDayModal(date, data.students);
    } catch (err) {
        modalBody.innerHTML = `<h2>📅 ${date.toDateString()}</h2>
            <p style="color:#ef4444;text-align:center;padding:20px">⚠️ ${err.message}</p>
            <div style="text-align:center">
                <button class="btn btn-secondary" onclick="showDayAttendanceModal(new Date('${date.toISOString()}'))">🔄 Retry</button>
            </div>`;
    }
}

function renderDayModal(date, students) {
    const modalBody = document.getElementById('modalBody');
    const present   = students.filter(s => s.status === 'present').length;
    const absent    = students.filter(s => s.status === 'absent').length;
    const pct       = students.length > 0 ? Math.round((present / students.length) * 100) : 0;
    const barColor  = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

    window._calModalStudents = students;
    window._calModalDate     = date;

    modalBody.innerHTML = `
        <div class="cal-modal-header">
            <div>
                <div class="cal-modal-title">📅 ${date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
                <div class="cal-modal-sub">Sem ${calFilterSemester} · ${calFilterBranch}</div>
            </div>
        </div>

        <!-- Attendance ring + stats -->
        <div class="cal-day-stats">
            <div class="cal-ring-wrap">
                <svg viewBox="0 0 36 36" class="cal-ring">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="${barColor}" stroke-width="3"
                        stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="25" stroke-linecap="round"/>
                </svg>
                <div class="cal-ring-label" style="color:${barColor}">${pct}%</div>
            </div>
            <div class="cal-day-stat-grid">
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:#10b981">${present}</span>
                    <span class="cal-day-stat-lbl">Present</span>
                </div>
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:#ef4444">${absent}</span>
                    <span class="cal-day-stat-lbl">Absent</span>
                </div>
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:var(--primary)">${students.length}</span>
                    <span class="cal-day-stat-lbl">Total</span>
                </div>
            </div>
        </div>

        <!-- Attendance bar -->
        <div class="cal-bar-wrap">
            <div class="cal-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>

        <!-- Student cards -->
        <div class="cal-student-grid">
            ${students.map((s, i) => {
                const lc = s.lectures?.length || 0;
                const sp = s.lectures?.filter(l => l.status === 'present').length || 0;
                const isP = s.status === 'present';
                return `
                <div class="cal-student-card ${isP ? 'present' : 'absent'}" onclick="showStudentLectureDetail(${i},'day')">
                    <div class="cal-sc-avatar ${isP ? 'present' : 'absent'}">${(s.name||'?')[0].toUpperCase()}</div>
                    <div class="cal-sc-info">
                        <div class="cal-sc-name">${s.name || s.studentName || 'Unknown'}</div>
                        <div class="cal-sc-id">${s.enrollmentNo || ''}</div>
                        ${lc > 0 ? `<div class="cal-sc-lectures">${sp}/${lc} lectures attended</div>` : ''}
                    </div>
                    <div class="cal-sc-badge ${isP ? 'present' : 'absent'}">${isP ? '✓' : '✗'}</div>
                </div>`;
            }).join('')}
        </div>`;
}

function showStudentLectureDetail(idx, mode) {
    const students = window._calModalStudents;
    if (!students || !students[idx]) return;
    const s        = students[idx];
    const lectures = s.lectures || [];
    const modalBody = document.getElementById('modalBody');
    const pLec     = lectures.filter(l => l.status === 'present').length;
    const pct      = lectures.length > 0 ? Math.round((pLec / lectures.length) * 100) : (s.status === 'present' ? 100 : 0);
    const barColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const backFn   = mode === 'subject' ? 'renderSubjectModal(window._calModalDate)' : 'renderDayModal(window._calModalDate, window._calModalStudents)';
    const enrollmentNo = s.enrollmentNo || s.studentId || '';

    const renderDetail = () => {
        // Build period bubbles — P1 to P8 (or however many periods exist in the timetable)
        // Determine max period number from lectures or default to 8
        const maxPeriod = Math.max(8, ...lectures.map(l => parseInt((l.period || 'P0').replace('P','')) || 0));
        const periodSlots = Array.from({ length: maxPeriod }, (_, i) => {
            const pid = `P${i + 1}`;
            const lec = lectures.find(l => l.period === pid);
            return { pid, lec };
        });

        const bubbleHtml = `
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Periods</div>
                <div class="cal-subject-bubbles">
                    ${periodSlots.map(({ pid, lec }) => {
                        if (!lec) {
                            // Empty ghost bubble — period not in timetable or no data
                            return `
                            <div class="cal-bubble-wrap" title="${pid}: No class">
                                <svg viewBox="0 0 36 36" class="cal-bubble-svg">
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
                                </svg>
                                <div class="cal-bubble-inner">
                                    <div style="font-size:9px;color:rgba(255,255,255,0.2);font-weight:600">${pid}</div>
                                </div>
                            </div>`;
                        }
                        const isPresent = lec.status === 'present';
                        const c = isPresent ? '#10b981' : '#ef4444';
                        const dash = isPresent ? 100 : 0; // full ring if present, empty if absent
                        const shortName = (lec.subject || '').length > 5 ? (lec.subject || '').substring(0, 4) + '…' : (lec.subject || pid);
                        return `
                        <div class="cal-bubble-wrap" title="${pid}: ${lec.subject || '—'} (${isPresent ? 'Present' : 'Absent'})">
                            <svg viewBox="0 0 36 36" class="cal-bubble-svg">
                                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2.5"/>
                                <circle cx="18" cy="18" r="15.9" fill="none" stroke="${c}" stroke-width="2.5"
                                    stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="25" stroke-linecap="round"/>
                            </svg>
                            <div class="cal-bubble-inner">
                                <div class="cal-bubble-name" style="color:${c}">${shortName}</div>
                                <div class="cal-bubble-pct" style="color:${c}">${pid}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;

        modalBody.innerHTML = `
            <div class="cal-modal-header">
                <button class="btn btn-sm btn-secondary" onclick="${backFn}" style="flex-shrink:0">← Back</button>
                <div>
                    <div class="cal-modal-title">${s.name || s.studentName || 'Unknown'}</div>
                    <div class="cal-modal-sub">${enrollmentNo} · ${window._calModalDate?.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) || ''}</div>
                </div>
            </div>

            <div class="cal-day-stats" style="margin-bottom:12px">
                <div class="cal-ring-wrap">
                    <svg viewBox="0 0 36 36" class="cal-ring">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="${barColor}" stroke-width="3"
                            stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="25" stroke-linecap="round"/>
                    </svg>
                    <div class="cal-ring-label" style="color:${barColor}">${pct}%</div>
                </div>
                <div class="cal-day-stat-grid">
                    <div class="cal-day-stat-item">
                        <span class="cal-day-stat-val" style="color:#10b981">${pLec}</span>
                        <span class="cal-day-stat-lbl">Present</span>
                    </div>
                    <div class="cal-day-stat-item">
                        <span class="cal-day-stat-val" style="color:#ef4444">${lectures.length - pLec}</span>
                        <span class="cal-day-stat-lbl">Absent</span>
                    </div>
                    <div class="cal-day-stat-item">
                        <span class="cal-day-stat-val" style="color:var(--primary)">${lectures.length}</span>
                        <span class="cal-day-stat-lbl">Total</span>
                    </div>
                </div>
            </div>

            ${lectures.length === 0
                ? `<div class="cal-empty"><span style="font-size:32px">📭</span><p>No lecture data for this day</p></div>`
                : `<div class="cal-lecture-timeline">
                    ${lectures.map(l => `
                        <div class="cal-lt-row ${l.status}">
                            <div class="cal-lt-dot ${l.status}"></div>
                            <div class="cal-lt-period">${l.period || '—'}</div>
                            <div class="cal-lt-body">
                                <div class="cal-lt-subject">${l.subject || 'Unknown Subject'}</div>
                                <div class="cal-lt-meta">
                                    ${l.teacher ? `<span>👨‍🏫 ${l.teacher}</span>` : ''}
                                    ${l.room    ? `<span>📍 ${l.room}</span>` : ''}
                                    ${l.verificationType ? `<span class="cal-verify-badge">${l.verificationType}</span>` : ''}
                                </div>
                            </div>
                            <div class="cal-lt-status ${l.status}">${l.status === 'present' ? '✓' : '✗'}</div>
                        </div>`).join('')}
                   </div>`}

            ${bubbleHtml}`;
    };

    // Render immediately — bubbles are built from existing lectures data, no extra fetch needed
    renderDetail();
}

// ── Subject-mode modal with chevron period navigation ─────────────────────────
let calSubjectModalData = null;   // { students, allPeriods }

async function showSubjectAttendanceModal(date) {
    const dateStr   = date.toISOString().split('T')[0];
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `<h2>📚 ${calFilterSubject} — ${date.toDateString()}</h2><p style="color:var(--text-secondary)">Loading…</p>`;
    openModal();
    try {
        const data = await calApiFetch(
            `${SERVER_URL}/api/attendance/date/${dateStr}/subject/${encodeURIComponent(calFilterSubject)}?semester=${encodeURIComponent(calFilterSemester)}&branch=${encodeURIComponent(calFilterBranch)}`
        );
        if (!data.success || !data.students?.length) {
            modalBody.innerHTML = `<h2>📚 ${calFilterSubject} — ${date.toDateString()}</h2>
                <p style="color:var(--text-secondary);text-align:center;padding:20px">
                    No attendance records for this subject on this date.
                </p>`;
            return;
        }
        calSubjectModalData  = data;
        calCurrentPeriodIdx  = 0;
        window._calModalDate = date;
        window._calModalStudents = data.students.map(s => ({
            ...s,
            name: s.studentName,
            lectures: (data.allPeriods || []).map((p, i) => {
                const pr = s.periods?.[i];
                return { period: p, subject: calFilterSubject, status: pr?.status || 'absent',
                         verificationType: pr?.verificationType, room: pr?.room, teacher: pr?.teacher };
            })
        }));
        renderSubjectModal(date);
    } catch (err) {
        modalBody.innerHTML = `<h2>📚 ${calFilterSubject}</h2>
            <p style="color:#ef4444;text-align:center;padding:20px">⚠️ ${err.message}</p>
            <div style="text-align:center">
                <button class="btn btn-secondary" onclick="showSubjectAttendanceModal(new Date('${date.toISOString()}'))">🔄 Retry</button>
            </div>`;
    }
}

function renderSubjectModal(date) {
    if (!calSubjectModalData) return;
    const { students, allPeriods } = calSubjectModalData;
    const period    = allPeriods[calCurrentPeriodIdx];
    const modalBody = document.getElementById('modalBody');
    const dateLabel = (date || window._calModalDate)
        ? (date || window._calModalDate).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})
        : '';

    const present = students.filter(s => s.periods?.[calCurrentPeriodIdx]?.status === 'present').length;
    const absent  = students.filter(s => s.periods?.[calCurrentPeriodIdx]?.status === 'absent').length;
    const pct     = students.length > 0 ? Math.round((present / students.length) * 100) : 0;
    const barColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

    const prevDisabled = calCurrentPeriodIdx === 0 ? 'disabled' : '';
    const nextDisabled = calCurrentPeriodIdx === allPeriods.length - 1 ? 'disabled' : '';

    modalBody.innerHTML = `
        <div class="cal-modal-header">
            <div>
                <div class="cal-modal-title">📚 ${calFilterSubject}</div>
                <div class="cal-modal-sub">${dateLabel} · Sem ${calFilterSemester} · ${calFilterBranch}</div>
            </div>
        </div>

        <!-- Attendance ring + stats -->
        <div class="cal-day-stats">
            <div class="cal-ring-wrap">
                <svg viewBox="0 0 36 36" class="cal-ring">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="${barColor}" stroke-width="3"
                        stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="25" stroke-linecap="round"/>
                </svg>
                <div class="cal-ring-label" style="color:${barColor}">${pct}%</div>
            </div>
            <div class="cal-day-stat-grid">
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:#10b981">${present}</span>
                    <span class="cal-day-stat-lbl">Present</span>
                </div>
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:#ef4444">${absent}</span>
                    <span class="cal-day-stat-lbl">Absent</span>
                </div>
                <div class="cal-day-stat-item">
                    <span class="cal-day-stat-val" style="color:var(--primary)">${students.length}</span>
                    <span class="cal-day-stat-lbl">Total</span>
                </div>
            </div>
        </div>
        <div class="cal-bar-wrap"><div class="cal-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>

        <!-- Period chevron navigator -->
        ${allPeriods.length > 1 ? `
        <div class="cal-period-nav">
            <button class="btn btn-sm btn-secondary" onclick="calChevron(-1)" ${prevDisabled}>‹</button>
            <div style="text-align:center">
                <div class="cal-period-label">${period}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${calCurrentPeriodIdx + 1} of ${allPeriods.length} periods</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="calChevron(1)" ${nextDisabled}>›</button>
        </div>` : period ? `<div class="cal-period-label-solo">${period}</div>` : ''}

        <!-- Student cards -->
        <div class="cal-student-grid">
            ${students.map((s, i) => {
                const pr  = s.periods?.[calCurrentPeriodIdx];
                const st  = pr?.status || 'absent';
                const isP = st === 'present';
                return `
                <div class="cal-student-card ${isP ? 'present' : 'absent'}" onclick="showStudentLectureDetail(${i},'subject')">
                    <div class="cal-sc-avatar ${isP ? 'present' : 'absent'}">${(s.studentName||'?')[0].toUpperCase()}</div>
                    <div class="cal-sc-info">
                        <div class="cal-sc-name">${s.studentName || 'Unknown'}</div>
                        <div class="cal-sc-id">${s.enrollmentNo || ''}</div>
                        ${pr?.verificationType ? `<div class="cal-sc-lectures">${pr.verificationType}</div>` : ''}
                    </div>
                    <div class="cal-sc-badge ${isP ? 'present' : 'absent'}">${isP ? '✓' : '✗'}</div>
                </div>`;
            }).join('')}
        </div>`;
}

function calChevron(dir) {
    if (!calSubjectModalData) return;
    const max = calSubjectModalData.allPeriods.length - 1;
    calCurrentPeriodIdx = Math.max(0, Math.min(max, calCurrentPeriodIdx + dir));
    renderSubjectModal(null);
}

async function backfillTimetableHistory() {
    if (!confirm('This will backfill TimetableHistory from existing PeriodAttendance records.\nRun once after deploying the update. Continue?')) return;
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Running…'; }
    try {
        const data = await calApiFetch(`${SERVER_URL}/api/timetable-history/backfill`, 60000);
        // calApiFetch only does GET — use fetch directly for POST
        throw new Error('use_fetch'); // fallthrough to catch
    } catch (_) {
        // POST needs direct fetch
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        const res  = await fetch(`${SERVER_URL}/api/timetable-history/backfill`, {
            method: 'POST', signal: controller.signal
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification('Backfill failed: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'Backfill timed out (60s)' : err.message;
        showNotification('Backfill error: ' + msg, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Backfill History'; }
    }
}

async function runDbMigration() {
    if (!confirm('Run DB migration?\n\nThis will:\n• Add semester/branch to PeriodAttendance records\n• Deduplicate AttendanceRecord\n• Normalise studentId = enrollmentNo\n\nSafe to run multiple times.')) return;
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Migrating…'; }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        const res  = await fetch(`${SERVER_URL}/api/db/migrate`, { method: 'POST', signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success) {
            const r = data.report;
            showNotification(
                `Migration done — PA updated: ${r.periodAttendanceUpdated}, AR dupes removed: ${r.arDuplicatesRemoved}, AR normalised: ${r.arNormalised}`,
                'success'
            );
        } else {
            showNotification('Migration failed: ' + (data.error || 'Unknown'), 'error');
        }
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'Migration timed out (120s)' : err.message;
        showNotification('Migration error: ' + msg, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔧 DB Migrate'; }
    }
}

async function runAttendanceResync() {
    if (!confirm('Recalculate all AttendanceRecord statuses from PeriodAttendance?\nThis fixes historical present/absent status. Safe to run multiple times.')) return;
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Resyncing…'; }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        const res  = await fetch(`${SERVER_URL}/api/db/resync-attendance`, { method: 'POST', signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification('Resync failed: ' + (data.error || 'Unknown'), 'error');
        }
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'Resync timed out' : err.message;
        showNotification('Resync error: ' + msg, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔁 Resync Attendance'; }
    }
}

document.getElementById('addHolidayBtn').addEventListener('click', () => {
    showAddHolidayModal(new Date());
});

function showAddHolidayModal(date = new Date()) {
    const modalBody = document.getElementById('modalBody');
    const dateStr = date.toISOString().split('T')[0];

    modalBody.innerHTML = `
        <h2>➕ Add Holiday/Event</h2>
        <form id="holidayForm">
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="holidayDate" class="form-input" value="${dateStr}" required>
            </div>
            <div class="form-group">
                <label>Name *</label>
                <input type="text" id="holidayName" class="form-input" placeholder="e.g., Diwali" required>
            </div>
            <div class="form-group">
                <label>Type *</label>
                <select id="holidayType" class="form-select" required>
                    <option value="holiday">🏖️ Holiday</option>
                    <option value="exam">📝 Exam</option>
                    <option value="event">🎉 Event</option>
                </select>
            </div>
            <div class="form-group">
                <label>Color</label>
                <div class="color-picker">
                    <input type="color" id="holidayColor" value="#ff6b6b">
                    <span class="color-label">Choose color</span>
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="holidayDescription" class="form-textarea" rows="3" placeholder="Optional description"></textarea>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">➕ Add</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">❌ Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('holidayForm').addEventListener('submit', handleAddHoliday);
    openModal();
}

async function handleAddHoliday(e) {
    e.preventDefault();

    const holiday = {
        date: new Date(document.getElementById('holidayDate').value),
        name: document.getElementById('holidayName').value,
        type: document.getElementById('holidayType').value,
        color: document.getElementById('holidayColor').value,
        description: document.getElementById('holidayDescription').value
    };

    try {
        const response = await fetch(`${SERVER_URL}/api/holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(holiday)
        });

        if (response.ok) {
            holidays.push(holiday);
            renderCalendar();
            renderHolidaysList();
            closeModal();
            showNotification('Holiday added successfully', 'success');
        }
    } catch (error) {
        // Fallback to local storage
        holidays.push(holiday);
        localStorage.setItem('holidays', JSON.stringify(holidays));
        renderCalendar();
        renderHolidaysList();
        closeModal();
        showNotification('Holiday added (saved locally)', 'success');
    }
}

function editHoliday(holiday) {
    const modalBody = document.getElementById('modalBody');
    const dateStr = new Date(holiday.date).toISOString().split('T')[0];

    modalBody.innerHTML = `
        <h2>✏️ Edit Holiday/Event</h2>
        <form id="editHolidayForm">
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="editHolidayDate" class="form-input" value="${dateStr}" required>
            </div>
            <div class="form-group">
                <label>Name *</label>
                <input type="text" id="editHolidayName" class="form-input" value="${holiday.name}" required>
            </div>
            <div class="form-group">
                <label>Type *</label>
                <select id="editHolidayType" class="form-select" required>
                    <option value="holiday" ${holiday.type === 'holiday' ? 'selected' : ''}>🏖️ Holiday</option>
                    <option value="exam" ${holiday.type === 'exam' ? 'selected' : ''}>📝 Exam</option>
                    <option value="event" ${holiday.type === 'event' ? 'selected' : ''}>🎉 Event</option>
                </select>
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" id="editHolidayColor" value="${holiday.color || '#ff6b6b'}">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="editHolidayDescription" class="form-textarea" rows="3">${holiday.description || ''}</textarea>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">❌ Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('editHolidayForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveHolidayEdit(holiday._id);
    });
    openModal();
}

async function saveHolidayEdit(holidayId) {
    const updatedHoliday = {
        date: new Date(document.getElementById('editHolidayDate').value),
        name: document.getElementById('editHolidayName').value,
        type: document.getElementById('editHolidayType').value,
        color: document.getElementById('editHolidayColor').value,
        description: document.getElementById('editHolidayDescription').value
    };

    try {
        const response = await fetch(`${SERVER_URL}/api/holidays/${holidayId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedHoliday)
        });

        const data = await response.json();
        if (data.success) {
            await loadHolidays(); // Reload holidays from server
            renderCalendar();
            renderHolidaysList();
            closeModal();
            showNotification('Holiday updated successfully', 'success');
        } else {
            showNotification('Failed to update holiday', 'error');
        }
    } catch (error) {
        console.error('Error updating holiday:', error);
        showNotification('Error updating holiday', 'error');
    }
}

async function deleteHoliday(holidayId) {
    if (!confirm('Are you sure you want to delete this holiday?')) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/holidays/${holidayId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            await loadHolidays(); // Reload holidays from server
            renderCalendar();
            renderHolidaysList();
            showNotification('Holiday deleted successfully', 'success');
        } else {
            showNotification('Failed to delete holiday', 'error');
        }
    } catch (error) {
        console.error('Error deleting holiday:', error);
        showNotification('Error deleting holiday', 'error');
    }
}

function showHolidayDetails(holiday) {
    const modalBody = document.getElementById('modalBody');
    const date = new Date(holiday.date);
    // Use Indian date format
    const dateStr = date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    modalBody.innerHTML = `
        <div class="holiday-details">
            <div class="holiday-icon" style="background: ${holiday.color}">
                ${holiday.type === 'holiday' ? '🏖️' : holiday.type === 'exam' ? '📝' : '🎉'}
            </div>
            <h2>${holiday.name}</h2>
            <p class="holiday-date-full">${dateStr}</p>
            ${holiday.description ? `<p class="holiday-description">${holiday.description}</p>` : ''}
            <div class="holiday-type-badge" style="background: ${holiday.color}20; color: ${holiday.color}">
                ${holiday.type.toUpperCase()}
            </div>
        </div>
    `;
    openModal();
}

// Academic Year Settings (Indian Academic Calendar)
function showAcademicYearSettings() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📅 Academic Year Settings</h2>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
            Indian academic year typically runs from July to June
        </p>
        <form id="academicYearForm">
            <div class="form-group">
                <label>Academic Year</label>
                <input type="text" class="form-input" value="2024-2025" placeholder="e.g., 2024-2025">
            </div>
            <div class="form-group">
                <label>Start Date (Usually July)</label>
                <input type="date" class="form-input" value="2024-07-01">
            </div>
            <div class="form-group">
                <label>End Date (Usually June)</label>
                <input type="date" class="form-input" value="2025-06-30">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" checked> Include Indian Holidays
                </label>
            </div>
            <button type="submit" class="btn btn-primary">💾 Save</button>
        </form>
    `;
    openModal();
}

// Semester Dates
function showSemesterDates() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📆 Semester Dates</h2>
        <div class="semester-dates-list">
            <div class="semester-date-item">
                <h4>Semester 1 (Odd)</h4>
                <input type="date" class="form-input" placeholder="Start Date">
                <input type="date" class="form-input" placeholder="End Date">
            </div>
            <div class="semester-date-item">
                <h4>Semester 2 (Even)</h4>
                <input type="date" class="form-input" placeholder="Start Date">
                <input type="date" class="form-input" placeholder="End Date">
            </div>
        </div>
        <button class="btn btn-primary">💾 Save Dates</button>
    `;
    openModal();
}

// Exam Schedule
function showExamSchedule() {
    showNotification('Exam Schedule feature coming soon!', 'info');
}

// Event Manager
function showEventManager() {
    showNotification('Event Manager feature coming soon!', 'info');
}

// Bulk Import Holidays
function bulkImportHolidays() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📥 Bulk Import Holidays</h2>
        <p>Upload a CSV file with columns: date, name, type, color, description</p>
        <input type="file" accept=".csv" class="form-input" id="holidayCSV">
        <button class="btn btn-primary" onclick="processHolidayCSV()">Import</button>
    `;
    openModal();
}

function processHolidayCSV() {
    showNotification('CSV import feature coming soon!', 'info');
}


// ==================== PERIOD MANAGEMENT ====================

// Initialize currentPeriods with defaults immediately
function initializePeriods() {
    if (currentPeriods.length === 0) {
        currentPeriods = getDefaultPeriods();
    }
}

// Call initialization
initializePeriods();

async function loadPeriods() {
    try {
        // Try to get periods from any existing timetable, or use defaults
        let periodsLoaded = false;

        // First, try to get periods from localStorage (saved custom periods)
        const savedPeriods = localStorage.getItem('defaultPeriods');
        if (savedPeriods) {
            try {
                currentPeriods = JSON.parse(savedPeriods);
                periodsLoaded = true;
            } catch (e) {
                console.warn('Invalid saved periods in localStorage');
            }
        }

        // If no saved periods, try to fetch from any available timetable
        if (!periodsLoaded) {
            try {
                // Prefer currently loaded timetable periods (if any)
                if (currentTimetable?.periods?.length > 0) {
                    currentPeriods = currentTimetable.periods;
                    periodsLoaded = true;
                } else {
                    // Otherwise, pull periods from the first available timetable on server
                    const allRes = await fetch(`${SERVER_URL}/api/timetables`);
                    if (allRes.ok) {
                        const allData = await allRes.json();
                        const first = allData?.timetables?.find(tt => tt?.periods?.length > 0);
                        if (first?.periods?.length > 0) {
                            currentPeriods = first.periods;
                            periodsLoaded = true;
                        }
                    }
                }
            } catch (fetchError) {
                console.warn('Could not fetch periods from timetables:', fetchError);
            }
        }

        // If still no periods loaded, use system defaults
        if (!periodsLoaded) {
            currentPeriods = getDefaultPeriods();
        }

        renderPeriods();
        updatePeriodStats();
    } catch (error) {
        console.error('Error loading periods:', error);
        showNotification('Loading default periods', 'info');
        currentPeriods = getDefaultPeriods();
        renderPeriods();
        updatePeriodStats();
    }
}

function getDefaultPeriods() {
    // Check if there are saved custom periods in localStorage
    const savedPeriods = localStorage.getItem('defaultPeriods');
    if (savedPeriods) {
        try {
            return JSON.parse(savedPeriods);
        } catch (e) {
            console.warn('Invalid saved periods, using system defaults');
        }
    }

    // System default periods (can be customized by admin)
    return [
        { number: 1, startTime: '09:00', endTime: '10:00' },
        { number: 2, startTime: '10:00', endTime: '11:00' },
        { number: 3, startTime: '11:00', endTime: '11:15' }, // Break
        { number: 4, startTime: '11:15', endTime: '12:15' },
        { number: 5, startTime: '12:15', endTime: '13:15' },
        { number: 6, startTime: '13:15', endTime: '14:00' }, // Lunch
        { number: 7, startTime: '14:00', endTime: '15:00' },
        { number: 8, startTime: '15:00', endTime: '16:00' }
    ];
}

// Function to save custom default periods
function saveDefaultPeriods(periods) {
    try {
        localStorage.setItem('defaultPeriods', JSON.stringify(periods));
        showNotification('Default periods saved successfully', 'success');
    } catch (e) {
        showNotification('Failed to save default periods', 'error');
    }
}

function renderPeriods() {
    const periodsList = document.getElementById('periodsList');

    // Safety check - ensure currentPeriods exists and has valid data
    if (!currentPeriods || currentPeriods.length === 0) {
        periodsList.innerHTML = '<div class="no-periods">No periods configured. Click "Add New Period" to get started.</div>';
        return;
    }

    periodsList.innerHTML = currentPeriods.map((period, index) => {
        // Ensure period has required properties with defaults
        const periodNumber = period.number || (index + 1);
        const startTime = period.startTime || '09:00';
        const endTime = period.endTime || '10:00';
        const duration = calculateDuration(startTime, endTime);

        return `
            <div class="period-item" data-index="${index}">
                <div class="period-number">${periodNumber}</div>
                
                <div class="period-time-group">
                    <label>Start Time</label>
                    <input type="time" 
                           class="period-time-input" 
                           value="${startTime}" 
                           onchange="updatePeriodTime(${index}, 'startTime', this.value)">
                </div>
                
                <div class="period-time-group">
                    <label>End Time</label>
                    <input type="time" 
                           class="period-time-input" 
                           value="${endTime}" 
                           onchange="updatePeriodTime(${index}, 'endTime', this.value)">
                </div>
                
                <div class="period-duration">
                    Duration
                    <strong>${duration} min</strong>
                </div>
                
                <div class="period-actions-cell">
                    <button class="period-btn period-btn-delete" onclick="deletePeriod(${index})">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    updatePeriodStats();
}

function calculateDuration(startTime, endTime) {
    // Safety check for undefined times
    if (!startTime || !endTime) {
        return 0;
    }

    try {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        return Math.max(0, endMinutes - startMinutes);
    } catch (error) {
        console.warn('Error calculating duration:', error);
        return 0;
    }
}

function updatePeriodTime(index, field, value) {
    if (currentPeriods[index]) {
        currentPeriods[index][field] = value;

        // Ensure the period object has all required properties
        if (!currentPeriods[index].number) {
            currentPeriods[index].number = index + 1;
        }

        renderPeriods();
    }
}

function addNewPeriodSlot() {
    const lastPeriod = currentPeriods[currentPeriods.length - 1];
    const newNumber = currentPeriods.length + 1;

    // Default: start where last period ended, 60 min duration
    let startTime = lastPeriod ? lastPeriod.endTime : '16:10';
    let endTime = addMinutesToTime(startTime, 60);

    currentPeriods.push({
        number: newNumber,
        startTime: startTime,
        endTime: endTime
    });

    renderPeriods();
    showNotification('Period added. Don\'t forget to save!', 'success');
}

function deletePeriod(index) {
    if (currentPeriods.length <= 1) {
        showNotification('Cannot delete the last period', 'error');
        return;
    }

    if (confirm(`Delete Period ${currentPeriods[index].number}?`)) {
        currentPeriods.splice(index, 1);

        // Renumber periods
        currentPeriods.forEach((period, idx) => {
            period.number = idx + 1;
        });

        renderPeriods();
        showNotification('Period deleted. Don\'t forget to save!', 'warning');
    }
}

function addMinutesToTime(timeStr, minutes) {
    const [hours, mins] = timeStr.split(':').map(Number);
    let totalMinutes = hours * 60 + mins + minutes;

    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;

    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

function updatePeriodStats() {
    // Safety check - only update if elements exist
    const totalPeriodsElement = document.getElementById('totalPeriodsCount');
    const classDurationElement = document.getElementById('classDuration');

    if (totalPeriodsElement) {
        totalPeriodsElement.textContent = currentPeriods.length;
    }

    if (classDurationElement && currentPeriods.length > 0) {
        const firstPeriod = currentPeriods[0];
        const lastPeriod = currentPeriods[currentPeriods.length - 1];
        if (firstPeriod.startTime && lastPeriod.endTime) {
            classDurationElement.textContent = `${firstPeriod.startTime} - ${lastPeriod.endTime}`;
        }
    }
}

async function savePeriodsConfig() {
    if (currentPeriods.length === 0) {
        showNotification('Cannot save empty period configuration', 'error');
        return;
    }

    // Validate periods
    for (let i = 0; i < currentPeriods.length; i++) {
        const period = currentPeriods[i];
        const duration = calculateDuration(period.startTime, period.endTime);

        if (duration <= 0) {
            showNotification(`Period ${period.number}: End time must be after start time`, 'error');
            return;
        }
    }

    const confirmMsg = `This will update periods for ALL timetables across all semesters and branches.\n\n` +
        `Total Periods: ${currentPeriods.length}\n` +
        `Duration: ${currentPeriods[0].startTime} - ${currentPeriods[currentPeriods.length - 1].endTime}\n\n` +
        `Continue?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        showNotification('Updating all timetables...', 'info');

        console.log('Sending periods update to:', `${SERVER_URL}/api/periods/update-all`);
        console.log('Periods data:', currentPeriods);

        const response = await fetch(`${SERVER_URL}/api/periods/update-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periods: currentPeriods })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Server returned non-JSON response:', text);
            showNotification('Server error: Expected JSON but got ' + contentType, 'error');
            return;
        }

        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok && data.success) {
            // Persist as local default so UI does not fall back to old hardcoded values
            saveDefaultPeriods(currentPeriods);

            // Keep currently loaded timetable (if any) in sync with new period config
            if (currentTimetable) {
                currentTimetable.periods = currentPeriods;
                renderAdvancedTimetableEditor(currentTimetable);
            }

            showNotification(`✅ Successfully updated ${data.updatedCount} timetables!`, 'success');
            loadPeriods(); // Reload to confirm
        } else {
            showNotification('Failed to update periods: ' + (data.error || data.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error saving periods:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}

async function resetPeriodsToDefault() {
    if (!confirm('Reset all periods to default configuration? This will affect ALL timetables.')) {
        return;
    }

    currentPeriods = getDefaultPeriods();
    renderPeriods();
    showNotification('Periods reset to default. Click "Save" to apply changes.', 'warning');
}


// ==================== ATTENDANCE HISTORY FUNCTIONS ====================

// Load Attendance Date Range
async function loadAttendanceDateRange() {
    try {
        console.log('📅 Loading attendance date range...');

        // Get all attendance history records to find date range
        const response = await fetch(`${SERVER_URL}/api/attendance/date-range`);

        if (response.ok) {
            const data = await response.json();

            if (data.success && data.dateRange) {
                const startDate = new Date(data.dateRange.earliest);
                const endDate = new Date(data.dateRange.latest);
                const totalRecords = data.dateRange.totalRecords || 0;

                document.getElementById('dataStartDate').textContent = startDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                document.getElementById('dataEndDate').textContent = endDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                document.getElementById('totalRecordsCount').textContent = totalRecords;

                console.log(`✅ Data available from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
                console.log(`   Total records: ${totalRecords}`);

                // Always set date filters to the full available range
                document.getElementById('attendanceStartDate').value = startDate.toISOString().split('T')[0];
                document.getElementById('attendanceEndDate').value = endDate.toISOString().split('T')[0];

                console.log(`📅 Date filters set to: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
            } else {
                // No data available yet
                document.getElementById('dataStartDate').textContent = 'No data yet';
                document.getElementById('dataEndDate').textContent = 'No data yet';
                document.getElementById('totalRecordsCount').textContent = '0';
            }
        } else {
            // Endpoint might not exist, try alternative method
            console.log('⚠️ Date range endpoint not available, using alternative method');
            await loadAttendanceDateRangeAlternative();
        }

    } catch (error) {
        console.error('❌ Error loading date range:', error);
        // Try alternative method
        await loadAttendanceDateRangeAlternative();
    }
}

// Alternative method to get date range (query all students)
async function loadAttendanceDateRangeAlternative() {
    try {
        // Get all students
        const studentsResponse = await fetch(`${SERVER_URL}/api/student-management`);
        const studentsData = await studentsResponse.json();

        if (!studentsData.success || !studentsData.students || studentsData.students.length === 0) {
            document.getElementById('dataStartDate').textContent = 'No data yet';
            document.getElementById('dataEndDate').textContent = 'No data yet';
            document.getElementById('totalRecordsCount').textContent = '0';
            return;
        }

        // Get first student's history to check date range
        const firstStudent = studentsData.students[0];
        const historyResponse = await fetch(`${SERVER_URL}/api/attendance/history/${firstStudent.enrollmentNo}`);
        const historyData = await historyResponse.json();

        if (historyData.success && historyData.history && historyData.history.length > 0) {
            const dates = historyData.history.map(h => new Date(h.date));
            const earliest = new Date(Math.min(...dates));
            const latest = new Date(Math.max(...dates));

            document.getElementById('dataStartDate').textContent = earliest.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            document.getElementById('dataEndDate').textContent = latest.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            document.getElementById('totalRecordsCount').textContent = historyData.history.length;

            // Auto-set date filters
            if (!document.getElementById('attendanceStartDate').value) {
                document.getElementById('attendanceStartDate').value = earliest.toISOString().split('T')[0];
            }
            if (!document.getElementById('attendanceEndDate').value) {
                document.getElementById('attendanceEndDate').value = latest.toISOString().split('T')[0];
            }
        } else {
            document.getElementById('dataStartDate').textContent = 'No data yet';
            document.getElementById('dataEndDate').textContent = 'No data yet';
            document.getElementById('totalRecordsCount').textContent = '0';
        }

    } catch (error) {
        console.error('❌ Error in alternative date range method:', error);
        document.getElementById('dataStartDate').textContent = 'Error loading';
        document.getElementById('dataEndDate').textContent = 'Error loading';
        document.getElementById('totalRecordsCount').textContent = '0';
    }
}

// Load Attendance History
async function loadAttendanceHistory() {
    try {
        console.log('📊 Loading attendance history...');

        // Get filters
        const semesterFilter = document.getElementById('attendanceSemesterFilter').value;
        const courseFilter = document.getElementById('attendanceCourseFilter').value;
        const tbody = document.getElementById('attendanceHistoryTableBody');

        // Check if required filters are selected
        if (!semesterFilter || !courseFilter) {
            console.log('⚠️ Branch and Semester must be selected');
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 60px;">
                        <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                        <h3 style="color: var(--text-primary); margin-bottom: 10px;">Select Branch and Semester</h3>
                        <p style="color: var(--text-secondary);">Please select a branch and semester to view attendance data</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Show loading indicator
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 60px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
                    <h3 style="color: var(--text-primary); margin-bottom: 10px;">Loading Attendance Data...</h3>
                    <p style="color: var(--text-secondary);">Please wait while we fetch the records</p>
                </td>
            </tr>
        `;

        // First, get the date range of available data
        await loadAttendanceDateRange();

        // Get all students from student-management (has semester/branch fields)
        const studentsResponse = await fetch(`${SERVER_URL}/api/student-management`);
        const studentsData = await studentsResponse.json();

        if (!studentsData.success) {
            throw new Error('Failed to load students');
        }

        const students = studentsData.students || [];
        console.log(`✅ Loaded ${students.length} students`);

        const startDate = document.getElementById('attendanceStartDate').value;
        const endDate = document.getElementById('attendanceEndDate').value;
        const searchQuery = document.getElementById('attendanceStudentSearch').value.toLowerCase();

        // Filter students
        let filteredStudents = students.filter(student => {
            if (semesterFilter && student.semester !== semesterFilter) return false;
            if (courseFilter && student.branch !== courseFilter) return false;
            if (searchQuery && !student.name.toLowerCase().includes(searchQuery) &&
                !student.enrollmentNo.toLowerCase().includes(searchQuery)) return false;
            return true;
        });

        console.log(`📋 Filtered to ${filteredStudents.length} students`);

        // Load attendance summary for each student
        const attendancePromises = filteredStudents.map(async (student) => {
            try {
                let url = `${SERVER_URL}/api/attendance/summary/${student.enrollmentNo}`;
                if (startDate && endDate) {
                    url += `?startDate=${startDate}&endDate=${endDate}`;
                }

                const response = await fetch(url);
                const data = await response.json();

                if (data.success && data.summary) {
                    return {
                        ...student,
                        summary: data.summary
                    };
                }
                return {
                    ...student,
                    summary: {
                        totalDays: 0,
                        presentDays: 0,
                        totalAttendedMinutes: 0,
                        totalClassMinutes: 0,
                        overallPercentage: 0,
                        subjects: []
                    }
                };
            } catch (error) {
                console.error(`Error loading attendance for ${student.name}:`, error);
                return {
                    ...student,
                    summary: {
                        totalDays: 0,
                        presentDays: 0,
                        totalAttendedMinutes: 0,
                        totalClassMinutes: 0,
                        overallPercentage: 0,
                        subjects: []
                    }
                };
            }
        });

        const studentsWithAttendance = await Promise.all(attendancePromises);

        console.log(`✅ Loaded attendance for ${studentsWithAttendance.length} students`);

        // Update summary cards
        const totalStudents = studentsWithAttendance.length;
        const avgAttendance = totalStudents > 0
            ? Math.round(studentsWithAttendance.reduce((sum, s) => sum + s.summary.overallPercentage, 0) / totalStudents)
            : 0;
        const totalDays = Math.max(...studentsWithAttendance.map(s => s.summary.totalDays), 0);
        const totalHours = Math.floor(studentsWithAttendance.reduce((sum, s) => sum + s.summary.totalAttendedMinutes, 0) / 60);

        console.log(`📊 Summary: ${totalStudents} students, ${avgAttendance}% avg, ${totalDays} days, ${totalHours}h`);

        document.getElementById('totalStudentsAttendance').textContent = totalStudents;
        document.getElementById('avgAttendanceRate').textContent = `${avgAttendance}%`;
        document.getElementById('totalDaysTracked').textContent = totalDays;
        const hoursEl = document.getElementById('totalHoursAttended') || document.getElementById('avgPeriodsPerDay');
        if (hoursEl) hoursEl.textContent = `${totalHours}h`;

        // Render table
        console.log('📋 Calling renderAttendanceHistoryTable...');
        renderAttendanceHistoryTable(studentsWithAttendance);
        console.log('✅ Attendance history loaded successfully');

    } catch (error) {
        console.error('❌ Error loading attendance history:', error);
        showNotification('Failed to load attendance history', 'error');
    }
}

// Render Attendance History Table
function renderAttendanceHistoryTable(students) {
    const tbody = document.getElementById('attendanceHistoryTableBody');

    console.log(`📋 Rendering ${students.length} students in attendance table`);

    if (!tbody) {
        console.error('❌ Table body element not found!');
        return;
    }

    tbody.innerHTML = '';

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px;">No attendance records found</td></tr>';
        return;
    }

    students.forEach((student, index) => {
        const summary = student.summary || {
            totalDays: 0,
            presentDays: 0,
            totalAttendedMinutes: 0,
            overallPercentage: 0
        };

        const totalAttendedMinutes = Number(summary.totalAttendedMinutes) || 0;
        const totalHours = Math.floor(totalAttendedMinutes / 60);
        const totalMinutes = totalAttendedMinutes % 60;

        console.log(`  ${index + 1}. ${student.name} - ${summary.overallPercentage}%`);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.enrollmentNo || 'N/A'}</td>
            <td>${student.name || 'Unknown'}</td>
            <td>${student.branch || 'N/A'}</td>
            <td>${student.semester || 'N/A'}</td>
            <td>${summary.totalDays}</td>
            <td>${summary.presentDays}</td>
            <td>
                <span class="attendance-badge ${getAttendanceBadgeClass(summary.overallPercentage)}">
                    ${summary.overallPercentage}%
                </span>
            </td>
            <td>${totalHours}h ${totalMinutes}m</td>
            <td>
                <span class="wifi-status-badge ${getWiFiStatusClass(student.wifiStatus || 'unknown')}">
                    ${getWiFiStatusText(student.wifiStatus || 'unknown')}
                </span>
            </td>
            <td>
                <button class="btn-icon" onclick="viewDetailedAttendance('${student.enrollmentNo}')" title="View Details">
                    👁️
                </button>
                <button class="btn-icon" onclick="exportStudentAttendance('${student.enrollmentNo}')" title="Export">
                    📥
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    console.log(`✅ Successfully rendered ${students.length} rows`);
}

// Get Attendance Badge Class
function getAttendanceBadgeClass(percentage) {
    if (percentage >= 75) return 'badge-success';
    if (percentage >= 60) return 'badge-warning';
    return 'badge-danger';
}

// Get WiFi Status Class
function getWiFiStatusClass(status) {
    switch (status) {
        case 'connected': return 'wifi-connected';
        case 'disconnected': return 'wifi-disconnected';
        case 'grace_period': return 'wifi-grace';
        case 'wrong_bssid': return 'wifi-wrong';
        default: return 'wifi-unknown';
    }
}

// Get WiFi Status Text
function getWiFiStatusText(status) {
    switch (status) {
        case 'connected': return '📶 Connected';
        case 'disconnected': return '📵 Offline';
        case 'grace_period': return '⏳ Grace Period';
        case 'wrong_bssid': return '🚫 Wrong WiFi';
        default: return '❓ Unknown';
    }
}

// View Detailed Attendance
// Level 1: View Student Overview (All Dates)
async function viewDetailedAttendance(enrollmentNo) {
    try {
        console.log(`📊 Loading attendance overview for ${enrollmentNo}...`);

        // Get student info from student-management (has semester/branch)
        const studentsResponse = await fetch(`${SERVER_URL}/api/student-management?enrollmentNo=${enrollmentNo}`);
        const studentsData = await studentsResponse.json();
        const student = studentsData.student || (studentsData.students || []).find(s => s.enrollmentNo === enrollmentNo);

        if (!student) {
            throw new Error('Student not found');
        }

        // Get date range
        const startDate = document.getElementById('attendanceStartDate').value;
        const endDate = document.getElementById('attendanceEndDate').value;

        // Use new endpoint for student dates overview
        let url = `${SERVER_URL}/api/attendance/student/${enrollmentNo}/dates`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to load attendance overview');
        }

        console.log(`✅ Loaded ${data.dates.length} days of attendance`);
        console.log(`   Overall: ${data.student.overallPercentage}%`);

        // Render Level 1: Student Overview
        renderStudentOverviewModal(student, data.student, data.dates);

    } catch (error) {
        console.error('❌ Error loading attendance overview:', error);
        showNotification('Failed to load attendance overview', 'error');
    }
}

// Level 2: View Specific Date Details
async function viewDateDetails(enrollmentNo, date, studentName) {
    try {
        console.log(`📅 Loading date details for ${enrollmentNo} on ${date}...`);

        const response = await fetch(`${SERVER_URL}/api/attendance/student/${enrollmentNo}/date/${date}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to load date details');
        }

        console.log(`✅ Loaded ${data.record.lectures.length} lectures`);

        // Render Level 2: Date Details
        renderDateDetailsModal(enrollmentNo, studentName, data.record);

    } catch (error) {
        console.error('❌ Error loading date details:', error);
        showNotification('Failed to load date details', 'error');
    }
}

// Level 3: View Specific Lecture Details
async function viewLectureDetails(enrollmentNo, date, period, studentName) {
    try {
        console.log(`📖 Loading lecture details for ${enrollmentNo} - ${period} on ${date}...`);

        const response = await fetch(`${SERVER_URL}/api/attendance/student/${enrollmentNo}/date/${date}/lecture/${period}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to load lecture details');
        }

        console.log(`✅ Loaded lecture: ${data.lecture.subject}`);

        // Render Level 3: Lecture Details
        renderLectureDetailsModal(enrollmentNo, studentName, date, data.lecture);

    } catch (error) {
        console.error('❌ Error loading lecture details:', error);
        showNotification('Failed to load lecture details', 'error');
    }
}

// ============================================
// LEVEL 1: Render Student Overview (All Dates)
// ============================================
function renderStudentOverviewModal(student, summary, dates) {
    const modal = document.getElementById('detailedAttendanceModal');
    const modalBody = document.getElementById('detailedAttendanceModalBody');

    modalBody.innerHTML = `
        <div class="attendance-detail-header">
            <button class="btn btn-secondary" onclick="closeDetailedAttendanceModal()">← Back</button>
            <h2>📊 ${student.name} - Attendance Overview</h2>
        </div>
        
        <div class="student-summary-card">
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Enrollment:</span>
                    <span class="summary-value">${student.enrollmentNo}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Course:</span>
                    <span class="summary-value">${student.branch} - Sem ${student.semester}</span>
                </div>
            </div>
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Total Days:</span>
                    <span class="summary-value">${summary.totalDays}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Present Days:</span>
                    <span class="summary-value">${summary.presentDays}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Overall Attendance:</span>
                    <span class="summary-value ${getAttendanceBadgeClass(summary.overallPercentage)}">${summary.overallPercentage}%</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Total Time:</span>
                    <span class="summary-value">${(summary.totalHours || 0)}h ${(summary.totalMinutes || 0)}m</span>
                </div>
            </div>
        </div>
        
        <h3>📅 Attendance by Date</h3>
        <div class="dates-list">
            ${dates.map(d => {
        const date = new Date(d.date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const attendedSec = Number(d.attended) || 0;  // now in minutes
        const totalSec    = Number(d.total)    || 0;  // now in minutes
        const attendedMin = attendedSec;  // already minutes
        const totalMin    = totalSec;     // already minutes
        const pct         = Number(d.percentage) || (d.status === 'present' ? 100 : 0);
        const timeStr     = totalMin > 0 ? `${attendedMin}/${totalMin} min` : (d.status === 'present' ? 'Present' : '—');

        return `
                    <div class="date-card" onclick="viewDateDetails('${student.enrollmentNo}', '${d.date}', '${student.name}')">
                        <div class="date-card-header">
                            <span class="date-text">${dateStr}</span>
                            <span class="attendance-badge ${getAttendanceBadgeClass(pct)}">${pct}%</span>
                        </div>
                        <div class="date-card-body">
                            <div class="date-stat">
                                <span class="stat-icon">📚</span>
                                <span>${d.lectureCount || 0} lectures</span>
                            </div>
                            <div class="date-stat">
                                <span class="stat-icon">⏱️</span>
                                <span>${timeStr}</span>
                            </div>
                            <div class="date-stat">
                                <span class="stat-icon">${d.status === 'present' ? '✅' : '❌'}</span>
                                <span>${d.status === 'present' ? 'Present' : 'Absent'}</span>
                            </div>
                        </div>
                        <div class="date-card-footer">
                            <span class="view-details-link">View Details →</span>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    modal.style.display = 'block';
}

// ============================================
// LEVEL 2: Render Date Details (All Lectures on a Date)
// ============================================
function renderDateDetailsModal(enrollmentNo, studentName, record) {
    const modal = document.getElementById('detailedAttendanceModal');
    const modalBody = document.getElementById('detailedAttendanceModalBody');

    const date = new Date(record.date);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const attendedMin = Number(record.totalAttended) || 0;   // already minutes
    const totalMin    = Number(record.totalClassTime) || 0;  // already minutes

    modalBody.innerHTML = `
        <div class="attendance-detail-header">
            <button class="btn btn-secondary" onclick="viewDetailedAttendance('${enrollmentNo}')">← Back to Overview</button>
            <h2>📅 ${studentName} - ${dateStr}</h2>
        </div>
        
        <div class="date-summary-card">
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Status:</span>
                    <span class="summary-value ${record.status === 'present' ? 'badge-success' : 'badge-danger'}">
                        ${record.status === 'present' ? '✅ Present' : '❌ Absent'}
                    </span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Day Attendance:</span>
                    <span class="summary-value ${getAttendanceBadgeClass(record.dayPercentage)}">${record.dayPercentage}%</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Time Attended:</span>
                    <span class="summary-value">${attendedMin} / ${totalMin} min</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Check-in:</span>
                    <span class="summary-value">${record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <h3>📚 Lectures</h3>
        <div class="lectures-list">
            ${record.lectures.map(lecture => {
        const attendedFormatted = lecture.attendedFormatted || formatSecondsToTime(lecture.attended);
        const totalFormatted = lecture.totalFormatted || formatSecondsToTime(lecture.total);

        return `
                    <div class="lecture-card ${lecture.present ? 'present' : 'absent'}" 
                         onclick="viewLectureDetails('${enrollmentNo}', '${record.date}', '${lecture.period}', '${studentName}')">
                        <div class="lecture-card-header">
                            <div class="lecture-info">
                                <span class="lecture-period">${lecture.period}</span>
                                <span class="lecture-time">${lecture.startTime} - ${lecture.endTime}</span>
                            </div>
                            <span class="attendance-badge ${getAttendanceBadgeClass(lecture.percentage)}">${lecture.percentage}%</span>
                        </div>
                        <div class="lecture-card-body">
                            <div class="lecture-subject">${lecture.subject}</div>
                            <div class="lecture-details">
                                <span class="lecture-detail">
                                    <span class="detail-icon">👨‍🏫</span>
                                    ${lecture.teacherName || 'N/A'}
                                </span>
                                <span class="lecture-detail">
                                    <span class="detail-icon">🏫</span>
                                    ${lecture.room || 'N/A'}
                                </span>
                            </div>
                            <div class="lecture-time-info">
                                <span class="time-attended">⏱️ ${attendedFormatted} / ${totalFormatted}</span>
                                <span class="status-badge ${lecture.present ? 'badge-success' : 'badge-danger'}">
                                    ${lecture.present ? '✅ Present' : '❌ Absent'}
                                </span>
                            </div>
                        </div>
                        <div class="lecture-card-footer">
                            <span class="view-details-link">View Timeline →</span>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    modal.style.display = 'block';
}

// ============================================
// LEVEL 3: Render Lecture Details (Timeline)
// ============================================
function renderLectureDetailsModal(enrollmentNo, studentName, date, lecture) {
    const modal = document.getElementById('detailedAttendanceModal');
    const modalBody = document.getElementById('detailedAttendanceModalBody');

    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    modalBody.innerHTML = `
        <div class="attendance-detail-header">
            <button class="btn btn-secondary" onclick="viewDateDetails('${enrollmentNo}', '${date}', '${studentName}')">← Back to Date</button>
            <h2>📖 ${lecture.period} - ${lecture.subject}</h2>
        </div>
        
        <div class="lecture-detail-card">
            <div class="lecture-detail-header">
                <h3>${studentName}</h3>
                <p>${dateStr}</p>
            </div>
            
            <div class="lecture-info-grid">
                <div class="info-item">
                    <span class="info-label">Period:</span>
                    <span class="info-value">${lecture.period}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Subject:</span>
                    <span class="info-value">${lecture.subject}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Teacher:</span>
                    <span class="info-value">${lecture.teacherName || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Room:</span>
                    <span class="info-value">${lecture.room || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Time:</span>
                    <span class="info-value">${lecture.startTime} - ${lecture.endTime}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Status:</span>
                    <span class="info-value ${lecture.present ? 'badge-success' : 'badge-danger'}">
                        ${lecture.present ? '✅ Present' : '❌ Absent'}
                    </span>
                </div>
            </div>
            
            <div class="time-breakdown-section">
                <h4>⏱️ Time Breakdown</h4>
                <div class="time-breakdown-grid">
                    <div class="time-item">
                        <span class="time-label">Attended:</span>
                        <span class="time-value">${lecture.timeBreakdown.hours}h ${lecture.timeBreakdown.minutes}m ${lecture.timeBreakdown.seconds}s</span>
                    </div>
                    <div class="time-item">
                        <span class="time-label">Total Duration:</span>
                        <span class="time-value">${lecture.totalDuration.hours}h ${lecture.totalDuration.minutes}m ${lecture.totalDuration.seconds}s</span>
                    </div>
                    <div class="time-item">
                        <span class="time-label">Attendance %:</span>
                        <span class="time-value ${getAttendanceBadgeClass(lecture.percentage)}">${lecture.percentage}%</span>
                    </div>
                </div>
            </div>
            
            <div class="timeline-section">
                <h4>📍 Timeline</h4>
                <div class="timeline">
                    <div class="timeline-item">
                        <span class="timeline-time">${lecture.startTime}</span>
                        <span class="timeline-event">🔔 Lecture Started</span>
                        <span class="timeline-detail">${new Date(lecture.lectureStartedAt).toLocaleTimeString()}</span>
                    </div>
                    
                    ${lecture.studentCheckIn ? `
                        <div class="timeline-item">
                            <span class="timeline-time">${new Date(lecture.studentCheckIn).toLocaleTimeString()}</span>
                            <span class="timeline-event">✅ Student Checked In</span>
                            <span class="timeline-detail">Face verified</span>
                        </div>
                    ` : ''}
                    
                    ${lecture.verifications && lecture.verifications.length > 0 ? lecture.verifications.map(v => `
                        <div class="timeline-item">
                            <span class="timeline-time">${new Date(v.time).toLocaleTimeString()}</span>
                            <span class="timeline-event">${v.type === 'random_ring' ? '🔔' : '👤'} ${v.event === 'random_ring' ? 'Random Ring Verified' : 'Face Verified'}</span>
                            <span class="timeline-detail">${v.success ? '✓ Success' : '✗ Failed'}</span>
                        </div>
                    `).join('') : ''}
                    
                    <div class="timeline-item">
                        <span class="timeline-time">${lecture.endTime}</span>
                        <span class="timeline-event">🏁 Lecture Ended</span>
                        <span class="timeline-detail">${new Date(lecture.lectureEndedAt).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
            
            ${lecture.verifications && lecture.verifications.length > 0 ? `
                <div class="verifications-section">
                    <h4>🔐 Verification Events</h4>
                    <div class="verifications-list">
                        ${lecture.verifications.map(v => `
                            <div class="verification-item ${v.success ? 'success' : 'failed'}">
                                <span class="verification-icon">${v.type === 'random_ring' ? '🔔' : '👤'}</span>
                                <div class="verification-info">
                                    <div class="verification-type">${v.event.replace('_', ' ').toUpperCase()}</div>
                                    <div class="verification-time">${new Date(v.time).toLocaleString()}</div>
                                </div>
                                <span class="verification-status ${v.success ? 'badge-success' : 'badge-danger'}">
                                    ${v.success ? '✓ Verified' : '✗ Failed'}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    modal.style.display = 'block';
}

// Helper function to format seconds to time
function formatSecondsToTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}h ${m}m ${s}s`;
    } else if (m > 0) {
        return `${m}m ${s}s`;
    } else {
        return `${s}s`;
    }
}

// OLD FUNCTION - Keep for backward compatibility
function renderDetailedAttendanceModal(student, history) {
    const modal = document.getElementById('detailedAttendanceModal');
    const modalBody = document.getElementById('detailedAttendanceModalBody');

    // Calculate totals
    const totalDays = history.length;
    const presentDays = history.filter(d => d.dayPresent).length;
    const totalAttendedMinutes = history.reduce((sum, d) => sum + d.totalAttendedMinutes, 0);
    const totalClassMinutes = history.reduce((sum, d) => sum + d.totalClassMinutes, 0);
    const overallPercentage = totalClassMinutes > 0
        ? Math.round((totalAttendedMinutes / totalClassMinutes) * 100)
        : 0;

    const totalHours = Math.floor(totalAttendedMinutes / 60);
    const totalMinutes = totalAttendedMinutes % 60;
    const totalSeconds = Math.round((totalAttendedMinutes * 60) % 60);

    const classHours = Math.floor(totalClassMinutes / 60);
    const classMinutes = totalClassMinutes % 60;

    // Group by subject
    const subjectStats = {};
    history.forEach(day => {
        day.periods.forEach(period => {
            if (!subjectStats[period.subject]) {
                subjectStats[period.subject] = {
                    subject: period.subject,
                    totalAttendedMinutes: 0,
                    totalClassMinutes: 0,
                    periodsAttended: 0,
                    totalPeriods: 0,
                    periods: []
                };
            }
            subjectStats[period.subject].totalAttendedMinutes += period.attendedMinutes || 0;
            subjectStats[period.subject].totalClassMinutes += period.totalMinutes || 0;
            subjectStats[period.subject].totalPeriods++;
            if (period.present) {
                subjectStats[period.subject].periodsAttended++;
            }
            subjectStats[period.subject].periods.push({
                date: day.date,
                ...period
            });
        });
    });

    // Calculate percentage for each subject
    Object.values(subjectStats).forEach(stat => {
        stat.percentage = stat.totalClassMinutes > 0
            ? Math.round((stat.totalAttendedMinutes / stat.totalClassMinutes) * 100)
            : 0;
    });

    modalBody.innerHTML = `
        <div class="detailed-attendance-header">
            <h2>📊 Detailed Attendance Report</h2>
            <div class="student-info-card">
                <h3>${student.name}</h3>
                <p><strong>Enrollment:</strong> ${student.enrollmentNo}</p>
                <p><strong>Branch:</strong> ${student.branch} | <strong>Semester:</strong> ${student.semester}</p>
            </div>
        </div>
        
        <div class="attendance-summary-grid">
            <div class="summary-item">
                <div class="summary-label">Overall Attendance</div>
                <div class="summary-value ${getAttendanceBadgeClass(overallPercentage)}">${overallPercentage}%</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Days Present</div>
                <div class="summary-value">${presentDays} / ${totalDays}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Total Time Attended</div>
                <div class="summary-value">${totalHours}h ${totalMinutes}m ${totalSeconds}s</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Total Class Time</div>
                <div class="summary-value">${classHours}h ${classMinutes}m</div>
            </div>
        </div>
        
        <div class="subject-wise-attendance">
            <h3>📚 Subject-wise Attendance</h3>
            <div class="subject-cards">
                ${Object.values(subjectStats).map(stat => `
                    <div class="subject-card">
                        <div class="subject-header">
                            <h4>${stat.subject}</h4>
                            <span class="attendance-badge ${getAttendanceBadgeClass(stat.percentage)}">
                                ${stat.percentage}%
                            </span>
                        </div>
                        <div class="subject-stats">
                            <div class="stat-row">
                                <span>Periods Attended:</span>
                                <strong>${stat.periodsAttended} / ${stat.totalPeriods}</strong>
                            </div>
                            <div class="stat-row">
                                <span>Time Attended:</span>
                                <strong>${Math.floor(stat.totalAttendedMinutes / 60)}h ${stat.totalAttendedMinutes % 60}m</strong>
                            </div>
                            <div class="stat-row">
                                <span>Total Class Time:</span>
                                <strong>${Math.floor(stat.totalClassMinutes / 60)}h ${stat.totalClassMinutes % 60}m</strong>
                            </div>
                        </div>
                        <button class="btn btn-sm" onclick="viewSubjectPeriods('${stat.subject}', ${JSON.stringify(stat.periods).replace(/"/g, '&quot;')})">
                            View All Periods
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="day-wise-attendance">
            <h3>📅 Day-wise Attendance</h3>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Day</th>
                            <th>Periods Attended</th>
                            <th>Time Attended</th>
                            <th>Total Class Time</th>
                            <th>Percentage</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(day => {
        const date = new Date(day.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const attendedHours = Math.floor(day.totalAttendedMinutes / 60);
        const attendedMinutes = day.totalAttendedMinutes % 60;
        const attendedSeconds = Math.round((day.totalAttendedSeconds || 0) % 60);
        const classHours = Math.floor(day.totalClassMinutes / 60);
        const classMinutes = day.totalClassMinutes % 60;

        return `
                                <tr>
                                    <td>${dateStr}</td>
                                    <td>${dayName}</td>
                                    <td>${day.periods.length}</td>
                                    <td>${attendedHours}h ${attendedMinutes}m ${attendedSeconds}s</td>
                                    <td>${classHours}h ${classMinutes}m</td>
                                    <td>
                                        <span class="attendance-badge ${getAttendanceBadgeClass(day.dayPercentage)}">
                                            ${day.dayPercentage}%
                                        </span>
                                    </td>
                                    <td>
                                        <span class="status-badge ${day.dayPresent ? 'badge-success' : 'badge-danger'}">
                                            ${day.dayPresent ? '✓ Present' : '✗ Absent'}
                                        </span>
                                    </td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="exportDetailedAttendance('${student.enrollmentNo}')">
                📥 Export Report
            </button>
            <button class="btn btn-primary" onclick="closeDetailedAttendanceModal()">
                Close
            </button>
        </div>
    `;

    modal.style.display = 'block';
}

// View Subject Periods
function viewSubjectPeriods(subject, periods) {
    const periodsData = typeof periods === 'string' ? JSON.parse(periods.replace(/&quot;/g, '"')) : periods;

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = `
        <h2>📚 ${subject} - All Periods</h2>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Room</th>
                        <th>Attended</th>
                        <th>Total</th>
                        <th>%</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${periodsData.map(period => {
        const date = new Date(period.date);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const attendedHours = Math.floor((period.attendedMinutes || 0) / 60);
        const attendedMinutes = (period.attendedMinutes || 0) % 60;
        const attendedSeconds = Math.round((period.attendedSeconds || 0) % 60);
        const totalHours = Math.floor((period.totalMinutes || 0) / 60);
        const totalMinutes = (period.totalMinutes || 0) % 60;

        return `
                            <tr>
                                <td>${dateStr}</td>
                                <td>${period.startTime} - ${period.endTime}</td>
                                <td>${period.room || '-'}</td>
                                <td>${attendedHours}h ${attendedMinutes}m ${attendedSeconds}s</td>
                                <td>${totalHours}h ${totalMinutes}m</td>
                                <td>
                                    <span class="attendance-badge ${getAttendanceBadgeClass(period.percentage || 0)}">
                                        ${period.percentage || 0}%
                                    </span>
                                </td>
                                <td>
                                    <span class="status-badge ${period.present ? 'badge-success' : 'badge-danger'}">
                                        ${period.present ? '✓' : '✗'}
                                    </span>
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    modal.style.display = 'block';
}

// Close Detailed Attendance Modal
function closeDetailedAttendanceModal() {
    document.getElementById('detailedAttendanceModal').style.display = 'none';
}

// Export Student Attendance
async function exportStudentAttendance(enrollmentNo) {
    try {
        const startDate = document.getElementById('attendanceStartDate').value;
        const endDate = document.getElementById('attendanceEndDate').value;

        let url = `${SERVER_URL}/api/attendance/history/${enrollmentNo}`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to load attendance data');
        }

        // Convert to CSV
        const csv = convertAttendanceToCSV(data.history);

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url2 = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url2;
        a.download = `attendance_${enrollmentNo}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();

        showNotification('Attendance exported successfully', 'success');

    } catch (error) {
        console.error('❌ Error exporting attendance:', error);
        showNotification('Failed to export attendance', 'error');
    }
}

// Convert Attendance to CSV
function convertAttendanceToCSV(history) {
    let csv = 'Date,Day,Periods,Time Attended (min),Total Class Time (min),Percentage,Status\n';

    history.forEach(day => {
        const date = new Date(day.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US');

        csv += `${dateStr},${dayName},${day.periods.length},${day.totalAttendedMinutes},${day.totalClassMinutes},${day.dayPercentage}%,${day.dayPresent ? 'Present' : 'Absent'}\n`;
    });

    return csv;
}

// Setup Attendance History Event Listeners
function setupAttendanceHistoryListeners() {
    const refreshBtn = document.getElementById('refreshAttendanceBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const fetchBtn = document.getElementById('fetchAttendanceBtn');
            if (fetchBtn && !fetchBtn.disabled) {
                loadAttendanceHistory();
            }
        });
    }

    const exportBtn = document.getElementById('exportAttendanceBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAllAttendance);
    }

    // Enable fetch button when both branch and semester are selected
    const courseFilter = document.getElementById('attendanceCourseFilter');
    const semesterFilter = document.getElementById('attendanceSemesterFilter');
    const fetchBtn = document.getElementById('fetchAttendanceBtn');

    function checkRequiredFilters() {
        const courseSelected = courseFilter && courseFilter.value !== '';
        const semesterSelected = semesterFilter && semesterFilter.value !== '';

        if (fetchBtn) {
            fetchBtn.disabled = !(courseSelected && semesterSelected);

            if (courseSelected && semesterSelected) {
                fetchBtn.textContent = `📊 Fetch ${courseFilter.options[courseFilter.selectedIndex].text} - Semester ${semesterFilter.value}`;
            } else {
                fetchBtn.textContent = '📊 Fetch Attendance Data';
            }
        }
    }

    if (courseFilter) {
        courseFilter.addEventListener('change', checkRequiredFilters);
    }

    if (semesterFilter) {
        semesterFilter.addEventListener('change', checkRequiredFilters);
    }

    // Fetch button click
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            if (!fetchBtn.disabled) {
                // Show secondary filters
                const secondaryFilters = document.getElementById('secondaryFilters');
                if (secondaryFilters) {
                    secondaryFilters.style.display = 'flex';
                }

                // Load attendance data
                await loadAttendanceHistory();
            }
        });
    }

    // Search input (only works after data is loaded)
    const searchInput = document.getElementById('attendanceStudentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const secondaryFilters = document.getElementById('secondaryFilters');
            if (secondaryFilters && secondaryFilters.style.display !== 'none') {
                loadAttendanceHistory();
            }
        }, 500));
    }
}

// Export All Attendance
async function exportAllAttendance() {
    showNotification('Exporting all attendance data...', 'info');

    try {
        // Fetch all attendance data from server
        const response = await fetch('/api/attendance/all');
        const attendanceData = await response.json();

        if (!attendanceData || attendanceData.length === 0) {
            showNotification('No attendance data to export', 'warning');
            return;
        }

        // Create comprehensive attendance export
        const headers = [
            'Date',
            'Student ID',
            'Student Name',
            'Course',
            'Semester',
            'Subject Code',
            'Subject Name',
            'Period',
            'Status',
            'Verification Method',
            'WiFi Status',
            'Timestamp',
            'Teacher ID',
            'Teacher Name',
            'Classroom',
            'Latitude',
            'Longitude',
            'Device Info'
        ];

        const rows = attendanceData.map(record => [
            record.date || '',
            record.studentId || '',
            record.studentName || '',
            record.course || '',
            record.semester || '',
            record.subjectCode || '',
            record.subjectName || '',
            record.period || '',
            record.status || '',
            record.verificationType || '',
            record.wifiStatus || '',
            record.timestamp || '',
            record.teacherId || '',
            record.teacherName || '',
            record.classroom || '',
            record.latitude || '',
            record.longitude || '',
            record.deviceInfo || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const filename = `all_attendance_${new Date().toISOString().split('T')[0]}.csv`;
        downloadCSV(csvContent, filename);
        showNotification('All attendance data exported successfully', 'success');

    } catch (error) {
        console.error('❌ Error exporting all attendance:', error);
        showNotification('Failed to export attendance data', 'error');
    }
}

// Export Attendance Data (General function)
async function exportAttendanceData() {
    showNotification('Preparing attendance export...', 'info');

    try {
        // Get date range from user input or use default
        const startDate = document.getElementById('exportStartDate')?.value ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
        const endDate = document.getElementById('exportEndDate')?.value ||
            new Date().toISOString().split('T')[0]; // Today

        // Fetch attendance data for date range
        const response = await fetch(`/api/attendance/export?startDate=${startDate}&endDate=${endDate}`);

        if (!response.ok) {
            throw new Error('Failed to fetch attendance data');
        }

        const data = await response.json();

        if (!data.attendance || data.attendance.length === 0) {
            showNotification('No attendance data found for the selected period', 'warning');
            return;
        }

        // Create comprehensive CSV export
        const headers = [
            'Date',
            'Day',
            'Student ID',
            'Student Name',
            'Course',
            'Semester',
            'Subject Code',
            'Subject Name',
            'Period Time',
            'Period Number',
            'Attendance Status',
            'Verification Type',
            'Verification Time',
            'WiFi Connected',
            'WiFi BSSID',
            'Teacher ID',
            'Teacher Name',
            'Classroom',
            'Location Verified',
            'Face Verification Score',
            'Device Model',
            'App Version',
            'Remarks'
        ];

        const rows = data.attendance.map(record => [
            record.date || '',
            record.dayOfWeek || '',
            record.studentId || '',
            record.studentName || '',
            record.course || '',
            record.semester || '',
            record.subjectCode || '',
            record.subjectName || '',
            record.periodTime || '',
            record.periodNumber || '',
            record.status || '',
            record.verificationType || '',
            record.verificationTime || '',
            record.wifiConnected ? 'Yes' : 'No',
            record.wifiBSSID || '',
            record.teacherId || '',
            record.teacherName || '',
            record.classroom || '',
            record.locationVerified ? 'Yes' : 'No',
            record.faceVerificationScore || '',
            record.deviceModel || '',
            record.appVersion || '',
            record.remarks || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const filename = `attendance_data_${startDate}_to_${endDate}.csv`;
        downloadCSV(csvContent, filename);

        showNotification(`Attendance data exported successfully (${data.attendance.length} records)`, 'success');

    } catch (error) {
        console.error('❌ Error exporting attendance data:', error);
        showNotification('Failed to export attendance data', 'error');
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize attendance history when section is shown
document.addEventListener('DOMContentLoaded', () => {
    setupAttendanceHistoryListeners();

    // Show instruction message when attendance section is clicked
    const attendanceNavBtn = document.querySelector('[data-section="attendance"]');
    if (attendanceNavBtn) {
        attendanceNavBtn.addEventListener('click', () => {
            setTimeout(() => {
                // Show initial instruction if no data loaded
                const tbody = document.getElementById('attendanceHistoryTableBody');
                if (tbody && tbody.children.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="9" style="text-align: center; padding: 60px;">
                                <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                                <h3 style="color: var(--text-primary); margin-bottom: 10px;">Welcome to Attendance History</h3>
                                <p style="color: var(--text-secondary); margin-bottom: 20px;">Select a branch and semester above to view detailed attendance records</p>
                                <div style="display: flex; gap: 10px; justify-content: center; align-items: center; color: var(--text-secondary); font-size: 14px;">
                                    <span>1️⃣ Select Branch</span>
                                    <span>→</span>
                                    <span>2️⃣ Select Semester</span>
                                    <span>→</span>
                                    <span>3️⃣ Click Fetch</span>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            }, 100);
        });
    }
});


// ========================================
// Subject Management
// ========================================

async function loadSubjects() {
    try {
        const semester = document.getElementById('subjectSemesterFilter').value;
        const branch = document.getElementById('subjectBranchFilter').value;
        const type = document.getElementById('subjectTypeFilter').value;
        const status = document.getElementById('subjectStatusFilter')?.value;

        let url = `${SERVER_URL}/api/subjects?`;
        if (semester) url += `semester=${semester}&`;
        if (branch) url += `branch=${encodeURIComponent(branch)}&`;
        if (type) url += `type=${type}&`;
        if (status) url += `isActive=${status === 'active'}&`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            subjects = data.subjects;
            renderSubjectsTable();
        }

        // Attach button listeners after section is loaded
        attachSubjectButtonListeners();
    } catch (error) {
        console.error('Error loading subjects:', error);
        showNotification('Failed to load subjects', 'error');
    }
}

function attachSubjectButtonListeners() {
    const addBtn = document.getElementById('addSubjectBtn');
    if (addBtn) {
        addBtn.onclick = function () {
            showAddSubjectDialog();
        };
        console.log('✅ Add Subject button listener attached');
    }

    // Subject management buttons
    const exportBtn = document.getElementById('exportSubjectsBtn');
    if (exportBtn) {
        exportBtn.onclick = exportSubjectsToCSV;
    }

    const importBtn = document.getElementById('importSubjectsBtn');
    if (importBtn) {
        importBtn.onclick = importSubjectsFromCSV;
    }

    const bulkEditBtn = document.getElementById('bulkEditSubjectsBtn');
    if (bulkEditBtn) {
        bulkEditBtn.onclick = showBulkEditDialog;
    }

    const bulkDeleteBtn = document.getElementById('bulkDeleteSubjectsBtn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.onclick = bulkDeleteSelectedSubjects;
    }

    // Subject search
    const searchInput = document.getElementById('subjectSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchSubjects(e.target.value);
        });
    }

    // Subject status filter
    const statusFilter = document.getElementById('subjectStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', loadSubjects);
    }
}

// Track selected subjects — declared at top of file
function renderSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');

    if (subjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No subjects found</td></tr>';
        return;
    }

    tbody.innerHTML = subjects.map(subject => `
        <tr>
            <td>
                <input 
                    type="checkbox" 
                    class="subject-checkbox" 
                    data-subject-code="${subject.subjectCode}"
                    onchange="toggleSubjectSelection('${subject.subjectCode}', this.checked)"
                    ${selectedSubjects.has(subject.subjectCode) ? 'checked' : ''}
                >
            </td>
            <td><strong>${subject.subjectCode}</strong></td>
            <td>${subject.subjectName}</td>
            <td>${subject.shortName || '-'}</td>
            <td>Sem ${subject.semester}</td>
            <td>${subject.branch}</td>
            <td>${subject.credits}</td>
            <td><span class="badge badge-${subject.type.toLowerCase()}">${subject.type}</span></td>
            <td><span class="badge badge-${subject.isActive ? 'success' : 'danger'}">${subject.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn-icon" onclick="duplicateSubject('${subject.subjectCode}')" title="Duplicate">📋</button>
                <button class="btn-icon" onclick="editSubject('${subject.subjectCode}')" title="Edit">✏️</button>
                <button class="btn-icon" onclick="deleteSubject('${subject.subjectCode}')" title="Delete">🗑️</button>
            </td>
        </tr>
    `).join('');

    updateBulkActionsBar();
}

// Toggle subject selection
function toggleSubjectSelection(subjectCode, isChecked) {
    if (isChecked) {
        selectedSubjects.add(subjectCode);
    } else {
        selectedSubjects.delete(subjectCode);
    }
    updateBulkActionsBar();
}

// Toggle all subjects
function toggleAllSubjects(isChecked) {
    selectedSubjects.clear();
    if (isChecked) {
        subjects.forEach(subject => selectedSubjects.add(subject.subjectCode));
    }
    renderSubjectsTable();
}

// Update bulk actions bar
function updateBulkActionsBar() {
    const bar = document.getElementById('subjectBulkActionsBar');
    const count = document.getElementById('subjectSelectedCount');

    if (selectedSubjects.size > 0) {
        bar.style.display = 'block';
        count.textContent = `${selectedSubjects.size} subject${selectedSubjects.size > 1 ? 's' : ''} selected`;
    } else {
        bar.style.display = 'none';
    }

    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllSubjects');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = selectedSubjects.size === subjects.length && subjects.length > 0;
    }
}

// Clear selection
function clearSubjectSelection() {
    selectedSubjects.clear();
    renderSubjectsTable();
}

function showAddSubjectDialog() {
    console.log('🎯 showAddSubjectDialog called');
    try {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add New Subject</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div style="padding: 10px 20px; background: rgba(0, 217, 255, 0.1); border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-secondary);">
                <span style="color: var(--danger);">*</span> Required fields
            </div>
            <div class="modal-body">
                <form id="addSubjectForm" novalidate>
                    <div class="form-group required">
                        <label for="subjectCode">Subject Code</label>
                        <input type="text" id="subjectCode" name="subjectCode" required 
                               placeholder="e.g., CS301" 
                               title="Enter a unique subject code (e.g., CS301, ENG202, 202)">
                        <div class="validation-message" id="subjectCodeError"></div>
                    </div>
                    <div class="form-group required">
                        <label for="subjectName">Subject Name</label>
                        <input type="text" id="subjectName" name="subjectName" required 
                               placeholder="e.g., Data Structures"
                               minlength="3" maxlength="100">
                        <div class="validation-message" id="subjectNameError"></div>
                    </div>
                    <div class="form-group">
                        <label for="shortName">Short Name</label>
                        <input type="text" id="shortName" name="shortName" 
                               placeholder="e.g., DS" maxlength="20">
                        <div class="validation-message" id="shortNameError"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group required">
                            <label for="semester">Semester</label>
                            <select id="semester" name="semester" required>
                                <option value="">-- Select Semester --</option>
                                ${generateSemesterOptions()}
                            </select>
                            <div class="validation-message" id="semesterError"></div>
                        </div>
                        <div class="form-group required">
                            <label for="branch">Branch</label>
                            <select id="branch" name="branch" required>
                                <option value="">-- Select Branch --</option>
                                ${generateBranchOptions()}
                            </select>
                            <div class="validation-message" id="branchError"></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="credits">Credits</label>
                            <input type="number" id="credits" name="credits" value="3" min="1" max="6">
                            <div class="validation-message" id="creditsError"></div>
                        </div>
                        <div class="form-group required">
                            <label for="type">Type</label>
                            <select id="type" name="type" required>
                                <option value="">-- Select Type --</option>
                                <option value="Theory" selected>Theory</option>
                                <option value="Lab">Lab</option>
                                <option value="Practical">Practical</option>
                                <option value="Training">Training</option>
                            </select>
                            <div class="validation-message" id="typeError"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea id="description" name="description" rows="3" 
                                  placeholder="Subject description..." maxlength="500"></textarea>
                        <div class="validation-message" id="descriptionError"></div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveNewSubject()">Add Subject</button>
            </div>
        </div>
    `;
        document.body.appendChild(dialog);
        console.log('✅ Dialog added to body');

        // Add real-time validation
        setupSubjectFormValidation();

    } catch (error) {
        console.error('❌ Error in showAddSubjectDialog:', error);
        alert('Error opening dialog: ' + error.message);
    }
}

function setupSubjectFormValidation() {
    // Simple setup - just clear errors when user starts typing
    const fields = ['subjectCode', 'subjectName', 'semester', 'branch', 'type'];

    fields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (input) {
            input.addEventListener('input', () => {
                // Clear error when user starts typing/selecting
                const errorDiv = document.getElementById(fieldId + 'Error');
                if (errorDiv) {
                    errorDiv.textContent = '';
                    errorDiv.classList.remove('error');
                }
                input.classList.remove('invalid');
            });
        }
    });
}

function validateSubjectForm() {
    console.log('🔍 Validating subject form...');

    // Simple validation - just check required fields
    const subjectCode = document.getElementById('subjectCode').value.trim();
    const subjectName = document.getElementById('subjectName').value.trim();
    const semester = document.getElementById('semester').value;
    const branch = document.getElementById('branch').value;
    const type = document.getElementById('type').value;

    console.log('Form values:', { subjectCode, subjectName, semester, branch, type });

    // Clear all previous errors
    document.querySelectorAll('.validation-message').forEach(el => {
        el.textContent = '';
        el.classList.remove('error');
    });
    document.querySelectorAll('.form-input, .form-select').forEach(el => {
        el.classList.remove('invalid', 'valid');
    });

    let isValid = true;
    let firstErrorField = null;

    // Check Subject Code
    if (!subjectCode) {
        document.getElementById('subjectCodeError').textContent = 'Subject Code is required';
        document.getElementById('subjectCodeError').classList.add('error');
        document.getElementById('subjectCode').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('subjectCode');
    } else if (subjectCode.length < 2) {
        document.getElementById('subjectCodeError').textContent = 'Subject Code must be at least 2 characters';
        document.getElementById('subjectCodeError').classList.add('error');
        document.getElementById('subjectCode').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('subjectCode');
    } else {
        document.getElementById('subjectCode').classList.add('valid');
    }

    // Check Subject Name
    if (!subjectName) {
        document.getElementById('subjectNameError').textContent = 'Subject Name is required';
        document.getElementById('subjectNameError').classList.add('error');
        document.getElementById('subjectName').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('subjectName');
    } else if (subjectName.length < 3) {
        document.getElementById('subjectNameError').textContent = 'Subject Name must be at least 3 characters';
        document.getElementById('subjectNameError').classList.add('error');
        document.getElementById('subjectName').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('subjectName');
    } else {
        document.getElementById('subjectName').classList.add('valid');
    }

    // Check Semester
    if (!semester) {
        document.getElementById('semesterError').textContent = 'Please select a semester';
        document.getElementById('semesterError').classList.add('error');
        document.getElementById('semester').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('semester');
    } else {
        document.getElementById('semester').classList.add('valid');
    }

    // Check Branch
    if (!branch) {
        document.getElementById('branchError').textContent = 'Please select a branch';
        document.getElementById('branchError').classList.add('error');
        document.getElementById('branch').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('branch');
    } else {
        document.getElementById('branch').classList.add('valid');
    }

    // Check Type
    if (!type) {
        document.getElementById('typeError').textContent = 'Please select a type';
        document.getElementById('typeError').classList.add('error');
        document.getElementById('type').classList.add('invalid');
        isValid = false;
        if (!firstErrorField) firstErrorField = document.getElementById('type');
    } else {
        document.getElementById('type').classList.add('valid');
    }

    if (!isValid && firstErrorField) {
        firstErrorField.focus();
        showNotification('Please fix the errors highlighted in red', 'error');
    }

    console.log('Validation result:', isValid);
    return isValid;
}

async function saveNewSubject() {
    console.log('🔄 saveNewSubject called');

    // TEMPORARY: Skip validation for testing
    // if (!validateSubjectForm()) {
    //     console.log('❌ Form validation failed');
    //     return;
    // }

    console.log('✅ Skipping validation for testing');

    // Test server connection first
    try {
        console.log('🔍 Testing server connection...');
        const testResponse = await fetch(`${SERVER_URL}/api/health`);
        console.log('🏥 Health check status:', testResponse.status);
        if (!testResponse.ok) {
            showNotification('Server is not responding. Please check if the server is running.', 'error');
            return;
        }
    } catch (error) {
        console.error('❌ Server connection failed:', error);
        showNotification('Cannot connect to server. Please check if the server is running.', 'error');
        return;
    }

    const subjectCode = document.getElementById('subjectCode')?.value?.trim() || '';
    const subjectName = document.getElementById('subjectName')?.value?.trim() || '';
    const shortName = document.getElementById('shortName')?.value?.trim() || '';
    const semester = document.getElementById('semester')?.value || '';
    const branch = document.getElementById('branch')?.value || '';
    const credits = document.getElementById('credits')?.value || '3';
    const type = document.getElementById('type')?.value || 'Theory';
    const description = document.getElementById('description')?.value?.trim() || '';

    console.log('📋 Form values:', {
        subjectCode,
        subjectName,
        shortName,
        semester,
        branch,
        credits,
        type,
        description
    });

    // Show loading state
    const saveButton = document.querySelector('.modal-footer .btn-primary');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Adding...';
    saveButton.disabled = true;

    try {
        const payload = {
            subjectCode: subjectCode.toUpperCase(), // Ensure uppercase
            subjectName,
            shortName: shortName || subjectName,
            semester,
            branch,
            credits: parseInt(credits) || 3,
            type,
            description
        };

        console.log('📤 Sending payload:', payload);
        console.log('🌐 Server URL:', SERVER_URL);

        const response = await fetch(`${SERVER_URL}/api/subjects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 Server response:', data);
        console.log('📊 Response status:', response.status);

        if (data.success) {
            showNotification(`Subject "${subjectCode}" added successfully`, 'success');
            document.querySelector('.modal-overlay').remove();
            loadSubjects();
        } else {
            // Handle specific server errors
            if (data.error.includes('already exists')) {
                document.getElementById('subjectCodeError').textContent = 'This subject code already exists';
                document.getElementById('subjectCodeError').classList.add('error');
                document.getElementById('subjectCode').classList.add('invalid');
                document.getElementById('subjectCode').focus();
            } else {
                showNotification(data.error || 'Failed to add subject', 'error');
            }
        }
    } catch (error) {
        console.error('Error adding subject:', error);
        showNotification('Network error: Failed to add subject', 'error');
    } finally {
        // Restore button state
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

async function editSubject(subjectCode) {
    try {
        const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`);
        const data = await response.json();

        if (!data.success) {
            showNotification('Subject not found', 'error');
            return;
        }

        const subject = data.subject;

        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Subject</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <form id="editSubjectForm">
                        <div class="form-group">
                            <label>Subject Code</label>
                            <input type="text" value="${subject.subjectCode}" disabled>
                        </div>
                        <div class="form-group">
                            <label>Subject Name *</label>
                            <input type="text" id="editSubjectName" value="${subject.subjectName}" required>
                        </div>
                        <div class="form-group">
                            <label>Short Name</label>
                            <input type="text" id="editShortName" value="${subject.shortName || ''}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Semester *</label>
                                <select id="editSemester" required>
                                    ${dynamicData.semesters.map(s => `<option value="${s}" ${s == subject.semester ? 'selected' : ''}>Semester ${s}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Branch *</label>
                                <select id="editBranch" required>
                                    ${dynamicData.branches.map(c => `<option value="${c.value}" ${c.value === subject.branch ? 'selected' : ''}>${c.label}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Credits</label>
                                <input type="number" id="editCredits" value="${subject.credits}" min="1" max="6">
                            </div>
                            <div class="form-group">
                                <label>Type *</label>
                                <select id="editType" required>
                                    <option value="Theory" ${subject.type === 'Theory' ? 'selected' : ''}>Theory</option>
                                    <option value="Lab" ${subject.type === 'Lab' ? 'selected' : ''}>Lab</option>
                                    <option value="Practical" ${subject.type === 'Practical' ? 'selected' : ''}>Practical</option>
                                    <option value="Training" ${subject.type === 'Training' ? 'selected' : ''}>Training</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="editDescription" rows="3">${subject.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="editIsActive" ${subject.isActive ? 'checked' : ''}>
                                Active
                            </label>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveEditedSubject('${subjectCode}')">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    } catch (error) {
        console.error('Error loading subject:', error);
        showNotification('Failed to load subject', 'error');
    }
}

async function saveEditedSubject(subjectCode) {
    const subjectName = document.getElementById('editSubjectName').value;
    const shortName = document.getElementById('editShortName').value;
    const semester = document.getElementById('editSemester').value;
    const branch = document.getElementById('editBranch').value;
    const credits = document.getElementById('editCredits').value;
    const type = document.getElementById('editType').value;
    const description = document.getElementById('editDescription').value;
    const isActive = document.getElementById('editIsActive').checked;

    try {
        const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjectName,
                shortName,
                semester,
                branch,
                credits: parseInt(credits),
                type,
                description,
                isActive
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Subject updated successfully', 'success');
            document.querySelector('.modal-overlay').remove();
            loadSubjects();
        } else {
            showNotification(data.error || 'Failed to update subject', 'error');
        }
    } catch (error) {
        console.error('Error updating subject:', error);
        showNotification('Failed to update subject', 'error');
    }
}

async function deleteSubject(subjectCode) {
    if (!confirm(`Are you sure you want to delete subject ${subjectCode}?`)) {
        return;
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Subject deleted successfully', 'success');
            loadSubjects();
        } else {
            showNotification(data.error || 'Failed to delete subject', 'error');
        }
    } catch (error) {
        console.error('Error deleting subject:', error);
        showNotification('Failed to delete subject', 'error');
    }
}

// Duplicate subject
async function duplicateSubject(subjectCode) {
    try {
        const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`);
        const data = await response.json();

        if (!data.success) {
            showNotification('Failed to load subject', 'error');
            return;
        }

        const subject = data.subject;

        // Show dialog to select new semester/branch
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <h2>📋 Duplicate Subject</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                Duplicating: <strong>${subject.subjectName} (${subject.subjectCode})</strong>
            </p>
            <form id="duplicateSubjectForm">
                <div class="form-group">
                    <label>New Subject Code *</label>
                    <input type="text" id="newSubjectCode" class="form-input" required placeholder="e.g., CS401">
                </div>
                <div class="form-group">
                    <label>Semester *</label>
                    <select id="newSemester" class="form-select" required>
                        <option value="">Select Semester</option>
                        ${dynamicData.semesters.map(s => `<option value="${s}" ${s == subject.semester ? 'selected' : ''}>Semester ${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Branch *</label>
                    <select id="newBranch" class="form-select" required>
                        <option value="">Select Branch</option>
                        ${dynamicData.branches.map(c => `<option value="${c.value}" ${c.value === subject.branch ? 'selected' : ''}>${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">📋 Duplicate</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        `;

        document.getElementById('duplicateSubjectForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const newSubject = {
                subjectCode: document.getElementById('newSubjectCode').value,
                subjectName: subject.subjectName,
                shortName: subject.shortName,
                semester: document.getElementById('newSemester').value,
                branch: document.getElementById('newBranch').value,
                credits: subject.credits,
                type: subject.type,
                description: subject.description,
                isActive: subject.isActive
            };

            try {
                const response = await fetch(`${SERVER_URL}/api/subjects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSubject)
                });

                const data = await response.json();

                if (data.success) {
                    showNotification('Subject duplicated successfully', 'success');
                    closeModal();
                    loadSubjects();
                } else {
                    showNotification(data.error || 'Failed to duplicate subject', 'error');
                }
            } catch (error) {
                console.error('Error duplicating subject:', error);
                showNotification('Failed to duplicate subject', 'error');
            }
        });

        openModal();
    } catch (error) {
        console.error('Error loading subject:', error);
        showNotification('Failed to load subject', 'error');
    }
}

// Bulk activate subjects
async function bulkActivateSubjects() {
    if (selectedSubjects.size === 0) {
        showNotification('No subjects selected', 'warning');
        return;
    }

    if (!confirm(`Activate ${selectedSubjects.size} subject(s)?`)) {
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const subjectCode of selectedSubjects) {
        try {
            const subject = subjects.find(s => s.subjectCode === subjectCode);
            if (!subject) continue;

            const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...subject, isActive: true })
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
        }
    }

    showNotification(`Activated ${successCount} subject(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
    clearSubjectSelection();
    loadSubjects();
}

// Bulk deactivate subjects
async function bulkDeactivateSubjects() {
    if (selectedSubjects.size === 0) {
        showNotification('No subjects selected', 'warning');
        return;
    }

    if (!confirm(`Deactivate ${selectedSubjects.size} subject(s)?`)) {
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const subjectCode of selectedSubjects) {
        try {
            const subject = subjects.find(s => s.subjectCode === subjectCode);
            if (!subject) continue;

            const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...subject, isActive: false })
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
        }
    }

    showNotification(`Deactivated ${successCount} subject(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
    clearSubjectSelection();
    loadSubjects();
}

// Bulk duplicate subjects
async function bulkDuplicateSubjects() {
    if (selectedSubjects.size === 0) {
        showNotification('No subjects selected', 'warning');
        return;
    }

    // Show dialog to select target semester/branch
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>📋 Bulk Duplicate Subjects</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Duplicating ${selectedSubjects.size} subject(s) to a new semester/branch
        </p>
        <form id="bulkDuplicateForm">
            <div class="form-group">
                <label>Target Semester *</label>
                <select id="targetSemester" class="form-select" required>
                    <option value="">Select Semester</option>
                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(s => `<option value="${s}">Semester ${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Target Branch *</label>
                <select id="targetBranch" class="form-select" required>
                    <option value="">Select Branch</option>
                    <option value="B.Tech Computer Science">Computer Science (CS)</option>
                    <option value="B.Tech Data Science">Data Science (DS)</option>
                    <option value="B.Tech Information Technology">Information Technology (IT)</option>
                    <option value="B.Tech Artificial Intelligence">Artificial Intelligence (AI)</option>
                    <option value="B.Tech Electronics">Electronics (EC)</option>
                    <option value="B.Tech Mechanical">Mechanical (ME)</option>
                    <option value="B.Tech Civil">Civil (CE)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Subject Code Prefix (optional)</label>
                <input type="text" id="codePrefix" class="form-input" placeholder="e.g., CS4 (will create CS401, CS402, etc.)">
                <small style="color: var(--text-secondary);">Leave empty to keep original codes</small>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">📋 Duplicate All</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('bulkDuplicateForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const targetSemester = document.getElementById('targetSemester').value;
        const targetBranch = document.getElementById('targetBranch').value;
        const codePrefix = document.getElementById('codePrefix').value;

        let successCount = 0;
        let errorCount = 0;
        let counter = 1;

        for (const subjectCode of selectedSubjects) {
            try {
                const subject = subjects.find(s => s.subjectCode === subjectCode);
                if (!subject) continue;

                const newCode = codePrefix ? `${codePrefix}${String(counter).padStart(2, '0')}` : subject.subjectCode;

                const newSubject = {
                    subjectCode: newCode,
                    subjectName: subject.subjectName,
                    shortName: subject.shortName,
                    semester: targetSemester,
                    branch: targetBranch,
                    credits: subject.credits,
                    type: subject.type,
                    description: subject.description,
                    isActive: subject.isActive
                };

                const response = await fetch(`${SERVER_URL}/api/subjects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSubject)
                });

                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }

                counter++;
            } catch (error) {
                errorCount++;
            }
        }

        showNotification(`Duplicated ${successCount} subject(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
        closeModal();
        clearSubjectSelection();
        loadSubjects();
    });

    openModal();
}

// Bulk delete selected subjects
async function bulkDeleteSelectedSubjects() {
    if (selectedSubjects.size === 0) {
        showNotification('No subjects selected', 'warning');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedSubjects.size} subject(s)? This action cannot be undone.`)) {
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const subjectCode of selectedSubjects) {
        try {
            const response = await fetch(`${SERVER_URL}/api/subjects/${subjectCode}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
        }
    }

    showNotification(`Deleted ${successCount} subject(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
    clearSubjectSelection();
    loadSubjects();
}

// Export subjects to CSV
function exportSubjectsToCSV() {
    if (subjects.length === 0) {
        showNotification('No subjects to export', 'warning');
        return;
    }

    // Create CSV content
    const headers = ['Subject Code', 'Subject Name', 'Short Name', 'Semester', 'Branch', 'Credits', 'Type', 'Description', 'Active'];
    const rows = subjects.map(s => [
        s.subjectCode,
        s.subjectName,
        s.shortName || '',
        s.semester,
        s.branch,
        s.credits,
        s.type,
        s.description || '',
        s.isActive ? 'Yes' : 'No'
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subjects_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showNotification(`Exported ${subjects.length} subjects to CSV`, 'success');
}

// Import subjects from CSV
function importSubjectsFromCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csv = event.target.result;
                const lines = csv.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

                const subjectsToImport = [];

                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;

                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));

                    const subject = {
                        subjectCode: values[0],
                        subjectName: values[1],
                        shortName: values[2] || '',
                        semester: values[3],
                        branch: values[4],
                        credits: parseInt(values[5]) || 3,
                        type: values[6] || 'Theory',
                        description: values[7] || '',
                        isActive: values[8] === 'Yes' || values[8] === 'true'
                    };

                    subjectsToImport.push(subject);
                }

                if (subjectsToImport.length === 0) {
                    showNotification('No valid subjects found in CSV', 'warning');
                    return;
                }

                // Show confirmation
                if (!confirm(`Import ${subjectsToImport.length} subject(s) from CSV?`)) {
                    return;
                }

                let successCount = 0;
                let errorCount = 0;

                for (const subject of subjectsToImport) {
                    try {
                        const response = await fetch(`${SERVER_URL}/api/subjects`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(subject)
                        });

                        if (response.ok) {
                            successCount++;
                        } else {
                            errorCount++;
                        }
                    } catch (error) {
                        errorCount++;
                    }
                }

                showNotification(`Imported ${successCount} subject(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, successCount > 0 ? 'success' : 'error');
                loadSubjects();
            } catch (error) {
                console.error('Error parsing CSV:', error);
                showNotification('Failed to parse CSV file', 'error');
            }
        };

        reader.readAsText(file);
    };

    input.click();
}

// Search subjects
function searchSubjects(query) {
    if (!query) {
        renderSubjectsTable();
        return;
    }

    const filtered = subjects.filter(subject =>
        subject.subjectCode.toLowerCase().includes(query.toLowerCase()) ||
        subject.subjectName.toLowerCase().includes(query.toLowerCase()) ||
        (subject.shortName && subject.shortName.toLowerCase().includes(query.toLowerCase()))
    );

    const tbody = document.getElementById('subjectsTableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No subjects found matching your search</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(subject => `
        <tr>
            <td>
                <input 
                    type="checkbox" 
                    class="subject-checkbox" 
                    data-subject-code="${subject.subjectCode}"
                    onchange="toggleSubjectSelection('${subject.subjectCode}', this.checked)"
                    ${selectedSubjects.has(subject.subjectCode) ? 'checked' : ''}
                >
            </td>
            <td><strong>${subject.subjectCode}</strong></td>
            <td>${subject.subjectName}</td>
            <td>${subject.shortName || '-'}</td>
            <td>Sem ${subject.semester}</td>
            <td>${subject.branch}</td>
            <td>${subject.credits}</td>
            <td><span class="badge badge-${subject.type.toLowerCase()}">${subject.type}</span></td>
            <td><span class="badge badge-${subject.isActive ? 'success' : 'danger'}">${subject.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn-icon" onclick="duplicateSubject('${subject.subjectCode}')" title="Duplicate">📋</button>
                <button class="btn-icon" onclick="editSubject('${subject.subjectCode}')" title="Edit">✏️</button>
                <button class="btn-icon" onclick="deleteSubject('${subject.subjectCode}')" title="Delete">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// Event listeners for subject filters are now in setupEventListeners()

// Feature Request Dialog
function showFeatureRequestDialog() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>💡 Submit Feature Request</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Help us improve the system by sharing your ideas and suggestions!
        </p>
        <form id="featureRequestForm">
            <div class="form-group">
                <label>Your Name *</label>
                <input type="text" id="requesterName" class="form-input" required placeholder="Enter your name">
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" id="requesterEmail" class="form-input" required placeholder="your.email@example.com">
            </div>
            <div class="form-group">
                <label>Feature Title *</label>
                <input type="text" id="featureTitle" class="form-input" required placeholder="Brief title for your feature">
            </div>
            <div class="form-group">
                <label>Feature Description *</label>
                <textarea id="featureDescription" class="form-input" rows="6" required 
                    placeholder="Describe your feature idea in detail. What problem does it solve? How would it work?"></textarea>
            </div>
            <div class="form-group">
                <label>Priority</label>
                <select id="featurePriority" class="form-select">
                    <option value="low">Low - Nice to have</option>
                    <option value="medium" selected>Medium - Would be helpful</option>
                    <option value="high">High - Really need this</option>
                    <option value="critical">Critical - Blocking my work</option>
                </select>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="featureCategory" class="form-select">
                    <option value="attendance">Attendance Management</option>
                    <option value="timetable">Timetable</option>
                    <option value="students">Student Management</option>
                    <option value="teachers">Teacher Management</option>
                    <option value="reports">Reports & Analytics</option>
                    <option value="notifications">Notifications</option>
                    <option value="mobile">Mobile App</option>
                    <option value="integration">Integration</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">✉️ Submit Request</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('featureRequestForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const featureRequest = {
            name: document.getElementById('requesterName').value,
            email: document.getElementById('requesterEmail').value,
            title: document.getElementById('featureTitle').value,
            description: document.getElementById('featureDescription').value,
            priority: document.getElementById('featurePriority').value,
            category: document.getElementById('featureCategory').value,
            timestamp: new Date().toISOString()
        };

        // For now, just show success message
        // In production, this would send to a backend API or email
        console.log('Feature Request:', featureRequest);

        showNotification(
            `Thank you for your feature request!\n\n` +
            `"${featureRequest.title}" has been submitted.\n\n` +
            `We'll review it and get back to you at ${featureRequest.email}`,
            'success'
        );

        closeModal();

        // TODO: Send to backend API
        // await fetch(`${SERVER_URL}/api/feature-requests`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(featureRequest)
        // });
    });

    openModal();
}

// Period Management Functions - Save Current Periods as Default
function saveCurrentPeriodsAsDefault() {
    if (!currentPeriods || currentPeriods.length === 0) {
        showNotification('No periods to save as default', 'warning');
        return;
    }

    if (!confirm('Save current period configuration as default? This will be used for all new timetables.')) {
        return;
    }

    try {
        // Save to localStorage
        saveDefaultPeriods(currentPeriods);
        showNotification(`Saved ${currentPeriods.length} periods as default configuration`, 'success');

        // Update the UI to reflect the change
        renderPeriods();
    } catch (error) {
        console.error('Error saving default periods:', error);
        showNotification('Failed to save default periods', 'error');
    }
}

// Period Management Functions - Reset to Default Periods
function resetToDefaultPeriods() {
    if (!confirm('Reset to default period configuration? This will replace all current periods.')) {
        return;
    }

    try {
        // Get fresh default periods (ignoring any saved custom defaults)
        const defaultPeriods = [
            { number: 1, startTime: '09:00', endTime: '09:45', duration: 45, isBreak: false },
            { number: 2, startTime: '09:45', endTime: '10:30', duration: 45, isBreak: false },
            { number: 3, startTime: '10:30', endTime: '10:45', duration: 15, isBreak: true },
            { number: 4, startTime: '10:45', endTime: '11:30', duration: 45, isBreak: false },
            { number: 5, startTime: '11:30', endTime: '12:15', duration: 45, isBreak: false },
            { number: 6, startTime: '12:15', endTime: '13:00', duration: 45, isBreak: false },
            { number: 7, startTime: '13:00', endTime: '14:00', duration: 60, isBreak: true },
            { number: 8, startTime: '14:00', endTime: '14:45', duration: 45, isBreak: false },
            { number: 9, startTime: '14:45', endTime: '15:30', duration: 45, isBreak: false },
            { number: 10, startTime: '15:30', endTime: '15:45', duration: 15, isBreak: true },
            { number: 11, startTime: '15:45', endTime: '16:30', duration: 45, isBreak: false },
            { number: 12, startTime: '16:30', endTime: '17:15', duration: 45, isBreak: false }
        ];

        // Update current periods
        currentPeriods = [...defaultPeriods];

        // Re-render the periods UI
        renderPeriods();
        updatePeriodStats();

        showNotification(`Reset to default configuration with ${defaultPeriods.length} periods`, 'success');

        // Clear any saved custom defaults if user wants fresh start
        if (confirm('Also clear saved custom default periods? (This will affect future new timetables)')) {
            localStorage.removeItem('defaultPeriods');
            showNotification('Cleared saved custom default periods', 'info');
        }

    } catch (error) {
        console.error('Error resetting to default periods:', error);
        showNotification('Failed to reset to default periods', 'error');
    }
}

// ===== SIMPLE ADD SUBJECT FUNCTIONALITY =====

function showSimpleAddSubjectDialog() {
    console.log('🎯 Simple Add Subject Dialog');

    // Create simple modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add New Subject</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Subject Code *</label>
                    <input type="text" id="simpleSubjectCode" placeholder="e.g., CS301" required>
                </div>
                <div class="form-group">
                    <label>Subject Name *</label>
                    <input type="text" id="simpleSubjectName" placeholder="e.g., Data Structures" required>
                </div>
                <div class="form-group">
                    <label>Short Name</label>
                    <input type="text" id="simpleShortName" placeholder="e.g., DS">
                </div>
                <div class="form-group">
                    <label>Semester *</label>
                    <select id="simpleSemester" required>
                        <option value="">Select Semester</option>
                        <option value="1">Semester 1</option>
                        <option value="2">Semester 2</option>
                        <option value="3">Semester 3</option>
                        <option value="4">Semester 4</option>
                        <option value="5">Semester 5</option>
                        <option value="6">Semester 6</option>
                        <option value="7">Semester 7</option>
                        <option value="8">Semester 8</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Branch *</label>
                    <select id="simpleBranch" required>
                        <option value="">Select Branch</option>
                        ${dynamicData.branches.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Credits</label>
                    <input type="number" id="simpleCredits" value="3" min="1" max="6">
                </div>
                <div class="form-group">
                    <label>Type *</label>
                    <select id="simpleType" required>
                        <option value="Theory">Theory</option>
                        <option value="Lab">Lab</option>
                        <option value="Practical">Practical</option>
                        <option value="Training">Training</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="simpleDescription" rows="3" placeholder="Subject description..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveSimpleSubject()">Add Subject</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

async function saveSimpleSubject() {
    console.log('💾 Saving simple subject...');

    // Get form values
    const subjectCode = document.getElementById('simpleSubjectCode').value.trim();
    const subjectName = document.getElementById('simpleSubjectName').value.trim();
    const shortName = document.getElementById('simpleShortName').value.trim();
    const semester = document.getElementById('simpleSemester').value;
    const branch = document.getElementById('simpleBranch').value;
    const credits = document.getElementById('simpleCredits').value;
    const type = document.getElementById('simpleType').value;
    const description = document.getElementById('simpleDescription').value.trim();

    console.log('Form values:', { subjectCode, subjectName, semester, branch, type });

    // Simple validation
    if (!subjectCode || !subjectName || !semester || !branch || !type) {
        alert('Please fill all required fields (marked with *)');
        return;
    }

    // Show loading
    const saveBtn = document.querySelector('.modal-footer .btn-primary');
    saveBtn.textContent = 'Adding...';
    saveBtn.disabled = true;

    try {
        const payload = {
            subjectCode: subjectCode.toUpperCase(),
            subjectName,
            shortName: shortName || subjectName,
            semester,
            branch,
            credits: parseInt(credits) || 3,
            type,
            description
        };

        console.log('Sending payload:', payload);

        const response = await fetch(`${SERVER_URL}/api/subjects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('Server response:', data);

        if (data.success) {
            alert(`Subject "${subjectCode}" added successfully!`);
            document.querySelector('.modal-overlay').remove();
            // Reload subjects if the function exists
            if (typeof loadSubjects === 'function') {
                loadSubjects();
            }
        } else {
            alert('Error: ' + (data.error || 'Failed to add subject'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Network error: ' + error.message);
    } finally {
        saveBtn.textContent = 'Add Subject';
        saveBtn.disabled = false;
    }
}
// ===== BULK EDIT SUBJECTS FUNCTIONALITY =====

function showBulkEditDialog() {
    console.log('📝 Opening bulk edit dialog');

    if (selectedSubjects.size === 0) {
        showNotification('Please select subjects to edit', 'warning');
        return;
    }

    const selectedCount = selectedSubjects.size;
    const selectedList = Array.from(selectedSubjects);

    // Create bulk edit modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>Bulk Edit Subjects (${selectedCount} selected)</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="selected-subjects-list">
                    <h4>Selected Subjects:</h4>
                    <div class="selected-subjects-scrollable">
                        ${selectedList.join(', ')}
                    </div>
                </div>
                
                <div class="bulk-edit-info">
                    Only fill the fields you want to update. Empty fields will remain unchanged.
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateSemester"> Update Semester
                    </label>
                    <select id="bulkSemester" disabled>
                        <option value="">Select Semester</option>
                        ${generateSemesterOptions()}
                    </select>
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateBranch"> Update Branch
                    </label>
                    <select id="bulkBranch" disabled>
                        <option value="">Select Branch</option>
                        ${generateBranchOptions()}
                    </select>
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateCredits"> Update Credits
                    </label>
                    <input type="number" id="bulkCredits" disabled min="1" max="6">
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateType"> Update Type
                    </label>
                    <select id="bulkType" disabled>
                        <option value="">Select Type</option>
                        <option value="Theory">Theory</option>
                        <option value="Lab">Lab</option>
                        <option value="Practical">Practical</option>
                        <option value="Training">Training</option>
                    </select>
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateStatus"> Update Status
                    </label>
                    <select id="bulkStatus" disabled>
                        <option value="">Select Status</option>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                    </select>
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateDescription"> Update Description
                    </label>
                    <textarea id="bulkDescription" disabled rows="3" placeholder="New description for all selected subjects..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-warning" onclick="executeBulkEdit()">Update ${selectedCount} Subjects</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners for checkboxes to enable/disable fields
    setupBulkEditCheckboxes();
}

function setupBulkEditCheckboxes() {
    const checkboxes = [
        { checkbox: 'bulkUpdateSemester', field: 'bulkSemester' },
        { checkbox: 'bulkUpdateBranch', field: 'bulkBranch' },
        { checkbox: 'bulkUpdateCredits', field: 'bulkCredits' },
        { checkbox: 'bulkUpdateType', field: 'bulkType' },
        { checkbox: 'bulkUpdateStatus', field: 'bulkStatus' },
        { checkbox: 'bulkUpdateDescription', field: 'bulkDescription' }
    ];

    checkboxes.forEach(({ checkbox, field }) => {
        const checkboxEl = document.getElementById(checkbox);
        const fieldEl = document.getElementById(field);

        if (checkboxEl && fieldEl) {
            checkboxEl.addEventListener('change', () => {
                fieldEl.disabled = !checkboxEl.checked;
                if (!checkboxEl.checked) {
                    fieldEl.value = '';
                }
            });
        }
    });
}

async function executeBulkEdit() {
    console.log('🔄 Executing bulk edit...');

    const selectedList = Array.from(selectedSubjects);

    // Collect updates
    const updates = {};

    if (document.getElementById('bulkUpdateSemester').checked) {
        const semester = document.getElementById('bulkSemester').value;
        if (semester) updates.semester = semester;
    }

    if (document.getElementById('bulkUpdateBranch').checked) {
        const branch = document.getElementById('bulkBranch').value;
        if (branch) updates.branch = branch;
    }

    if (document.getElementById('bulkUpdateCredits').checked) {
        const credits = document.getElementById('bulkCredits').value;
        if (credits) updates.credits = parseInt(credits);
    }

    if (document.getElementById('bulkUpdateType').checked) {
        const type = document.getElementById('bulkType').value;
        if (type) updates.type = type;
    }

    if (document.getElementById('bulkUpdateStatus').checked) {
        const status = document.getElementById('bulkStatus').value;
        if (status !== '') updates.isActive = status === 'true';
    }

    if (document.getElementById('bulkUpdateDescription').checked) {
        const description = document.getElementById('bulkDescription').value;
        updates.description = description; // Allow empty description
    }

    if (Object.keys(updates).length === 0) {
        showNotification('Please select at least one field to update', 'warning');
        return;
    }

    console.log('Updates to apply:', updates);
    console.log('To subjects:', selectedList);

    // Show loading
    const updateBtn = document.querySelector('.modal-footer .btn-warning');
    updateBtn.textContent = 'Updating...';
    updateBtn.disabled = true;

    try {
        // Send bulk update request
        const response = await fetch(`${SERVER_URL}/api/subjects/bulk-update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjectCodes: selectedList,
                updates: updates
            })
        });

        const data = await response.json();
        console.log('Bulk update response:', data);

        if (data.success) {
            showNotification(`Successfully updated ${data.updatedCount} subjects`, 'success');
            document.querySelector('.modal-overlay').remove();

            // Clear selection and reload subjects
            clearSubjectSelection();
            if (typeof loadSubjects === 'function') {
                loadSubjects();
            }
        } else {
            showNotification('Error: ' + (data.error || 'Failed to update subjects'), 'error');
        }
    } catch (error) {
        console.error('Bulk update error:', error);
        showNotification('Network error: ' + error.message, 'error');
    } finally {
        updateBtn.textContent = `Update ${selectedList.length} Subjects`;
        updateBtn.disabled = false;
    }
}

// Update the existing bulk edit button listener
function attachBulkEditListener() {
    const bulkEditBtn = document.getElementById('bulkEditSubjectsBtn');
    if (bulkEditBtn) {
        bulkEditBtn.onclick = showBulkEditDialog;
        console.log('✅ Bulk edit button listener attached');
    }
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(attachBulkEditListener, 1000);
});
// ===== ATTENDANCE MANAGEMENT FUNCTIONALITY =====

let attendanceRecords = [];
let selectedAttendanceRecords = new Set();

// Initialize attendance management
function initializeAttendanceManagement() {
    // Add event listeners for new buttons
    const addAttendanceBtn = document.getElementById('addAttendanceBtn');
    const bulkEditAttendanceBtn = document.getElementById('bulkEditAttendanceBtn');
    const manageAttendanceBtn = document.getElementById('manageAttendanceBtn');

    if (addAttendanceBtn) {
        addAttendanceBtn.addEventListener('click', showAddAttendanceDialog);
    }

    if (bulkEditAttendanceBtn) {
        bulkEditAttendanceBtn.addEventListener('click', showBulkEditAttendanceDialog);
    }

    if (manageAttendanceBtn) {
        manageAttendanceBtn.addEventListener('click', showAttendanceManagementPanel);
    }

    console.log('✅ Attendance management initialized');
}

// Enhanced attendance table with management features
function renderAttendanceTable(records) {
    const tbody = document.getElementById('attendanceHistoryTableBody');

    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">📊</div>
                    <h3 style="color: var(--text-primary); margin-bottom: 10px;">No Attendance Records Found</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">No attendance data available for the selected criteria</p>
                    <button class="btn btn-primary" onclick="showAddAttendanceDialog()">➕ Add First Record</button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const attendancePercentage = record.totalDays > 0 ?
            Math.round((record.presentDays / record.totalDays) * 100) : 0;

        const statusColor = attendancePercentage >= 75 ? '#10b981' :
            attendancePercentage >= 50 ? '#f59e0b' : '#ef4444';

        return `
            <tr>
                <td>
                    <input type="checkbox" onchange="toggleAttendanceSelection('${record._id}', this.checked)">
                    ${record.enrollmentNo}
                </td>
                <td>
                    <div class="student-info">
                        <img src="${record.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}&background=00d9ff&color=fff&size=32`}" 
                             alt="${record.name}" class="student-photo-small" 
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(record.name)}&background=00d9ff&color=fff&size=32'">
                        <span class="student-name">${record.name}</span>
                    </div>
                </td>
                <td>${record.course}</td>
                <td>${record.semester}</td>
                <td>${record.totalDays}</td>
                <td>${record.presentDays}</td>
                <td>
                    <span style="color: ${statusColor}; font-weight: bold;">
                        ${attendancePercentage}%
                    </span>
                </td>
                <td>${Math.round(record.totalHours || 0)}h</td>
                <td>
                    <span class="wifi-status ${record.wifiConnected ? 'connected' : 'disconnected'}">
                        ${record.wifiConnected ? '🟢 Connected' : '🔴 Offline'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons-small">
                        <button class="action-btn edit" onclick="editAttendanceRecord('${record._id}')" title="Edit">✏️</button>
                        <button class="action-btn view" onclick="viewAttendanceDetails('${record._id}')" title="View Details">👁️</button>
                        <button class="action-btn delete" onclick="deleteAttendanceRecord('${record._id}')" title="Delete">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Update selection UI
    updateAttendanceSelectionUI();
}

// Add new attendance record
function showAddAttendanceDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>Add Attendance Record</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Student *</label>
                    <select id="attendanceStudentSelect" required>
                        <option value="">Select Student</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="attendanceDate" required>
                </div>
                <div class="form-group">
                    <label>Status *</label>
                    <select id="attendanceStatus" required>
                        <option value="">Select Status</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Subject</label>
                    <select id="attendanceSubject">
                        <option value="">Select Subject</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Hours Attended</label>
                    <input type="number" id="attendanceHours" min="0" max="8" step="0.5" placeholder="e.g., 2.5">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea id="attendanceNotes" rows="3" placeholder="Additional notes..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-success" onclick="saveAttendanceRecord()">Add Record</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load students and subjects
    loadStudentsForAttendance();
    loadSubjectsForAttendance();

    // Set today's date as default
    document.getElementById('attendanceDate').value = new Date().toISOString().split('T')[0];
}

// Edit attendance record
function editAttendanceRecord(recordId) {
    console.log('Editing attendance record:', recordId);

    // Find the record
    const record = attendanceRecords.find(r => r._id === recordId);
    if (!record) {
        showNotification('Record not found', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>Edit Attendance Record</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Student</label>
                    <input type="text" value="${record.name} (${record.enrollmentNo})" disabled>
                </div>
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="editAttendanceDate" value="${record.date ? record.date.split('T')[0] : ''}" required>
                </div>
                <div class="form-group">
                    <label>Status *</label>
                    <select id="editAttendanceStatus" required>
                        <option value="present" ${record.status === 'present' ? 'selected' : ''}>Present</option>
                        <option value="absent" ${record.status === 'absent' ? 'selected' : ''}>Absent</option>
                        <option value="late" ${record.status === 'late' ? 'selected' : ''}>Late</option>
                        <option value="excused" ${record.status === 'excused' ? 'selected' : ''}>Excused</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Hours Attended</label>
                    <input type="number" id="editAttendanceHours" value="${record.hoursAttended || ''}" min="0" max="8" step="0.5">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea id="editAttendanceNotes" rows="3">${record.notes || ''}</textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-warning" onclick="updateAttendanceRecord('${recordId}')">Update Record</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// View attendance details
function viewAttendanceDetails(recordId) {
    console.log('Viewing attendance details:', recordId);

    const record = attendanceRecords.find(r => r._id === recordId);
    if (!record) {
        showNotification('Record not found', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3>Attendance Details - ${record.name}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="attendance-detail-grid">
                    <div class="detail-card">
                        <h4>Student Information</h4>
                        <p><strong>Name:</strong> ${record.name}</p>
                        <p><strong>Enrollment:</strong> ${record.enrollmentNo}</p>
                        <p><strong>Course:</strong> ${record.course}</p>
                        <p><strong>Semester:</strong> ${record.semester}</p>
                    </div>
                    <div class="detail-card">
                        <h4>Attendance Summary</h4>
                        <p><strong>Total Days:</strong> ${record.totalDays}</p>
                        <p><strong>Present Days:</strong> ${record.presentDays}</p>
                        <p><strong>Attendance Rate:</strong> ${Math.round((record.presentDays / record.totalDays) * 100)}%</p>
                        <p><strong>Total Hours:</strong> ${Math.round(record.totalHours || 0)}h</p>
                    </div>
                    <div class="detail-card">
                        <h4>Recent Activity</h4>
                        <p><strong>Last Updated:</strong> ${new Date(record.updatedAt || record.createdAt).toLocaleDateString()}</p>
                        <p><strong>WiFi Status:</strong> ${record.wifiConnected ? '🟢 Connected' : '🔴 Offline'}</p>
                        <p><strong>Notes:</strong> ${record.notes || 'No notes'}</p>
                    </div>
                </div>
                <div class="attendance-history-chart">
                    <h4>Weekly Attendance Trend</h4>
                    <div id="attendanceChart" style="height: 200px; background: var(--bg-hover); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
                        📊 Chart visualization coming soon
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                <button class="btn btn-warning" onclick="editAttendanceRecord('${recordId}')">Edit Record</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Bulk edit attendance
function showBulkEditAttendanceDialog() {
    if (selectedAttendanceRecords.size === 0) {
        showNotification('Please select attendance records to edit', 'warning');
        return;
    }

    const selectedCount = selectedAttendanceRecords.size;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>Bulk Edit Attendance (${selectedCount} records)</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="bulk-edit-info">
                    Editing ${selectedCount} attendance records. Only checked fields will be updated.
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateAttendanceStatus"> Update Status
                    </label>
                    <select id="bulkAttendanceStatus" disabled>
                        <option value="">Select Status</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                    </select>
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateAttendanceHours"> Update Hours
                    </label>
                    <input type="number" id="bulkAttendanceHours" disabled min="0" max="8" step="0.5">
                </div>
                
                <div class="bulk-edit-field">
                    <label>
                        <input type="checkbox" id="bulkUpdateAttendanceNotes"> Update Notes
                    </label>
                    <textarea id="bulkAttendanceNotes" disabled rows="3" placeholder="Notes for all selected records..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-warning" onclick="executeBulkAttendanceEdit()">Update ${selectedCount} Records</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup checkbox listeners
    setupBulkAttendanceCheckboxes();
}

// Attendance management panel
function showAttendanceManagementPanel() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3>Attendance Management Panel</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="management-tabs">
                    <button class="tab-btn active" onclick="showManagementTab('bulk-operations')">Bulk Operations</button>
                    <button class="tab-btn" onclick="showManagementTab('import-export')">Import/Export</button>
                    <button class="tab-btn" onclick="showManagementTab('analytics')">Analytics</button>
                    <button class="tab-btn" onclick="showManagementTab('settings')">Settings</button>
                </div>
                
                <div id="bulk-operations" class="tab-content active">
                    <h4>Bulk Operations</h4>
                    <div class="operation-grid">
                        <button class="operation-btn" onclick="markAllPresent()">
                            <span class="op-icon">✅</span>
                            <span class="op-text">Mark All Present</span>
                        </button>
                        <button class="operation-btn" onclick="markAllAbsent()">
                            <span class="op-icon">❌</span>
                            <span class="op-text">Mark All Absent</span>
                        </button>
                        <button class="operation-btn" onclick="resetAttendance()">
                            <span class="op-icon">🔄</span>
                            <span class="op-text">Reset Attendance</span>
                        </button>
                        <button class="operation-btn" onclick="generateReport()">
                            <span class="op-icon">📊</span>
                            <span class="op-text">Generate Report</span>
                        </button>
                    </div>
                </div>
                
                <div id="import-export" class="tab-content">
                    <h4>Import/Export Data</h4>
                    <div class="import-export-section">
                        <div class="ie-card">
                            <h5>Import Attendance</h5>
                            <p>Upload CSV file with attendance data</p>
                            <button class="btn btn-primary" onclick="importAttendanceData()">📥 Import CSV</button>
                        </div>
                        <div class="ie-card">
                            <h5>Export Attendance</h5>
                            <p>Download attendance data as CSV</p>
                            <button class="btn btn-secondary" onclick="exportAttendanceData()">📤 Export CSV</button>
                        </div>
                    </div>
                </div>
                
                <div id="analytics" class="tab-content">
                    <h4>Attendance Analytics</h4>
                    <div class="analytics-grid">
                        <div class="analytics-card">
                            <h5>Attendance Trends</h5>
                            <div class="chart-placeholder">📈 Trend Chart</div>
                        </div>
                        <div class="analytics-card">
                            <h5>Low Attendance Alert</h5>
                            <div class="alert-list">
                                <p>Students with &lt;75% attendance will appear here</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="settings" class="tab-content">
                    <h4>Attendance Settings</h4>
                    <div class="settings-form">
                        <div class="form-group">
                            <label>Minimum Attendance Threshold</label>
                            <input type="number" value="75" min="0" max="100"> %
                        </div>
                        <div class="form-group">
                            <label>Auto-mark absent after</label>
                            <input type="number" value="15" min="1" max="60"> minutes
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" checked> Send low attendance alerts
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                <button class="btn btn-primary" onclick="saveManagementSettings()">Save Settings</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Helper functions
function toggleAttendanceSelection(recordId, isChecked) {
    if (isChecked) {
        selectedAttendanceRecords.add(recordId);
    } else {
        selectedAttendanceRecords.delete(recordId);
    }
    updateAttendanceSelectionUI();
}

function updateAttendanceSelectionUI() {
    const selectedCount = selectedAttendanceRecords.size;
    // Update UI to show selected count
    console.log(`${selectedCount} attendance records selected`);
}

function setupBulkAttendanceCheckboxes() {
    const checkboxes = [
        { checkbox: 'bulkUpdateAttendanceStatus', field: 'bulkAttendanceStatus' },
        { checkbox: 'bulkUpdateAttendanceHours', field: 'bulkAttendanceHours' },
        { checkbox: 'bulkUpdateAttendanceNotes', field: 'bulkAttendanceNotes' }
    ];

    checkboxes.forEach(({ checkbox, field }) => {
        const checkboxEl = document.getElementById(checkbox);
        const fieldEl = document.getElementById(field);

        if (checkboxEl && fieldEl) {
            checkboxEl.addEventListener('change', () => {
                fieldEl.disabled = !checkboxEl.checked;
                if (!checkboxEl.checked) {
                    fieldEl.value = '';
                }
            });
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeAttendanceManagement, 1000);
});


// ==================== CONFIGURATION MANAGEMENT ====================

// Load branches configuration
async function loadBranchesConfig() {
    try {
        const response = await fetch(`${SERVER_URL}/api/config/branches`);
        const data = await response.json();

        const container = document.getElementById('branchesListContainer');

        if (!data.success || data.branches.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No branches configured</div>';
            return;
        }

        container.innerHTML = data.branches.map(branch => `
            <div class="config-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color);">
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">${branch.displayName}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${branch.name}</div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteBranch('${branch.name}', '${branch.displayName}')">🗑️</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading branches:', error);
        showNotification('Failed to load branches', 'error');
    }
}

// Load semesters configuration
async function loadSemestersConfig() {
    try {
        const response = await fetch(`${SERVER_URL}/api/config/semesters`);
        const data = await response.json();

        const container = document.getElementById('semestersListContainer');

        if (!data.success || data.semesters.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No semesters configured</div>';
            return;
        }

        container.innerHTML = data.semesters.map(semester => `
            <div class="config-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color);">
                <div style="font-weight: 500; color: var(--text-primary);">Semester ${semester}</div>
                <button class="btn btn-danger btn-sm" onclick="deleteSemester('${semester}')">🗑️</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading semesters:', error);
        showNotification('Failed to load semesters', 'error');
    }
}

// Load departments configuration
async function loadDepartmentsConfig() {
    try {
        const response = await fetch(`${SERVER_URL}/api/config/departments`);
        const data = await response.json();

        const container = document.getElementById('departmentsListContainer');

        if (!data.success || data.departments.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No departments configured</div>';
            return;
        }

        container.innerHTML = data.departments.map(dept => `
            <div class="config-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color);">
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">${dept.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${dept.code}</div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteDepartment('${dept.value}', '${dept.name}')">🗑️</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading departments:', error);
        showNotification('Failed to load departments', 'error');
    }
}

// Add branch modal
function showAddBranchModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>➕ Add New Branch</h2>
        <form id="addBranchForm">
            <div class="form-group">
                <label>Branch Name *</label>
                <input type="text" id="branchValue" class="form-input" placeholder="e.g., B.Tech Data Science" required>
            </div>
            <div class="form-group">
                <label>Display Name *</label>
                <input type="text" id="branchDisplayName" class="form-input" placeholder="e.g., Data Science" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Branch</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const value = document.getElementById('branchValue').value.trim();
        const displayName = document.getElementById('branchDisplayName').value.trim();

        try {
            const response = await fetch(`${SERVER_URL}/api/config/branches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value, displayName })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Branch added successfully', 'success');
                closeModal();
                loadBranchesConfig();
                loadDynamicDropdownData(); // Refresh dropdowns
            } else {
                showNotification(data.error || 'Failed to add branch', 'error');
            }
        } catch (error) {
            console.error('Error adding branch:', error);
            showNotification('Failed to add branch', 'error');
        }
    });

    openModal();
}

// Add semester modal
function showAddSemesterModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>➕ Add New Semester</h2>
        <form id="addSemesterForm">
            <div class="form-group">
                <label>Semester Number *</label>
                <input type="number" id="semesterValue" class="form-input" placeholder="e.g., 9" min="1" max="12" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Semester</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addSemesterForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const value = document.getElementById('semesterValue').value;

        try {
            const response = await fetch(`${SERVER_URL}/api/config/semesters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Semester added successfully', 'success');
                closeModal();
                loadSemestersConfig();
                loadDynamicDropdownData(); // Refresh dropdowns
            } else {
                showNotification(data.error || 'Failed to add semester', 'error');
            }
        } catch (error) {
            console.error('Error adding semester:', error);
            showNotification('Failed to add semester', 'error');
        }
    });

    openModal();
}

// Add department modal
function showAddDepartmentModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>➕ Add New Department</h2>
        <form id="addDepartmentForm">
            <div class="form-group">
                <label>Department Code *</label>
                <input type="text" id="departmentValue" class="form-input" placeholder="e.g., CSE" required>
            </div>
            <div class="form-group">
                <label>Department Name *</label>
                <input type="text" id="departmentDisplayName" class="form-input" placeholder="e.g., Computer Science" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Department</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addDepartmentForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const value = document.getElementById('departmentValue').value.trim();
        const displayName = document.getElementById('departmentDisplayName').value.trim();

        try {
            const response = await fetch(`${SERVER_URL}/api/config/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value, displayName })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Department added successfully', 'success');
                closeModal();
                loadDepartmentsConfig();
                loadDepartmentsFilter(); // Refresh department filter
            } else {
                showNotification(data.error || 'Failed to add department', 'error');
            }
        } catch (error) {
            console.error('Error adding department:', error);
            showNotification('Failed to add department', 'error');
        }
    });

    openModal();
}

// Delete branch
async function deleteBranch(branchId, branchName) {
    if (!confirm(`Are you sure you want to delete branch "${branchName}"?\n\nThis will not delete existing students or timetables.`)) {
        return;
    }

    try {
        // Use branchId (the actual value) instead of branchName (display name)
        const deleteResponse = await fetch(`${SERVER_URL}/api/config/branches/${encodeURIComponent(branchId)}`, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();

        if (data.success) {
            showNotification('Branch deleted successfully', 'success');
            loadBranchesConfig();
            loadDynamicDropdownData(); // Refresh dropdowns
        } else {
            showNotification(data.error || 'Failed to delete branch', 'error');
        }
    } catch (error) {
        console.error('Error deleting branch:', error);
        showNotification('Failed to delete branch', 'error');
    }
}

// Delete semester
async function deleteSemester(semesterValue) {
    if (!confirm(`Are you sure you want to delete Semester ${semesterValue}?\n\nThis will not delete existing students or timetables.`)) {
        return;
    }

    try {
        const deleteResponse = await fetch(`${SERVER_URL}/api/config/semesters/${semesterValue}`, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();

        if (data.success) {
            showNotification('Semester deleted successfully', 'success');
            loadSemestersConfig();
            loadDynamicDropdownData(); // Refresh dropdowns
        } else {
            showNotification(data.error || 'Failed to delete semester', 'error');
        }
    } catch (error) {
        console.error('Error deleting semester:', error);
        showNotification('Failed to delete semester', 'error');
    }
}

// Load departments configuration
async function loadDepartmentsConfig() {
    try {
        const response = await fetch(`${SERVER_URL}/api/config/departments`);
        const data = await response.json();

        const container = document.getElementById('departmentsListContainer');

        if (!data.success || data.departments.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No departments configured</div>';
            return;
        }

        container.innerHTML = data.departments.map(dept => `
            <div class="config-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color);">
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">${dept.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${dept.code}</div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteDepartment('${dept.value}', '${dept.name}')">🗑️</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading departments:', error);
        showNotification('Failed to load departments', 'error');
    }
}

// show add department modal
function showAddDepartmentModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>➕ Add New Department</h2>
        <form id="addDepartmentForm">
            <div class="form-group">
                <label>Department Code *</label>
                <input type="text" id="deptValue" class="form-input" placeholder="e.g., CSE" required>
            </div>
            <div class="form-group">
                <label>Display Name *</label>
                <input type="text" id="deptDisplayName" class="form-input" placeholder="e.g., Computer Science" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Department</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('addDepartmentForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const value = document.getElementById('deptValue').value.trim();
        const displayName = document.getElementById('deptDisplayName').value.trim();

        try {
            const response = await fetch(`${SERVER_URL}/api/config/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value, displayName })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Department added successfully', 'success');
                closeModal();
                loadDepartmentsConfig();
                loadDynamicDropdownData(); // Refresh dropdowns
                loadDepartmentsFilter(); // Refresh filter
            } else {
                showNotification(data.error || 'Failed to add department', 'error');
            }
        } catch (error) {
            console.error('Error adding department:', error);
            showNotification('Failed to add department', 'error');
        }
    });

    openModal();
}

// Delete department
async function deleteDepartment(value, name) {
    if (!confirm(`Are you sure you want to delete Department ${name} (${value})?\n\nThis will not delete existing teachers.`)) {
        return;
    }

    try {
        const deleteResponse = await fetch(`${SERVER_URL}/api/config/departments/${value}`, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();

        if (data.success) {
            showNotification('Department deleted successfully', 'success');
            loadDepartmentsConfig();
            loadDynamicDropdownData(); // Refresh dropdowns
            loadDepartmentsFilter(); // Refresh filter
        } else {
            showNotification(data.error || 'Failed to delete department', 'error');
        }
    } catch (error) {
        console.error('Error deleting department:', error);
        showNotification('Failed to delete department', 'error');
    }
}

// Setup configuration event listeners
function setupConfigListeners() {
    const addBranchBtn = document.getElementById('addBranchBtn');
    if (addBranchBtn) {
        addBranchBtn.addEventListener('click', showAddBranchModal);
    }

    const addSemesterBtn = document.getElementById('addSemesterBtn');
    if (addSemesterBtn) {
        addSemesterBtn.addEventListener('click', showAddSemesterModal);
    }

    const addDepartmentBtn = document.getElementById('addDepartmentBtn');
    if (addDepartmentBtn) {
        addDepartmentBtn.addEventListener('click', showAddDepartmentModal);
    }
}

// Load config when config section is opened
document.addEventListener('DOMContentLoaded', () => {
    setupConfigListeners();

    // Load config when Settings section becomes active
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'settings-section' && mutation.target.classList.contains('active')) {
                loadBranchesConfig();
                loadSemestersConfig();
                loadDepartmentsConfig();
            }
        });
    });

    const settingsSection = document.getElementById('settings-section');
    if (settingsSection) {
        observer.observe(settingsSection, { attributes: true, attributeFilter: ['class'] });
    }
});


// ============================================
// PERIOD-BASED ATTENDANCE FUNCTIONS
// ============================================

// Load Period Reports
async function loadPeriodReport() {
    try {
        console.log('📊 Loading period report...');
        
        const date = document.getElementById('periodReportDate').value;
        const semester = document.getElementById('periodReportSemester').value;
        const branch = document.getElementById('periodReportBranch').value;
        const period = document.getElementById('periodReportPeriod').value;
        const search = document.getElementById('periodReportSearch').value.toLowerCase();
        
        // Build query parameters
        const params = new URLSearchParams();
        if (date) params.append('date', date);
        if (semester) params.append('semester', semester);
        if (branch) params.append('branch', branch);
        if (period) params.append('period', period);
        params.append('limit', '100');
        
        const response = await fetch(`${SERVER_URL}/api/attendance/period-report?${params}`);
        const data = await response.json();
        
        if (data.success) {
            let records = data.records || [];
            
            // Apply client-side search filter
            if (search) {
                records = records.filter(r => 
                    r.enrollmentNo.toLowerCase().includes(search) ||
                    r.studentName.toLowerCase().includes(search)
                );
            }
            
            renderPeriodReportTable(records);
            showNotification(`Loaded ${records.length} period records`, 'success');
        } else {
            showNotification('Failed to load period report', 'error');
        }
    } catch (error) {
        console.error('Error loading period report:', error);
        showNotification('Error loading period report', 'error');
    }
}

function renderPeriodReportTable(records) {
    const tbody = document.getElementById('periodReportTableBody');
    
    if (records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-title">No Records Found</div>
                    <div class="empty-state-description">Try adjusting your filters</div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = records.map(record => {
        const date = new Date(record.date).toLocaleDateString();
        const checkInTime = record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-';
        const statusClass = record.status === 'present' ? 'period-present' : 'period-absent';
        const verificationClass = `verification-${record.verificationType || 'initial'}`;
        
        return `
            <tr>
                <td>${date}</td>
                <td><span class="period-badge ${statusClass}">${record.period}</span></td>
                <td>${record.enrollmentNo}</td>
                <td>${record.studentName}</td>
                <td>${record.subject || '-'}</td>
                <td>${record.teacherName || record.teacher || '-'}</td>
                <td>${record.room || '-'}</td>
                <td><span class="period-badge ${statusClass}">${record.status}</span></td>
                <td><span class="verification-badge ${verificationClass}">${record.verificationType || 'initial'}</span></td>
                <td>${checkInTime}</td>
            </tr>
        `;
    }).join('');
}

// Export Period Report as CSV
async function exportPeriodReportCSV() {
    try {
        const date = document.getElementById('periodReportDate').value;
        const semester = document.getElementById('periodReportSemester').value;
        const branch = document.getElementById('periodReportBranch').value;
        const period = document.getElementById('periodReportPeriod').value;
        
        const params = new URLSearchParams();
        if (date) params.append('startDate', date);
        if (date) params.append('endDate', date);
        if (semester) params.append('semester', semester);
        if (branch) params.append('branch', branch);
        if (period) params.append('period', period);
        
        const url = `${SERVER_URL}/api/attendance/export?${params}`;
        window.open(url, '_blank');
        showNotification('Exporting period report...', 'success');
    } catch (error) {
        console.error('Error exporting period report:', error);
        showNotification('Error exporting period report', 'error');
    }
}

// Load Students for Manual Marking
async function loadStudentsForManualMarking() {
    try {
        const semester = document.getElementById('manualMarkSemester').value;
        const branch = document.getElementById('manualMarkBranch').value;
        const date = document.getElementById('manualMarkDate').value;
        const period = document.getElementById('manualMarkPeriod').value;
        
        if (!semester || !branch || !date || !period) {
            showNotification('Please select all required fields', 'warning');
            return;
        }
        
        console.log('📋 Loading students for manual marking...', { semester, branch, date, period });
        
        // Get students for this semester and branch
        const studentsResponse = await fetch(`${SERVER_URL}/api/students`);
        const studentsData = await studentsResponse.json();
        
        if (!studentsData.success) {
            showNotification('Failed to load students', 'error');
            return;
        }
        
        const students = studentsData.students.filter(s => 
            s.semester == semester && s.branch === branch
        );
        
        // Get existing attendance for this date and period
        const params = new URLSearchParams({ date, period, semester, branch });
        const attendanceResponse = await fetch(`${SERVER_URL}/api/attendance/period-report?${params}`);
        const attendanceData = await attendanceResponse.json();
        
        const attendanceMap = {};
        if (attendanceData.success) {
            attendanceData.records.forEach(record => {
                attendanceMap[record.enrollmentNo] = record.status;
            });
        }
        
        // Render students table
        renderManualMarkingTable(students, attendanceMap);
        document.getElementById('manualMarkingContainer').style.display = 'block';
        document.getElementById('markAllPresentBtn').disabled = false;
        document.getElementById('markAllAbsentBtn').disabled = false;
        
        showNotification(`Loaded ${students.length} students`, 'success');
    } catch (error) {
        console.error('Error loading students for marking:', error);
        showNotification('Error loading students', 'error');
    }
}

function renderManualMarkingTable(students, attendanceMap) {
    const tbody = document.getElementById('manualMarkingTableBody');
    
    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <div class="empty-state-title">No Students Found</div>
                    <div class="empty-state-description">No students in this semester and branch</div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = students.map(student => {
        const currentStatus = attendanceMap[student.enrollmentNo] || 'not marked';
        const statusClass = currentStatus === 'present' ? 'status-present' : 
                           currentStatus === 'absent' ? 'status-absent' : '';
        
        return `
            <tr class="student-marking-row" data-enrollment="${student.enrollmentNo}">
                <td>
                    <input type="checkbox" class="student-marking-checkbox" value="${student.enrollmentNo}">
                </td>
                <td>${student.enrollmentNo}</td>
                <td>${student.name}</td>
                <td><span class="daily-status ${statusClass}">${currentStatus}</span></td>
                <td>
                    <button class="action-btn edit" onclick="markStudentPresent('${student.enrollmentNo}', '${student.name}')">
                        ✓ Present
                    </button>
                    <button class="action-btn delete" onclick="markStudentAbsent('${student.enrollmentNo}', '${student.name}')">
                        ✗ Absent
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Mark Student Present
async function markStudentPresent(enrollmentNo, studentName) {
    const period = document.getElementById('manualMarkPeriod').value;
    const date = document.getElementById('manualMarkDate').value;

    if (!confirm(`Mark ${studentName} as PRESENT for ${period}?`)) return;

    await submitManualMarking(enrollmentNo, period, 'present', 'Manual marking by admin', date);
}

// Mark Student Absent
async function markStudentAbsent(enrollmentNo, studentName) {
    const period = document.getElementById('manualMarkPeriod').value;
    const date = document.getElementById('manualMarkDate').value;

    if (!confirm(`Mark ${studentName} as ABSENT for ${period}?`)) return;

    await submitManualMarking(enrollmentNo, period, 'absent', 'Manual marking by admin', date);
}

// Submit Manual Marking
async function submitManualMarking(enrollmentNo, period, status, reason, date) {
    try {
        console.log('✏️ Submitting manual marking...', { enrollmentNo, period, status, reason });
        
        const response = await fetch(`${SERVER_URL}/api/attendance/manual-mark`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherId: 'ADMIN001', // Admin user
                enrollmentNo,
                period,
                status,
                reason,
                timestamp: date ? new Date(date).toISOString() : new Date().toISOString()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Marked ${status} for ${data.markedPeriods.length} period(s)`, 'success');
            // Reload the students table to show updated status
            loadStudentsForManualMarking();
        } else {
            showNotification(data.message || 'Failed to mark attendance', 'error');
        }
    } catch (error) {
        console.error('Error submitting manual marking:', error);
        showNotification('Error marking attendance', 'error');
    }
}

// Mark All Present
async function markAllPresent() {
    const checkboxes = document.querySelectorAll('.student-marking-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('Please select at least one student', 'warning');
        return;
    }

    const period = document.getElementById('manualMarkPeriod').value;
    const date = document.getElementById('manualMarkDate').value;

    if (!confirm(`Mark ${checkboxes.length} students as PRESENT for ${period}?`)) return;

    for (const checkbox of checkboxes) {
        await submitManualMarking(checkbox.value, period, 'present', 'Bulk marking by admin', date);
    }
}

// Mark All Absent
async function markAllAbsent() {
    const checkboxes = document.querySelectorAll('.student-marking-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('Please select at least one student', 'warning');
        return;
    }

    const period = document.getElementById('manualMarkPeriod').value;
    const date = document.getElementById('manualMarkDate').value;

    if (!confirm(`Mark ${checkboxes.length} students as ABSENT for ${period}?`)) return;

    for (const checkbox of checkboxes) {
        await submitManualMarking(checkbox.value, period, 'absent', 'Bulk marking by admin', date);
    }
}

// Toggle All Students Marking
function toggleAllStudentsMarking(checked) {
    document.querySelectorAll('.student-marking-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
    });
}

// Load Audit Trail
async function loadAuditTrail() {
    try {
        console.log('📝 Loading audit trail...');
        
        const enrollmentNo = document.getElementById('auditTrailEnrollment').value;
        const date = document.getElementById('auditTrailDate').value;
        const period = document.getElementById('auditTrailPeriod').value;
        
        const params = new URLSearchParams();
        if (enrollmentNo) params.append('enrollmentNo', enrollmentNo);
        if (date) params.append('date', date);
        if (period) params.append('period', period);
        params.append('limit', '100');
        
        const response = await fetch(`${SERVER_URL}/api/attendance/audit-trail?${params}`);
        const data = await response.json();
        
        if (data.success) {
            renderAuditTrailTable(data.records || []);
            showNotification(`Loaded ${data.records.length} audit records`, 'success');
        } else {
            showNotification('Failed to load audit trail', 'error');
        }
    } catch (error) {
        console.error('Error loading audit trail:', error);
        showNotification('Error loading audit trail', 'error');
    }
}

function renderAuditTrailTable(records) {
    const tbody = document.getElementById('auditTrailTableBody');
    
    if (records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-title">No Audit Records Found</div>
                    <div class="empty-state-description">Try adjusting your filters</div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = records.map(record => {
        const date = new Date(record.date).toLocaleDateString();
        const timestamp = new Date(record.modifiedAt).toLocaleString();
        const oldStatusClass = record.oldStatus === 'present' ? 'period-present' : 'period-absent';
        const newStatusClass = record.newStatus === 'present' ? 'period-present' : 'period-absent';
        
        return `
            <tr>
                <td>${date}</td>
                <td>${record.period || '-'}</td>
                <td>${record.enrollmentNo}</td>
                <td>${record.studentName}</td>
                <td>${record.oldStatus ? `<span class="period-badge ${oldStatusClass}">${record.oldStatus}</span>` : '-'}</td>
                <td><span class="period-badge ${newStatusClass}">${record.newStatus}</span></td>
                <td>${record.modifierName}</td>
                <td>${record.modifierRole}</td>
                <td class="audit-reason" title="${record.reason || '-'}">${record.reason || '-'}</td>
                <td>${timestamp}</td>
            </tr>
        `;
    }).join('');
}

// Export Audit Trail as CSV
async function exportAuditTrailCSV() {
    try {
        showNotification('Exporting audit trail...', 'info');
        
        const enrollmentNo = document.getElementById('auditTrailEnrollment').value;
        const date = document.getElementById('auditTrailDate').value;
        const period = document.getElementById('auditTrailPeriod').value;
        
        const params = new URLSearchParams();
        if (enrollmentNo) params.append('enrollmentNo', enrollmentNo);
        if (date) params.append('date', date);
        if (period) params.append('period', period);
        params.append('limit', '10000');
        
        const response = await fetch(`${SERVER_URL}/api/attendance/audit-trail?${params}`);
        const data = await response.json();
        
        if (data.success && data.records.length > 0) {
            // Generate CSV
            const csvHeader = 'Date,Period,Enrollment No,Student Name,Old Status,New Status,Modified By,Role,Reason,Timestamp\n';
            const csvRows = data.records.map(record => {
                const date = new Date(record.date).toLocaleDateString();
                const timestamp = new Date(record.modifiedAt).toLocaleString();
                return `${date},${record.period || ''},${record.enrollmentNo},${record.studentName},${record.oldStatus || ''},${record.newStatus},${record.modifierName},${record.modifierRole},"${record.reason || ''}",${timestamp}`;
            }).join('\n');
            
            const csv = csvHeader + csvRows;
            
            // Download CSV
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit_trail_${Date.now()}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            showNotification('Audit trail exported successfully', 'success');
        } else {
            showNotification('No audit records to export', 'warning');
        }
    } catch (error) {
        console.error('Error exporting audit trail:', error);
        showNotification('Error exporting audit trail', 'error');
    }
}

// Setup Period-Based Attendance Event Listeners
function setupPeriodAttendanceListeners() {
    // Period Reports
    const refreshPeriodReportBtn = document.getElementById('refreshPeriodReportBtn');
    if (refreshPeriodReportBtn) {
        refreshPeriodReportBtn.addEventListener('click', loadPeriodReport);
    }
    
    const exportPeriodReportBtn = document.getElementById('exportPeriodReportBtn');
    if (exportPeriodReportBtn) {
        exportPeriodReportBtn.addEventListener('click', exportPeriodReportCSV);
    }
    
    // Manual Marking
    const loadStudentsForMarkingBtn = document.getElementById('loadStudentsForMarkingBtn');
    if (loadStudentsForMarkingBtn) {
        loadStudentsForMarkingBtn.addEventListener('click', loadStudentsForManualMarking);
    }
    
    const markAllPresentBtn = document.getElementById('markAllPresentBtn');
    if (markAllPresentBtn) {
        markAllPresentBtn.addEventListener('click', markAllPresent);
    }
    
    const markAllAbsentBtn = document.getElementById('markAllAbsentBtn');
    if (markAllAbsentBtn) {
        markAllAbsentBtn.addEventListener('click', markAllAbsent);
    }
    
    // Audit Trail
    const refreshAuditTrailBtn = document.getElementById('refreshAuditTrailBtn');
    if (refreshAuditTrailBtn) {
        refreshAuditTrailBtn.addEventListener('click', loadAuditTrail);
    }
    
    const exportAuditTrailBtn = document.getElementById('exportAuditTrailBtn');
    if (exportAuditTrailBtn) {
        exportAuditTrailBtn.addEventListener('click', exportAuditTrailCSV);
    }
    
    // Populate filter dropdowns for new sections
    populatePeriodReportFilters();
    populateManualMarkingFilters();
}

function populatePeriodReportFilters() {
    const semesterFilter = document.getElementById('periodReportSemester');
    if (semesterFilter) {
        semesterFilter.innerHTML = '<option value="">All Semesters</option>' + generateSemesterOptions();
    }
    
    const branchFilter = document.getElementById('periodReportBranch');
    if (branchFilter) {
        branchFilter.innerHTML = '<option value="">All Branches</option>' + generateBranchOptions();
    }
}

function populateManualMarkingFilters() {
    const semesterFilter = document.getElementById('manualMarkSemester');
    if (semesterFilter) {
        semesterFilter.innerHTML = '<option value="">-- Select Semester --</option>' + generateSemesterOptions();
    }
    
    const branchFilter = document.getElementById('manualMarkBranch');
    if (branchFilter) {
        branchFilter.innerHTML = '<option value="">-- Select Branch --</option>' + generateBranchOptions();
    }
    
    // Set today's date as default
    const dateInput = document.getElementById('manualMarkDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
}

// Initialize period-based attendance listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupPeriodAttendanceListeners();
});

// Update switchSection to handle new sections
const originalSwitchSection = switchSection;
switchSection = function(sectionName) {
    originalSwitchSection(sectionName);
    
    // Load data when switching to new sections
    switch (sectionName) {
        case 'period-reports':
            populatePeriodReportFilters();
            break;
        case 'manual-marking':
            populateManualMarkingFilters();
            break;
        case 'audit-trail':
            // Auto-load audit trail
            loadAuditTrail();
            break;
    }
};


// ============================================
// ATTENDANCE THRESHOLD SETTINGS
// ============================================

function setupThresholdSync() {
    const slider = document.getElementById('attendanceThreshold');
    const input = document.getElementById('attendanceThresholdValue');
    if (!slider || !input) return;

    slider.addEventListener('input', () => {
        input.value = slider.value;
        document.getElementById('currentThresholdDisplay').textContent = slider.value + '%';
    });
    input.addEventListener('input', () => {
        const v = Math.min(100, Math.max(1, parseInt(input.value) || 75));
        slider.value = v;
        document.getElementById('currentThresholdDisplay').textContent = v + '%';
    });
}

async function loadAttendanceThresholdSetting() {
    try {
        const res = await fetch(`${SERVER_URL}/api/settings/attendance-threshold`);
        const data = await res.json();
        if (data.success) {
            const v = data.threshold;
            const slider = document.getElementById('attendanceThreshold');
            const input = document.getElementById('attendanceThresholdValue');
            const display = document.getElementById('currentThresholdDisplay');
            if (slider) slider.value = v;
            if (input) input.value = v;
            if (display) display.textContent = v + '%';
        }
    } catch (e) {
        console.warn('Could not load threshold:', e.message);
    }
}

async function saveAttendanceThreshold() {
    const input = document.getElementById('attendanceThresholdValue');
    const value = parseInt(input?.value);
    if (isNaN(value) || value < 1 || value > 100) {
        showNotification('Threshold must be between 1 and 100', 'error');
        return;
    }
    try {
        const res = await fetch(`${SERVER_URL}/api/settings/attendance-threshold`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: value })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('currentThresholdDisplay').textContent = value + '%';
            showNotification(`Attendance threshold set to ${value}%`, 'success');
        } else {
            showNotification(data.error || 'Failed to save', 'error');
        }
    } catch (e) {
        showNotification('Server error: ' + e.message, 'error');
    }
}

// ── Theme System ──────────────────────────────────────────────────────────────

var THEME_META = {
    dark:     { icon: '🌙', label: 'Dark' },
    light:    { icon: '☀️', label: 'Light' },
    slate:    { icon: '🩶', label: 'Slate' },
    blossom:  { icon: '🌸', label: 'Blossom' },
    matcha:   { icon: '🍵', label: 'Matcha' },
    peach:    { icon: '🍑', label: 'Peach' },
    clay:     { icon: '🧸', label: 'Clay' },
};

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('adminTheme', theme);

    const meta = THEME_META[theme] || THEME_META.dark;
    const iconEl = document.getElementById('themeIcon');
    const labelEl = document.getElementById('themeLabel');
    if (iconEl) iconEl.textContent = meta.icon;
    if (labelEl) labelEl.textContent = meta.label;

    // Mark active option
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    closeThemePicker();
}

function toggleThemePicker() {
    const dropdown = document.getElementById('themeDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('open');
}

function closeThemePicker() {
    const dropdown = document.getElementById('themeDropdown');
    if (dropdown) dropdown.classList.remove('open');
}

// Close picker when clicking outside
document.addEventListener('click', (e) => {
    const picker = document.getElementById('themePicker');
    if (picker && !picker.contains(e.target)) {
        closeThemePicker();
    }
});

// Load saved theme on startup
(function initTheme() {
    const saved = localStorage.getItem('adminTheme') || 'dark';
    // Fall back to dark if a removed theme was saved
    const valid = Object.keys(THEME_META);
    applyTheme(valid.includes(saved) ? saved : 'dark');
})();

// ── Layout System ─────────────────────────────────────────────────────────────
// NOTE: No top-level const/var for meta — defined inline to avoid TDZ issues

function getLayoutMeta(layout) {
    var map = {
        default: { icon: '⬜', label: 'Default' },
        compact: { icon: '▪️',  label: 'Compact' },
    };
    return map[layout] || map['default'];
}

var VALID_LAYOUTS = ['default', 'compact'];

function applyLayout(layout) {
    // Wipe any previous layout attribute
    document.documentElement.removeAttribute('data-layout');

    if (layout && layout !== 'default') {
        document.documentElement.setAttribute('data-layout', layout);
    }

    localStorage.setItem('adminLayout', layout || 'default');

    var meta = getLayoutMeta(layout);
    var iconEl = document.getElementById('layoutIcon');
    var labelEl = document.getElementById('layoutLabel');
    if (iconEl) iconEl.textContent = meta.icon;
    if (labelEl) labelEl.textContent = meta.label;

    document.querySelectorAll('#layoutDropdown .theme-option').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.layout === layout);
    });

    closeLayoutPicker();
}

function toggleLayoutPicker() {
    var dropdown = document.getElementById('layoutDropdown');
    if (!dropdown) return;
    closeThemePicker();
    dropdown.classList.toggle('open');
}

function closeLayoutPicker() {
    var dropdown = document.getElementById('layoutDropdown');
    if (dropdown) dropdown.classList.remove('open');
}

document.addEventListener('click', function(e) {
    var picker = document.getElementById('layoutPicker');
    if (picker && !picker.contains(e.target)) closeLayoutPicker();
});

// Update top-bar breadcrumb title on section switch
var _origSwitchSection = switchSection;
switchSection = function(sectionName) {
    _origSwitchSection(sectionName);
    var titleEl = document.getElementById('topBarTitle');
    if (titleEl) {
        var labels = {
            dashboard: 'Dashboard', students: 'Students', teachers: 'Teachers',
            timetable: 'Timetable', subjects: 'Subjects', classrooms: 'Classrooms',
            calendar: 'Calendar', attendance: 'Attendance History',
            'period-reports': 'Period Reports', 'manual-marking': 'Manual Marking',
            'audit-trail': 'Audit Trail', periods: 'Period Settings',
            settings: 'Settings', 'coming-soon': 'Coming Soon',
        };
        titleEl.textContent = labels[sectionName] || sectionName;
    }
};

// Init layout after DOM is ready — safe, no TDZ risk
document.addEventListener('DOMContentLoaded', function() {
    var saved = localStorage.getItem('adminLayout') || 'default';
    applyLayout(VALID_LAYOUTS.indexOf(saved) !== -1 ? saved : 'default');
});


// ─── WALKTHROUGH ──────────────────────────────────────────────────────────────
const WT_STEPS = [
    {
        icon: '👋',
        title: 'Welcome to LetsBunk Admin Panel',
        body: `You're about to set up the attendance system for your college.<br><br>
               This quick tour walks you through the <strong>exact order</strong> to configure everything so the system works correctly from day one.<br><br>
               <div class="wt-tip">💡 Each step depends on the previous one — follow the order and you'll be done in minutes.</div>`,
        section: null
    },
    {
        icon: '⚙️',
        title: 'Step 1 — Settings (Start Here)',
        body: `Go to <span class="wt-tag">⚙️ Settings</span> first. Everything else depends on this.<br><br>
               Add your college's:<br>
               • <strong>Branches</strong> — e.g. <em>cse comp, Data Science, ECE</em><br>
               • <strong>Semesters</strong> — e.g. <em>1, 2, 3, 4, 5, 6, 7, 8</em><br>
               • <strong>Departments</strong> — e.g. <em>Computer Science, Mathematics</em><br>
               • <strong>Attendance Threshold</strong> — default 75%<br><br>
               <div class="wt-warn">⚠️ Without branches and semesters, no other section will work — dropdowns will be empty.</div>`,
        section: 'settings',
        nav: 'settings'
    },
    {
        icon: '⏰',
        title: 'Step 2 — Period Settings',
        body: `Go to <span class="wt-tag">⏰ Period Settings</span> and set your college's actual class timings.<br><br>
               Example:<br>
               <strong>P1:</strong> 09:00 – 09:50 &nbsp; <strong>P2:</strong> 09:50 – 10:40<br>
               <strong>P3:</strong> 10:40 – 11:30 &nbsp; <strong>P4:</strong> 11:30 – 12:20<br>
               <strong>P5:</strong> 12:20 – 13:10 &nbsp; <strong>P6:</strong> 13:10 – 14:00<br><br>
               Click <strong>"Save & Apply to All Timetables"</strong> after setting times.<br><br>
               <div class="wt-warn">⚠️ Wrong period times = wrong attendance. The system uses these times to identify which class is currently running.</div>`,
        section: 'periods',
        nav: 'periods'
    },
    {
        icon: '🏫',
        title: 'Step 3 — Classrooms',
        body: `Go to <span class="wt-tag">🏫 Classrooms</span> and add every classroom.<br><br>
               For each room you need:<br>
               • <strong>Room Number</strong> — e.g. <em>A101</em><br>
               • <strong>Building</strong> — e.g. <em>Block A</em><br>
               • <strong>Capacity</strong><br>
               • <strong>WiFi BSSID</strong> — the MAC address of the WiFi router in that room<br><br>
               <div class="wt-warn">⚠️ The BSSID is critical — it's how the app verifies a student is physically in the correct classroom. Without it, check-in will fail.</div>
               <div class="wt-tip">💡 To find a BSSID: connect to the classroom WiFi on your phone → use a WiFi analyzer app → copy the MAC address of that network.</div>`,
        section: 'classrooms',
        nav: 'classrooms'
    },
    {
        icon: '📚',
        title: 'Step 4 — Subjects',
        body: `Go to <span class="wt-tag">📚 Subjects</span> and add every subject for each semester+branch.<br><br>
               Required for each subject:<br>
               • <strong>Subject Code</strong> — e.g. <em>CS301</em><br>
               • <strong>Subject Name</strong> — e.g. <em>Data Structures</em> (this appears in attendance records)<br>
               • <strong>Semester + Branch</strong><br>
               • <strong>Type</strong> — Theory / Lab / Practical<br><br>
               Use <strong>Import CSV</strong> to add many subjects at once.<br><br>
               <div class="wt-tip">💡 Subject names must match exactly what you'll put in the timetable — the calendar filter uses these names.</div>`,
        section: 'subjects',
        nav: 'subjects'
    },
    {
        icon: '👨‍🏫',
        title: 'Step 5 — Teachers',
        body: `Go to <span class="wt-tag">👨‍🏫 Teachers</span> and add every teacher.<br><br>
               Required fields:<br>
               • <strong>Employee ID</strong> — their login ID for the app<br>
               • <strong>Name, Email, Password</strong><br>
               • <strong>Department</strong> — from Step 1<br>
               • <strong>Subjects Taught</strong> — select from the subjects you added in Step 4<br>
               • <strong>Date of Birth</strong><br><br>
               <div class="wt-tip">💡 Enable "Can Edit Timetable" for teachers who should be able to modify the class schedule.</div>`,
        section: 'teachers',
        nav: 'teachers'
    },
    {
        icon: '👨‍🎓',
        title: 'Step 6 — Students',
        body: `Go to <span class="wt-tag">👨‍🎓 Students</span> and add all students.<br><br>
               Use <strong>Bulk Import (CSV)</strong> for large batches. Required columns:<br>
               <code style="font-size:12px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">enrollmentNo, name, email, branch, semester, dob</code><br><br>
               • <strong>Enrollment No</strong> = their login ID in the app<br>
               • <strong>Branch + Semester</strong> must match exactly what you added in Step 1<br>
               • <strong>DOB</strong> = default password (format: YYYY-MM-DD)<br><br>
               <div class="wt-warn">⚠️ Branch and semester must match Settings exactly — a typo means the student won't see the right timetable.</div>`,
        section: 'students',
        nav: 'students'
    },
    {
        icon: '📅',
        title: 'Step 7 — Timetable',
        body: `Go to <span class="wt-tag">📅 Timetable</span> and create a schedule for each Semester+Branch.<br><br>
               For each day, assign:<br>
               • <strong>Subject</strong> to each period slot<br>
               • <strong>Teacher</strong> for that subject<br>
               • <strong>Room</strong> from your classrooms list<br><br>
               Use <strong>Auto Fill</strong> to quickly populate all slots, then adjust manually.<br><br>
               <div class="wt-tip">💡 Create one timetable per Semester+Branch combination. Students and teachers will see their own timetable automatically based on their profile.</div>`,
        section: 'timetable',
        nav: 'timetable'
    },
    {
        icon: '📆',
        title: 'Step 8 — Academic Calendar (Optional)',
        body: `Go to <span class="wt-tag">📆 Calendar</span> to add holidays, exam dates, and events.<br><br>
               These appear in the student and teacher app calendar view. Not required for attendance to work but recommended.<br><br>
               <div class="wt-tip">💡 Holidays marked here will show as 🏖️ badges on the calendar so students know there's no class.</div>`,
        section: 'calendar',
        nav: 'calendar'
    },
    {
        icon: '🔧',
        title: 'Step 9 — Final Setup (One-Time)',
        body: `Go to <span class="wt-tag">📆 Calendar</span> and run these three buttons in order:<br><br>
               1. <strong>🔧 DB Migrate</strong> — fixes any data inconsistencies<br>
               2. <strong>🔄 Backfill History</strong> — populates subject history so the calendar filter works<br>
               3. <strong>🔁 Resync Attendance</strong> — recalculates all attendance summaries<br><br>
               <div class="wt-tip">💡 These are safe to run multiple times. Run them again anytime you make bulk changes to students or timetables.</div>`,
        section: 'calendar',
        nav: 'calendar'
    },
    {
        icon: '🎉',
        title: 'You\'re All Set!',
        body: `Your LetsBunk system is configured and ready.<br><br>
               <strong>Students</strong> can now log in to the app with their enrollment number and DOB, start the timer when they're in class, and track their attendance.<br><br>
               <strong>Teachers</strong> can log in to view live attendance, send random rings, and manage their timetable.<br><br>
               <div class="wt-tip">💡 You can restart this walkthrough anytime from <strong>⚙️ Settings → Restart Setup Walkthrough</strong>.</div>`,
        section: null
    }
];

let wtCurrentStep = 0;

function startWalkthrough(force = false) {
    const seen = localStorage.getItem('wt_completed');
    if (seen && !force) return;

    wtCurrentStep = 0;
    const overlay = document.getElementById('walkthroughOverlay');
    overlay.style.display = 'block';
    overlay.classList.add('active');
    renderWalkthroughStep();
}

function renderWalkthroughStep() {
    const step     = WT_STEPS[wtCurrentStep];
    const total    = WT_STEPS.length;
    const pct      = Math.round(((wtCurrentStep + 1) / total) * 100);
    const isLast   = wtCurrentStep === total - 1;
    const isFirst  = wtCurrentStep === 0;

    document.getElementById('wtProgressFill').style.width = pct + '%';
    document.getElementById('wtStepCounter').textContent  = `Step ${wtCurrentStep + 1} of ${total}`;
    document.getElementById('wtIcon').textContent         = step.icon;
    document.getElementById('wtTitle').textContent        = step.title;
    document.getElementById('wtBody').innerHTML           = step.body;

    const prevBtn = document.getElementById('wtPrevBtn');
    const nextBtn = document.getElementById('wtNextBtn');
    prevBtn.style.display = isFirst ? 'none' : 'block';
    nextBtn.textContent   = isLast ? '✅ Finish' : 'Next →';
    nextBtn.className     = isLast ? 'wt-btn wt-btn-finish' : 'wt-btn wt-btn-next';

    // Navigate to the relevant section
    if (step.nav) {
        switchSection(step.nav);
        // Spotlight the nav item
        setTimeout(() => spotlightNav(step.nav), 100);
    } else {
        clearSpotlight();
    }
}

function spotlightNav(sectionName) {
    const navBtn    = document.querySelector(`[data-section="${sectionName}"]`);
    const spotlight = document.getElementById('wtSpotlight');
    if (!navBtn) { clearSpotlight(); return; }

    const rect = navBtn.getBoundingClientRect();
    spotlight.style.display = 'block';
    spotlight.style.left    = (rect.left - 4) + 'px';
    spotlight.style.top     = (rect.top  - 4) + 'px';
    spotlight.style.width   = (rect.width  + 8) + 'px';
    spotlight.style.height  = (rect.height + 8) + 'px';
}

function clearSpotlight() {
    document.getElementById('wtSpotlight').style.display = 'none';
}

function walkthroughNext() {
    if (wtCurrentStep < WT_STEPS.length - 1) {
        wtCurrentStep++;
        renderWalkthroughStep();
    } else {
        walkthroughFinish();
    }
}

function walkthroughPrev() {
    if (wtCurrentStep > 0) {
        wtCurrentStep--;
        renderWalkthroughStep();
    }
}

function walkthroughSkip() {
    if (confirm('Skip the setup walkthrough? You can restart it anytime from Settings.')) {
        walkthroughFinish();
    }
}

function walkthroughFinish() {
    localStorage.setItem('wt_completed', '1');
    const overlay = document.getElementById('walkthroughOverlay');
    overlay.style.display = 'none';
    overlay.classList.remove('active');
    clearSpotlight();
    // Go to dashboard after finishing
    switchSection('dashboard');
}

// Auto-start on first login (after app loads)
document.addEventListener('DOMContentLoaded', () => {
    // Delay slightly so the app initialises first
    setTimeout(() => {
        if (isLoggedIn()) startWalkthrough(false);
    }, 800);
});
