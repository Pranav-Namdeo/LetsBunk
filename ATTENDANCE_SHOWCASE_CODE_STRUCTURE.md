# Attendance Showcase - Code Structure & Implementation Guide

## Backend API Endpoints to Add (server.js)

### 1. Overall Attendance Percentage Till Date
```javascript
// GET /api/attendance/student/:enrollmentNo/overall-percentage
app.get('/api/attendance/student/:enrollmentNo/overall-percentage', async (req, res) => {
  const { enrollmentNo } = req.params;
  const { tillDate } = req.query; // YYYY-MM-DD format
  
  // 1. Get all attendance records till date
  // 2. Filter out weekends/holidays
  // 3. Calculate: presentDays / totalWorkingDays * 100
  // 4. Return { percentage, presentDays, totalWorkingDays, lastDate }
});
```

### 2. Daily Summary with Period Breakdown
```javascript
// GET /api/attendance/student/:enrollmentNo/date/:date/summary
app.get('/api/attendance/student/:enrollmentNo/date/:date/summary', async (req, res) => {
  const { enrollmentNo, date } = req.params;
  
  // 1. Get all period attendance for that date
  // 2. Group by period
  // 3. Calculate daily percentage
  // 4. Return { periods: [...], dailyPercentage, totalPeriods, presentPeriods }
});
```

### 3. Subject-specific Stats for Student
```javascript
// GET /api/attendance/student/:enrollmentNo/subject/:subject/stats
app.get('/api/attendance/student/:enrollmentNo/subject/:subject/stats', async (req, res) => {
  const { enrollmentNo, subject } = req.params;
  
  // 1. Get all period attendance for that subject
  // 2. Calculate: presentPeriods / totalPeriods * 100
  // 3. Get all dates when subject was taught
  // 4. Return { percentage, presentPeriods, totalPeriods, dates: [...] }
});
```

### 4. Dates When Subject Was Taught
```javascript
// GET /api/attendance/subject/:subject/dates
app.get('/api/attendance/subject/:subject/dates', async (req, res) => {
  const { subject } = req.params;
  const { semester, branch } = req.query;
  
  // 1. Get all period attendance records for subject
  // 2. Filter by semester/branch if provided
  // 3. Get unique dates
  // 4. Return { dates: [...], totalClasses, semester, branch }
});
```

### 5. Teacher's Class Allocations
```javascript
// GET /api/attendance/teacher/:teacherId/class-allocation
app.get('/api/attendance/teacher/:teacherId/class-allocation', async (req, res) => {
  const { teacherId } = req.params;
  
  // 1. Get timetable entries for teacher
  // 2. Group by semester+branch+period
  // 3. Get subject info
  // 4. Return { allocations: [{ semester, branch, period, subject, room, startTime, endTime }] }
});
```

### 6. Class-wise Attendance Stats
```javascript
// GET /api/attendance/teacher/:teacherId/class/:semester/:branch/attendance
app.get('/api/attendance/teacher/:teacherId/class/:semester/:branch/attendance', async (req, res) => {
  const { teacherId, semester, branch } = req.params;
  const { startDate, endDate } = req.query;
  
  // 1. Get all period attendance for teacher's class
  // 2. Filter by date range
  // 3. Calculate: totalStudents, presentCount, absentCount, percentage
  // 4. Return { stats, lectures: [...] }
});
```

### 7. Lecture-specific Attendance
```javascript
// GET /api/attendance/teacher/:teacherId/lecture/:date/:period/attendance
app.get('/api/attendance/teacher/:teacherId/lecture/:date/:period/attendance', async (req, res) => {
  const { teacherId, date, period } = req.params;
  
  // 1. Get all period attendance for that lecture
  // 2. Get student details
  // 3. Calculate attendance stats
  // 4. Return { students: [...], totalStudents, presentCount, percentage }
});
```

---

## Utility Functions to Add (server.js)

### Working Days Calculation
```javascript
// Calculate working days (exclude weekends and holidays)
async function getWorkingDays(startDate, endDate) {
  const holidays = await Holiday.find({
    date: { $gte: startDate, $lte: endDate }
  });
  
  const holidayDates = new Set(holidays.map(h => h.date.toDateString()));
  
  let workingDays = 0;
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const dateString = currentDate.toDateString();
    
    // Skip weekends (0=Sunday, 6=Saturday) and holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateString)) {
      workingDays++;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDays;
}
```

### Last Working Day Detection
```javascript
// Get last working day till today
async function getLastWorkingDay() {
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  const holidays = await Holiday.find({
    date: { $lte: currentDate }
  });
  
  const holidayDates = new Set(holidays.map(h => h.date.toDateString()));
  
  while (currentDate >= new Date('2025-01-01')) {
    const dayOfWeek = currentDate.getDay();
    const dateString = currentDate.toDateString();
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateString)) {
      return currentDate;
    }
    
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  return new Date();
}
```

### Overall Percentage Calculation
```javascript
// Calculate overall attendance percentage
async function calculateOverallPercentage(enrollmentNo, tillDate) {
  const startDate = new Date('2025-01-01');
  const endDate = new Date(tillDate);
  
  // Get all attendance records
  const records = await AttendanceRecord.find({
    enrollmentNo,
    date: { $gte: startDate, $lte: endDate }
  });
  
  // Count present days
  const presentDays = records.filter(r => r.status === 'present').length;
  
  // Get working days
  const workingDays = await getWorkingDays(startDate, endDate);
  
  const percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;
  
  return {
    percentage: Math.round(percentage * 100) / 100,
    presentDays,
    totalWorkingDays: workingDays,
    lastDate: endDate
  };
}
```

---

## Frontend Components to Add (admin-panel/renderer.js)

### 1. Attendance Showcase Section HTML
```html
<div id="attendanceShowcase" class="section" style="display:none;">
  <div class="section-header">
    <h2>📊 Attendance Showcase</h2>
    <p>View detailed attendance analytics by student, subject, date, or teacher</p>
  </div>
  
  <!-- View Selector -->
  <div class="showcase-view-selector">
    <button class="view-btn active" data-view="student">👤 Student View</button>
    <button class="view-btn" data-view="subject">📚 Subject View</button>
    <button class="view-btn" data-view="date">📅 Date View</button>
    <button class="view-btn" data-view="teacher">👨‍🏫 Teacher View</button>
  </div>
  
  <!-- Student View -->
  <div id="studentView" class="showcase-view">
    <div class="filters">
      <select id="studentBranch" class="filter-select">
        <option value="">Select Branch</option>
      </select>
      <select id="studentSemester" class="filter-select">
        <option value="">Select Semester</option>
      </select>
    </div>
    
    <div id="studentList" class="student-list">
      <!-- Student items will be inserted here -->
    </div>
    
    <!-- Calendar Modal -->
    <div id="calendarModal" class="modal" style="display:none;">
      <div class="modal-content">
        <span class="close">&times;</span>
        <h3 id="calendarTitle">Attendance Calendar</h3>
        <div id="calendar" class="calendar"></div>
      </div>
    </div>
    
    <!-- Period Breakdown Modal -->
    <div id="periodModal" class="modal" style="display:none;">
      <div class="modal-content">
        <span class="close">&times;</span>
        <h3 id="periodTitle">Period Breakdown</h3>
        <div id="periodList" class="period-list">
          <!-- Period items will be inserted here -->
        </div>
      </div>
    </div>
  </div>
  
  <!-- Subject View -->
  <div id="subjectView" class="showcase-view" style="display:none;">
    <div class="filters">
      <select id="subjectBranch" class="filter-select">
        <option value="">Select Branch</option>
      </select>
      <select id="subjectSemester" class="filter-select">
        <option value="">Select Semester</option>
      </select>
      <select id="subjectSelect" class="filter-select">
        <option value="">Select Subject</option>
      </select>
    </div>
    
    <div id="subjectStats" class="subject-stats">
      <!-- Subject stats will be inserted here -->
    </div>
  </div>
  
  <!-- Date View -->
  <div id="dateView" class="showcase-view" style="display:none;">
    <div class="filters">
      <input type="date" id="dateSelect" class="filter-input">
      <select id="dateBranch" class="filter-select">
        <option value="">Select Branch</option>
      </select>
      <select id="dateSemester" class="filter-select">
        <option value="">Select Semester</option>
      </select>
    </div>
    
    <div id="dateStudentList" class="student-list">
      <!-- Students for date will be inserted here -->
    </div>
  </div>
  
  <!-- Teacher View -->
  <div id="teacherView" class="showcase-view" style="display:none;">
    <div class="filters">
      <select id="teacherSelect" class="filter-select">
        <option value="">Select Teacher</option>
      </select>
    </div>
    
    <div id="teacherStats" class="teacher-stats">
      <!-- Teacher stats will be inserted here -->
    </div>
  </div>
</div>
```

### 2. Event Listeners
```javascript
// View selector
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    const view = e.target.dataset.view;
    document.querySelectorAll('.showcase-view').forEach(v => v.style.display = 'none');
    document.getElementById(view + 'View').style.display = 'block';
    
    loadShowcaseView(view);
  });
});

// Branch/Semester selectors
document.getElementById('studentBranch').addEventListener('change', loadStudentList);
document.getElementById('studentSemester').addEventListener('change', loadStudentList);
```

### 3. API Call Functions
```javascript
// Load student list
async function loadStudentList() {
  const branch = document.getElementById('studentBranch').value;
  const semester = document.getElementById('studentSemester').value;
  
  if (!branch || !semester) return;
  
  try {
    const response = await fetch(`/api/students?branch=${branch}&semester=${semester}`);
    const data = await response.json();
    
    const studentList = document.getElementById('studentList');
    studentList.innerHTML = '';
    
    for (const student of data.students) {
      const percentage = await getOverallPercentage(student.enrollmentNo);
      
      const item = document.createElement('div');
      item.className = 'student-item';
      item.innerHTML = `
        <div class="student-info">
          <h4>${student.name}</h4>
          <p>${student.enrollmentNo}</p>
        </div>
        <div class="student-percentage">${percentage.percentage}%</div>
        <button onclick="showCalendar('${student.enrollmentNo}')">View Calendar</button>
      `;
      
      studentList.appendChild(item);
    }
  } catch (error) {
    console.error('Error loading students:', error);
  }
}

// Get overall percentage
async function getOverallPercentage(enrollmentNo) {
  try {
    const response = await fetch(`/api/attendance/student/${enrollmentNo}/overall-percentage`);
    return await response.json();
  } catch (error) {
    console.error('Error getting percentage:', error);
    return { percentage: 0 };
  }
}

// Show calendar
async function showCalendar(enrollmentNo) {
  try {
    const response = await fetch(`/api/attendance/student/${enrollmentNo}/dates`);
    const data = await response.json();
    
    // Build calendar UI
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = buildCalendarHTML(data.dates);
    
    document.getElementById('calendarModal').style.display = 'block';
  } catch (error) {
    console.error('Error loading calendar:', error);
  }
}

// Show period breakdown
async function showPeriodBreakdown(enrollmentNo, date) {
  try {
    const response = await fetch(`/api/attendance/student/${enrollmentNo}/date/${date}/summary`);
    const data = await response.json();
    
    const periodList = document.getElementById('periodList');
    periodList.innerHTML = '';
    
    for (const period of data.periods) {
      const item = document.createElement('div');
      item.className = 'period-item';
      item.innerHTML = `
        <div class="period-info">
          <h4>${period.period}: ${period.subject}</h4>
          <p>${period.teacher} - ${period.room}</p>
        </div>
        <div class="period-status ${period.status}">${period.status}</div>
      `;
      periodList.appendChild(item);
    }
    
    document.getElementById('periodModal').style.display = 'block';
  } catch (error) {
    console.error('Error loading periods:', error);
  }
}
```

---

## Styling to Add (admin-panel/styles.css)

```css
/* Attendance Showcase */
.showcase-view-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.view-btn {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.view-btn.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.showcase-view {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-select, .filter-input {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.student-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
}

.student-item {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-left: 4px solid #007bff;
}

.student-info h4 {
  margin: 0;
  font-size: 16px;
}

.student-info p {
  margin: 5px 0 0 0;
  color: #666;
  font-size: 12px;
}

.student-percentage {
  font-size: 24px;
  font-weight: bold;
  color: #007bff;
  min-width: 60px;
  text-align: center;
}

.student-item button {
  padding: 8px 15px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.student-item button:hover {
  background: #0056b3;
}

/* Calendar */
.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}

.calendar-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
}

.calendar-day.present {
  background: #28a745;
  color: white;
}

.calendar-day.absent {
  background: #dc3545;
  color: white;
}

.calendar-day.no-class {
  background: #e9ecef;
  color: #666;
}

/* Period List */
.period-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.period-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
  border-left: 4px solid #007bff;
}

.period-info h4 {
  margin: 0;
  font-size: 14px;
}

.period-info p {
  margin: 5px 0 0 0;
  color: #666;
  font-size: 12px;
}

.period-status {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.period-status.present {
  background: #d4edda;
  color: #155724;
}

.period-status.absent {
  background: #f8d7da;
  color: #721c24;
}

/* Modal */
.modal {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.4);
}

.modal-content {
  background-color: white;
  margin: 5% auto;
  padding: 20px;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.close {
  color: #aaa;
  float: right;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}

.close:hover {
  color: black;
}
```

---

## Implementation Checklist

- [ ] Add 7 new API endpoints to server.js
- [ ] Add utility functions (working days, percentage calculation)
- [ ] Add HTML structure to admin-panel/renderer.js
- [ ] Add event listeners for view switching
- [ ] Add API call functions
- [ ] Add calendar building function
- [ ] Add styling to admin-panel/styles.css
- [ ] Test each view (student, subject, date, teacher)
- [ ] Test with real data
- [ ] Optimize performance for large datasets
- [ ] Add error handling
- [ ] Add loading states

