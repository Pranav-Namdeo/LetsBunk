// Azure deployment trigger - Updated December 14, 2024 - v2.9 - Fix rate limiting for concurrent student logins.
const path = require('path');
const fs = require('fs');
const os = require('os');

// Function to get server IP addresses
function getServerIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ interface: name, ip: iface.address });
            }
        }
    }

    return ips;
}

// Load environment variables
// On Render, variables are set in dashboard (no .env file needed)
// For local development, load from .env file
if (fs.existsSync(path.join(__dirname, '.env'))) {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    console.log('📝 Loaded .env file from current directory');
} else if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    console.log('📝 Loaded .env file from parent directory');
} else {
    // No .env file, use system environment variables (Render, production)
    console.log('📝 Using system environment variables (no .env file)');
}
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt'); // Add bcrypt for password hashing

// Cloudinary configuration
const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const server = http.createServer(app);

// CORS Configuration - Restrict in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:8081'];

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    transports: ['websocket', 'polling']
});

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : "*",
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Reduced from 100mb for security
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`📥 ${req.method} ${req.path} - ${req.ip}`);

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
        console.log(`📤 ${statusEmoji} ${req.method} ${req.path} - ${status} (${duration}ms)`);
    });

    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            error: 'Invalid JSON in request body'
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }

    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Set timeout for all requests
server.timeout = 120000; // 2 minutes
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds

// Log slow requests
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.log(`⚠️  Slow request: ${req.method} ${req.path} took ${duration}ms`);
        }
    });
    next();
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// MongoDB Connection with proper pool configuration
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10, // Maximum number of connections in the pool
    minPoolSize: 2,  // Minimum number of connections
    maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
}).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    console.log('📍 Database:', mongoose.connection.name);

    // Create indexes for better performance
    createDatabaseIndexes();
}).catch(err => {
    console.log('⚠️  MongoDB not connected, using in-memory storage');
    console.log('Error:', err.message);
});

// Function to create database indexes
async function createDatabaseIndexes() {
    try {
        console.log('📊 Creating database indexes...');

        // StudentManagement indexes
        await StudentManagement.collection.createIndex({ enrollmentNo: 1 }, { unique: true });
        await StudentManagement.collection.createIndex({ email: 1 });
        await StudentManagement.collection.createIndex({ semester: 1, course: 1 });
        await StudentManagement.collection.createIndex({ isRunning: 1 });

        // AttendanceSession indexes
        await AttendanceSession.collection.createIndex({ studentId: 1, date: -1 });
        await AttendanceSession.collection.createIndex({ date: -1, isActive: 1 });

        // AttendanceRecord indexes
        await AttendanceRecord.collection.createIndex({ enrollmentNo: 1, date: -1 });
        await AttendanceRecord.collection.createIndex({ date: -1 });
        await AttendanceRecord.collection.createIndex({ semester: 1, branch: 1, date: -1 });
        await AttendanceRecord.collection.createIndex({ 'lectures.teacher': 1, date: -1 });

        // Timetable indexes
        await Timetable.collection.createIndex({ semester: 1, branch: 1 }, { unique: true });

        // Teacher indexes
        await Teacher.collection.createIndex({ employeeId: 1 }, { unique: true });
        await Teacher.collection.createIndex({ email: 1 });

        // Classroom indexes
        await Classroom.collection.createIndex({ roomNumber: 1 }, { unique: true });
        await Classroom.collection.createIndex({ wifiBSSID: 1 });

        console.log('✅ Database indexes created successfully');
    } catch (error) {
        console.error('⚠️  Error creating indexes:', error.message);
    }
}

// Handle MongoDB connection errors
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
});

// Student Schema
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    status: { type: String, enum: ['attending', 'absent', 'present'], default: 'absent' },
    timerValue: { type: Number, default: 120 },
    isRunning: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
    sessionDate: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

// Timetable Schema
const timetableSchema = new mongoose.Schema({
    semester: { type: String, required: true },
    branch: { type: String, required: true },
    periods: [{
        number: Number,
        startTime: String,
        endTime: String
    }],
    timetable: {
        sunday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        monday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        tuesday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        wednesday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        thursday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        friday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }],
        saturday: [{ period: Number, subject: String, teacher: String, teacherName: String, room: String, isBreak: Boolean }]
    },
    lastUpdated: { type: Date, default: Date.now }
});

const Timetable = mongoose.model('Timetable', timetableSchema);

// Subject Schema - Manage subjects for each semester and branch
const subjectSchema = new mongoose.Schema({
    subjectCode: { type: String, required: true, unique: true }, // e.g., "CS301", "DS302"
    subjectName: { type: String, required: true }, // e.g., "Data Structures", "OOPM"
    shortName: { type: String }, // e.g., "DS", "OOPM" (for display in timetable)
    semester: { type: String, required: true }, // e.g., "3", "4"
    branch: { type: String, required: true }, // e.g., "B.Tech Computer Science"
    credits: { type: Number, default: 3 }, // Credit hours
    type: { type: String, enum: ['Theory', 'Lab', 'Practical', 'Training'], default: 'Theory' },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Index for faster queries
subjectSchema.index({ semester: 1, branch: 1 });
subjectSchema.index({ subjectCode: 1 });

const Subject = mongoose.model('Subject', subjectSchema);

// Attendance Record Schema
// Attendance Session Schema (Real-time tracking)
const attendanceSessionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    enrollmentNo: { type: String, required: true },  // Changed from enrollmentNumber to match student schema
    date: { type: Date, required: true },

    // Unified timer fields
    sessionStartTime: { type: Date, required: true },  // When timer started
    timerValue: { type: Number, default: 0 },          // Current timer in seconds
    isActive: { type: Boolean, default: true },
    isPaused: { type: Boolean, default: false },
    lastUpdate: { type: Date, default: Date.now },

    // Security and validation
    pauseReason: { type: String },
    pauseStartTime: { type: Date },
    pausedDuration: { type: Number, default: 0 },      // Total paused time in seconds
    resumeReason: { type: String },
    stopReason: { type: String },
    stopTime: { type: Date },

    // Grace period management (STUDENT-FRIENDLY: No limits)
    gracePeriodsUsed: { type: Number, default: 0 },
    maxGracePeriods: { type: Number, default: 999 }, // Unlimited grace periods

    // Device and security info
    deviceInfo: {
        platform: String,
        timestamp: String
    },

    // Legacy fields (for backward compatibility)
    wifiConnected: { type: Boolean, default: true },
    currentClass: {
        period: String,
        subject: String,
        teacher: String,
        teacherName: String,
        room: String,
        startTime: String,
        endTime: String,
        classStartedAt: Date
    },

    semester: String,
    branch: String,

    // Random Ring tracking (unified)
    randomRingId: String,
    randomRingTime: Date,
    timeBeforeRandomRing: Number,

    // Security audit trail
    securityEvents: [{
        type: { type: String }, // 'start', 'stop', 'pause', 'resume', 'sync', 'drift_detected'
        timestamp: { type: Date, default: Date.now },
        reason: String,
        data: mongoose.Schema.Types.Mixed
    }]
});

const AttendanceSession = mongoose.model('AttendanceSession', attendanceSessionSchema);

// Attendance Record Schema (Daily summary)
const attendanceRecordSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    enrollmentNo: { type: String, required: true },  // Changed from enrollmentNumber to match student schema
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'leave'], required: true },

    // Detailed lecture-wise attendance
    lectures: [{
        period: String,                    // P1, P2, P3, etc.
        subject: String,
        teacher: String,                   // Teacher ID (e.g., TEACH001)
        teacherName: String,               // Teacher's full name
        room: String,
        startTime: String,                 // HH:MM format
        endTime: String,

        // Time tracking (in SECONDS for precision)
        lectureStartedAt: Date,            // ISO timestamp
        lectureEndedAt: Date,
        studentCheckIn: Date,              // When student's timer started

        attended: Number,                  // seconds attended
        total: Number,                     // total lecture seconds (usually 3000 = 50min)
        percentage: Number,                // attendance percentage
        present: Boolean,                  // true if >= 75%

        // Verification events
        verifications: [{
            time: Date,
            type: { type: String, enum: ['face', 'random_ring', 'manual'] },
            success: Boolean,
            event: String                  // 'morning_checkin', 'random_ring', 'periodic'
        }]
    }],

    // Daily totals (in SECONDS)
    totalAttended: { type: Number, default: 0 },      // total seconds attended in classes
    totalClassTime: { type: Number, default: 0 },     // total class seconds
    dayPercentage: { type: Number, default: 0 },      // daily attendance %

    // Timer tracking
    timerValue: { type: Number, default: 0 },         // Total seconds in college
    checkInTime: Date,                                 // First check-in
    checkOutTime: Date,                                // Last check-out

    semester: String,
    branch: String,
    createdAt: { type: Date, default: Date.now }
});

// Indexes for faster queries
attendanceRecordSchema.index({ enrollmentNo: 1, date: -1 });  // Changed from enrollmentNumber
attendanceRecordSchema.index({ date: -1 });
attendanceRecordSchema.index({ 'lectures.teacher': 1, date: -1 });

const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);

// In-memory storage as fallback
let studentsMemory = [];
let timetableMemory = {};
let studentManagementMemory = [];
let teachersMemory = [];
let classroomsMemory = [];
let attendanceRecordsMemory = [];

// SDUI Configuration endpoint
app.get('/api/config', (req, res) => {
    res.json({
        version: '2.0.0',
        roleSelection: {
            backgroundColor: '#0a1628',
            title: { text: 'Who are you?', fontSize: 36, color: '#00f5ff', fontWeight: 'bold' },
            subtitle: { text: 'Select your role to continue', fontSize: 16, color: '#00d9ff' },
            roles: [
                {
                    id: 'student',
                    text: 'Student',
                    icon: '🎓',
                    backgroundColor: '#00d9ff',
                    textColor: '#0a1628'
                },
                {
                    id: 'teacher',
                    text: 'Teacher',
                    icon: '👨‍🏫',
                    backgroundColor: '#00bfff',
                    textColor: '#0a1628'
                }
            ]
        },
        studentNameInput: {
            backgroundColor: '#0a1628',
            title: { text: 'Enter Your Name', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
            subtitle: { text: 'This will be visible to your teacher', fontSize: 14, color: '#00d9ff' },
            placeholder: 'Your Name',
            buttonText: 'START SESSION',
            inputBackgroundColor: '#0d1f3c',
            inputTextColor: '#00f5ff',
            inputBorderColor: '#00d9ff'
        },
        studentScreen: {
            backgroundColor: '#0a1628',
            title: { text: 'Countdown Timer', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
            timer: {
                duration: 120,
                backgroundColor: '#0d1f3c',
                textColor: '#00f5ff',
                fontSize: 72,
                borderRadius: 20
            },
            buttons: [
                {
                    id: 'startPause',
                    text: 'START',
                    pauseText: 'PAUSE',
                    backgroundColor: '#00f5ff',
                    textColor: '#0a1628',
                    fontSize: 18
                },
                {
                    id: 'reset',
                    text: 'RESET',
                    backgroundColor: '#00d9ff',
                    textColor: '#0a1628',
                    fontSize: 18
                }
            ]
        },
        teacherScreen: {
            backgroundColor: '#0a1628',
            title: { text: 'Live Attendance', fontSize: 32, color: '#00f5ff', fontWeight: 'bold' },
            subtitle: { text: 'Real-time student tracking', fontSize: 16, color: '#00d9ff' },
            statusColors: {
                attending: '#00ff88',
                absent: '#ff4444',
                present: '#00d9ff'
            },
            cardBackgroundColor: '#0d1f3c',
            cardBorderColor: '#00d9ff'
        }
    });
});

// Student APIs
app.post('/api/student/register', async (req, res) => {
    try {
        const { name } = req.body;

        if (mongoose.connection.readyState === 1) {
            const student = new Student({ name, status: 'absent' });
            await student.save();
            res.json({ success: true, studentId: student._id, student });
        } else {
            const student = {
                _id: Date.now().toString(),
                name,
                status: 'absent',
                timerValue: 120,
                isRunning: false
            };
            studentsMemory.push(student);
            res.json({ success: true, studentId: student._id, student });
        }

        // Notify all teachers
        io.emit('student_registered', { name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Timetable APIs
// Get all timetables (for conflict checking)
app.get('/api/timetables', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const timetables = await Timetable.find({});
            res.json({ success: true, timetables, count: timetables.length });
        } else {
            // Return from memory if DB not connected
            const timetables = Object.values(timetableMemory);
            res.json({ success: true, timetables, count: timetables.length });
        }
    } catch (error) {
        console.error('❌ Error fetching all timetables:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/timetable/:semester/:branch', async (req, res) => {
    try {
        const { semester, branch } = req.params;

        if (mongoose.connection.readyState === 1) {
            let timetable = await Timetable.findOne({ semester, branch });
            if (!timetable) {
                timetable = createDefaultTimetable(semester, branch);
            }
            res.json({ success: true, timetable });
        } else {
            const key = `${semester}_${branch}`;
            let timetable = timetableMemory[key];
            if (!timetable) {
                timetable = createDefaultTimetable(semester, branch);
                timetableMemory[key] = timetable;
            }
            res.json({ success: true, timetable });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/timetable', async (req, res) => {
    try {
        const { semester, branch, periods, timetable } = req.body;

        if (mongoose.connection.readyState === 1) {
            let existingTimetable = await Timetable.findOne({ semester, branch });
            if (existingTimetable) {
                existingTimetable.periods = periods;
                existingTimetable.timetable = timetable;
                existingTimetable.lastUpdated = new Date();
                await existingTimetable.save();
            } else {
                existingTimetable = new Timetable({ semester, branch, periods, timetable });
                await existingTimetable.save();
            }
            res.json({ success: true, timetable: existingTimetable });
        } else {
            const key = `${semester}_${branch}`;
            timetableMemory[key] = { semester, branch, periods, timetable, lastUpdated: new Date() };
            res.json({ success: true, timetable: timetableMemory[key] });
        }

        // Notify all students
        io.emit('timetable_updated', { semester, branch });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT endpoint for updating timetable (used by mobile app)
app.put('/api/timetable/:semester/:branch', async (req, res) => {
    try {
        const { semester, branch } = req.params;
        const { timetable, periods } = req.body;

        console.log(`📝 Updating timetable for ${branch} Semester ${semester}`);

        if (mongoose.connection.readyState === 1) {
            let existingTimetable = await Timetable.findOne({ semester, branch });
            if (existingTimetable) {
                existingTimetable.timetable = timetable;
                if (periods) existingTimetable.periods = periods;
                existingTimetable.lastUpdated = new Date();
                await existingTimetable.save();
                console.log('✅ Timetable updated successfully');
                res.json({ success: true, timetable: existingTimetable });
            } else {
                // Create new timetable if doesn't exist
                const newTimetable = new Timetable({
                    semester,
                    branch,
                    periods: periods || [],
                    timetable
                });
                await newTimetable.save();
                console.log('✅ New timetable created');
                res.json({ success: true, timetable: newTimetable });
            }
        } else {
            const key = `${semester}_${branch}`;
            timetableMemory[key] = { semester, branch, periods: periods || [], timetable, lastUpdated: new Date() };
            res.json({ success: true, timetable: timetableMemory[key] });
        }

        // Notify all students
        io.emit('timetable_updated', { semester, branch });
    } catch (error) {
        console.error('❌ Error updating timetable:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current lecture for a teacher based on time and timetable
app.get('/api/teacher/current-lecture/:teacherId', async (req, res) => {
    try {
        const { teacherId } = req.params;

        // Get current time
        const now = new Date();
        const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        console.log(`🔍 Finding current lecture for teacher ${teacherId} at ${currentTime} on ${currentDay}`);

        // Find all timetables where this teacher is assigned
        const timetables = await Timetable.find();

        let currentLecture = null;
        let matchedTimetable = null;

        for (const timetable of timetables) {
            const daySchedule = timetable.timetable[currentDay];
            if (!daySchedule) continue;

            // Check each period to find current lecture
            for (const lecture of daySchedule) {
                if (lecture.isBreak) continue;
                if (lecture.teacher !== teacherId) continue;

                // Find period timing
                const period = timetable.periods.find(p => p.number === lecture.period);
                if (!period) continue;

                // Check if current time is within this period
                if (currentTime >= period.startTime && currentTime <= period.endTime) {
                    currentLecture = {
                        period: lecture.period,
                        subject: lecture.subject,
                        teacher: lecture.teacher,
                        teacherName: lecture.teacherName,
                        room: lecture.room,
                        startTime: period.startTime,
                        endTime: period.endTime,
                        semester: timetable.semester,
                        branch: timetable.branch
                    };
                    matchedTimetable = timetable;
                    break;
                }
            }

            if (currentLecture) break;
        }

        // Also get all branches this teacher is assigned to
        const allowedBranches = new Set();
        for (const timetable of timetables) {
            for (const day of Object.keys(timetable.timetable)) {
                const daySchedule = timetable.timetable[day];
                if (daySchedule) {
                    for (const lecture of daySchedule) {
                        if (lecture.teacher === teacherId && !lecture.isBreak) {
                            allowedBranches.add(timetable.branch);
                        }
                    }
                }
            }
        }

        if (currentLecture) {
            console.log(`✅ Found current lecture: ${currentLecture.subject} for ${currentLecture.branch} Semester ${currentLecture.semester}`);
            res.json({
                success: true,
                currentLecture,
                hasLecture: true,
                allowedBranches: Array.from(allowedBranches)
            });
        } else {
            console.log(`ℹ️  No current lecture found for teacher ${teacherId}`);
            res.json({
                success: true,
                currentLecture: null,
                hasLecture: false,
                message: 'No lecture scheduled at this time',
                allowedBranches: Array.from(allowedBranches)
            });
        }

    } catch (error) {
        console.error('❌ Error finding current lecture:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get allowed branches for a teacher (branches they teach)
app.get('/api/teacher/allowed-branches/:teacherId', async (req, res) => {
    try {
        const { teacherId } = req.params;

        console.log(`🔍 Finding allowed branches for teacher ${teacherId}...`);

        // Find all timetables where this teacher is assigned
        const timetables = await Timetable.find();

        const allowedBranches = new Set();
        const branchDetails = [];

        for (const timetable of timetables) {
            let hasAssignment = false;

            // Check all days
            for (const day of Object.keys(timetable.timetable)) {
                const daySchedule = timetable.timetable[day];
                if (daySchedule) {
                    for (const lecture of daySchedule) {
                        if (lecture.teacher === teacherId && !lecture.isBreak) {
                            hasAssignment = true;
                            break;
                        }
                    }
                }
                if (hasAssignment) break;
            }

            if (hasAssignment && !allowedBranches.has(timetable.branch)) {
                allowedBranches.add(timetable.branch);
                branchDetails.push({
                    branch: timetable.branch,
                    semester: timetable.semester
                });
            }
        }

        console.log(`✅ Teacher ${teacherId} is assigned to ${allowedBranches.size} branch(es)`);

        res.json({
            success: true,
            allowedBranches: Array.from(allowedBranches),
            branchDetails: branchDetails
        });

    } catch (error) {
        console.error('❌ Error finding allowed branches:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update periods for ALL timetables
app.post('/api/periods/update-all', async (req, res) => {
    try {
        const { periods } = req.body;

        if (!periods || !Array.isArray(periods) || periods.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid periods data'
            });
        }

        console.log(`📝 Updating periods for ALL timetables (${periods.length} periods)`);

        if (mongoose.connection.readyState === 1) {
            // Update all timetables in database
            const result = await Timetable.updateMany(
                {}, // Match all timetables
                {
                    $set: {
                        periods: periods,
                        lastUpdated: new Date()
                    }
                }
            );

            console.log(`✅ Updated ${result.modifiedCount} timetables`);

            // Also update each timetable's day schedules to match new period count
            const allTimetables = await Timetable.find({});

            for (const tt of allTimetables) {
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                let needsUpdate = false;

                days.forEach(day => {
                    if (tt.timetable[day]) {
                        const currentLength = tt.timetable[day].length;
                        const newLength = periods.length;

                        if (currentLength < newLength) {
                            // Add new empty periods
                            for (let i = currentLength; i < newLength; i++) {
                                tt.timetable[day].push({
                                    period: i + 1,
                                    subject: '',
                                    room: '',
                                    isBreak: false
                                });
                            }
                            needsUpdate = true;
                        } else if (currentLength > newLength) {
                            // Remove extra periods
                            tt.timetable[day] = tt.timetable[day].slice(0, newLength);
                            needsUpdate = true;
                        }
                    }
                });

                if (needsUpdate) {
                    await tt.save();
                }
            }

            res.json({
                success: true,
                updatedCount: result.modifiedCount,
                message: `Updated ${result.modifiedCount} timetables with ${periods.length} periods`
            });

            // Notify all connected clients
            io.emit('periods_updated', { periods });
        } else {
            // Update in-memory timetables
            let count = 0;
            Object.keys(timetableMemory).forEach(key => {
                timetableMemory[key].periods = periods;
                timetableMemory[key].lastUpdated = new Date();
                count++;
            });

            res.json({
                success: true,
                updatedCount: count,
                message: `Updated ${count} timetables (in-memory)`
            });
        }
    } catch (error) {
        console.error('❌ Error updating periods:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current periods configuration
app.get('/api/periods', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const tt = await Timetable.findOne({ periods: { $exists: true, $ne: [] } }).select('periods');
            return res.json({
                success: true,
                periods: tt?.periods || []
            });
        }

        const firstKey = Object.keys(timetableMemory).find(k => Array.isArray(timetableMemory[k]?.periods) && timetableMemory[k].periods.length > 0);
        return res.json({
            success: true,
            periods: firstKey ? (timetableMemory[firstKey].periods || []) : []
        });
    } catch (error) {
        console.error('❌ Error fetching periods:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// Subject Management APIs
// ========================================

// Get all subjects (with optional filters)
app.get('/api/subjects', async (req, res) => {
    try {
        const { semester, branch, isActive } = req.query;

        const filter = {};
        if (semester) filter.semester = semester;
        if (branch) filter.branch = branch;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const subjects = await Subject.find(filter).sort({ semester: 1, subjectCode: 1 });

        res.json({
            success: true,
            subjects: subjects,
            count: subjects.length
        });
    } catch (error) {
        console.error('❌ Error fetching subjects:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single subject by code
app.get('/api/subjects/:subjectCode', async (req, res) => {
    try {
        const subject = await Subject.findOne({ subjectCode: req.params.subjectCode });

        if (!subject) {
            return res.status(404).json({ success: false, error: 'Subject not found' });
        }

        res.json({ success: true, subject });
    } catch (error) {
        console.error('❌ Error fetching subject:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new subject
app.post('/api/subjects', async (req, res) => {
    try {
        console.log('📥 Received subject creation request:', req.body);
        const { subjectCode, subjectName, shortName, semester, branch, credits, type, description } = req.body;

        console.log('📋 Extracted fields:', { subjectCode, subjectName, shortName, semester, branch, credits, type, description });

        // Check if subject code already exists
        const existing = await Subject.findOne({ subjectCode });
        if (existing) {
            console.log('❌ Subject code already exists:', subjectCode);
            return res.status(400).json({ success: false, error: 'Subject code already exists' });
        }

        const subject = new Subject({
            subjectCode,
            subjectName,
            shortName: shortName || subjectName,
            semester,
            branch,
            credits: credits || 3,
            type: type || 'Theory',
            description,
            isActive: true
        });

        await subject.save();

        console.log(`✅ Created subject: ${subjectCode} - ${subjectName}`);

        res.json({ success: true, subject });
    } catch (error) {
        console.error('❌ Error creating subject:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update subject
app.put('/api/subjects/:subjectCode', async (req, res) => {
    try {
        const { subjectName, shortName, semester, branch, credits, type, description, isActive } = req.body;

        const subject = await Subject.findOne({ subjectCode: req.params.subjectCode });

        if (!subject) {
            return res.status(404).json({ success: false, error: 'Subject not found' });
        }

        // Update fields
        if (subjectName) subject.subjectName = subjectName;
        if (shortName) subject.shortName = shortName;
        if (semester) subject.semester = semester;
        if (branch) subject.branch = branch;
        if (credits !== undefined) subject.credits = credits;
        if (type) subject.type = type;
        if (description !== undefined) subject.description = description;
        if (isActive !== undefined) subject.isActive = isActive;
        subject.updatedAt = new Date();

        await subject.save();

        console.log(`✅ Updated subject: ${req.params.subjectCode}`);

        res.json({ success: true, subject });
    } catch (error) {
        console.error('❌ Error updating subject:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete subject
app.delete('/api/subjects/:subjectCode', async (req, res) => {
    try {
        const subject = await Subject.findOneAndDelete({ subjectCode: req.params.subjectCode });

        if (!subject) {
            return res.status(404).json({ success: false, error: 'Subject not found' });
        }

        console.log(`✅ Deleted subject: ${req.params.subjectCode}`);

        res.json({ success: true, message: 'Subject deleted successfully' });
    } catch (error) {
        console.error('❌ Error deleting subject:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get subjects grouped by semester and branch
app.get('/api/subjects/grouped/by-semester-branch', async (req, res) => {
    try {
        const subjects = await Subject.find({ isActive: true }).sort({ semester: 1, branch: 1, subjectCode: 1 });

        // Group by semester and branch
        const grouped = {};

        subjects.forEach(subject => {
            const key = `Sem ${subject.semester} - ${subject.branch}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push({
                code: subject.subjectCode,
                name: subject.subjectName,
                shortName: subject.shortName,
                credits: subject.credits,
                type: subject.type
            });
        });

        res.json({ success: true, grouped });
    } catch (error) {
        console.error('❌ Error fetching grouped subjects:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Teacher Schedule API
app.get('/api/teacher-schedule/:teacherId/:day', async (req, res) => {
    try {
        const { teacherId, day } = req.params;

        if (mongoose.connection.readyState === 1) {
            // First, get the teacher's name from their ID
            let teacherName = teacherId;
            const teacher = await Teacher.findOne({
                $or: [
                    { employeeId: teacherId },
                    { name: teacherId }
                ]
            });

            if (teacher) {
                teacherName = teacher.name;
            }

            // Fetch all timetables
            const timetables = await Timetable.find({});
            const schedule = [];

            timetables.forEach(tt => {
                const daySchedule = tt.timetable[day.toLowerCase()] || [];
                daySchedule.forEach((period, idx) => {
                    // Match by teacher name (case-insensitive)
                    if (period.teacher &&
                        (period.teacher.toLowerCase() === teacherName.toLowerCase() ||
                            period.teacher.toLowerCase().includes(teacherName.toLowerCase()))) {
                        schedule.push({
                            subject: period.subject,
                            room: period.room,
                            startTime: tt.periods[idx]?.startTime || '',
                            endTime: tt.periods[idx]?.endTime || '',
                            period: idx + 1,
                            course: tt.branch,
                            semester: tt.semester,
                            day: day
                        });
                    }
                });
            });

            // Sort by start time
            schedule.sort((a, b) => {
                const timeA = a.startTime.split(':').map(Number);
                const timeB = b.startTime.split(':').map(Number);
                return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
            });

            res.json({ success: true, schedule });
        } else {
            res.json({ success: true, schedule: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Teacher's Current Class Students (Role-based filtering)
app.get('/api/teacher/current-class-students/:teacherId', async (req, res) => {
    try {
        const { teacherId } = req.params;

        // Get current day and time in UTC (critical for proper class detection)
        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getUTCDay()];
        const currentTime = now.getUTCHours() * 60 + now.getUTCMinutes(); // minutes since midnight (UTC)

        console.log(`🔍 Finding current class for teacher: ${teacherId} at ${now.toLocaleTimeString()}`);

        // Find teacher
        const teacher = await Teacher.findOne({
            $or: [
                { employeeId: teacherId },
                { name: teacherId }
            ]
        });

        if (!teacher) {
            return res.status(404).json({
                success: false,
                error: 'Teacher not found'
            });
        }

        const teacherName = teacher.name;
        console.log(`✅ Found teacher: ${teacherName}`);

        // Find all timetables where this teacher is assigned
        const timetables = await Timetable.find({});

        // Find current period
        let currentClass = null;
        let matchedTimetable = null;

        for (const tt of timetables) {
            const daySchedule = tt.timetable[currentDay];
            if (!daySchedule) continue;

            for (let i = 0; i < daySchedule.length; i++) {
                const period = daySchedule[i];

                // Check if this period is assigned to our teacher
                if (period.teacher &&
                    (period.teacher.toLowerCase() === teacherName.toLowerCase() ||
                        period.teacher.toLowerCase().includes(teacherName.toLowerCase()))) {

                    // Get period timing
                    const periodInfo = tt.periods[i];
                    if (!periodInfo) continue;

                    const periodStart = timeToMinutes(periodInfo.startTime);
                    const periodEnd = timeToMinutes(periodInfo.endTime);

                    // Check if current time falls in this period
                    if (currentTime >= periodStart && currentTime <= periodEnd) {
                        currentClass = {
                            subject: period.subject,
                            semester: tt.semester,
                            branch: tt.branch,
                            period: period.period || (i + 1),
                            room: period.room,
                            startTime: periodInfo.startTime,
                            endTime: periodInfo.endTime,
                            isBreak: period.isBreak || false,
                            day: currentDay
                        };
                        matchedTimetable = tt;
                        console.log(`📚 Found current class: ${currentClass.subject} - ${currentClass.branch} Sem ${currentClass.semester}`);
                        break;
                    }
                }
            }
            if (currentClass) break;
        }

        // If no current class found
        if (!currentClass) {
            console.log('⏰ No active class right now');

            // Find next class today
            let nextClass = null;
            for (const tt of timetables) {
                const daySchedule = tt.timetable[currentDay];
                if (!daySchedule) continue;

                for (let i = 0; i < daySchedule.length; i++) {
                    const period = daySchedule[i];
                    if (period.teacher &&
                        (period.teacher.toLowerCase() === teacherName.toLowerCase() ||
                            period.teacher.toLowerCase().includes(teacherName.toLowerCase()))) {

                        const periodInfo = tt.periods[i];
                        if (!periodInfo) continue;

                        const periodStart = timeToMinutes(periodInfo.startTime);
                        if (periodStart > currentTime) {
                            nextClass = {
                                subject: period.subject,
                                time: `${periodInfo.startTime} - ${periodInfo.endTime}`,
                                semester: tt.semester,
                                branch: tt.branch,
                                room: period.room
                            };
                            break;
                        }
                    }
                }
                if (nextClass) break;
            }

            return res.json({
                success: true,
                hasActiveClass: false,
                message: 'No active class right now',
                nextClass: nextClass,
                teacherName: teacherName
            });
        }

        // If it's a break period
        if (currentClass.isBreak) {
            return res.json({
                success: true,
                hasActiveClass: false,
                message: `${currentClass.subject} - Break time`,
                currentClass: currentClass,
                teacherName: teacherName
            });
        }

        // Get students for this class (semester + branch) with current attendance status
        const students = await StudentManagement.find({
            semester: currentClass.semester.toString(),
            course: currentClass.branch
        }).select('-password');

        console.log(`👥 Found ${students.length} students for ${currentClass.branch} Semester ${currentClass.semester}`);

        // Enhance students with current attendance session data
        const today = new Date().toISOString().split('T')[0];
        const studentsWithStatus = await Promise.all(students.map(async (student) => {
            try {
                // Get current attendance session
                const session = await AttendanceSession.findOne({
                    studentId: student._id,
                    date: today
                });

                // Get current attendance record
                const record = await AttendanceRecord.findOne({
                    studentId: student._id,
                    date: today
                });

                return {
                    ...student.toObject(),
                    // Real-time status from session
                    isRunning: session?.isActive || false,
                    timerValue: session?.timerValue || 0,
                    status: session?.isActive ? 'attending' : (record?.status || 'absent'),
                    joinTime: session?.sessionStartTime || null,
                    wifiConnected: session?.wifiConnected || false,
                    // Session info
                    sessionId: session?._id || null,
                    totalAttendedSeconds: session?.totalAttendedSeconds || 0
                };
            } catch (error) {
                console.error(`❌ Error getting status for student ${student.name}:`, error);
                return {
                    ...student.toObject(),
                    isRunning: false,
                    timerValue: 0,
                    status: 'absent',
                    joinTime: null,
                    wifiConnected: false
                };
            }
        }));

        console.log(`✅ Enhanced ${studentsWithStatus.length} students with real-time status`);

        // Get classroom info
        const classroom = await Classroom.findOne({ roomNumber: currentClass.room });

        res.json({
            success: true,
            hasActiveClass: true,
            currentClass: {
                ...currentClass,
                capacity: classroom?.capacity || 60,
                bssid: classroom?.bssid || null
            },
            students: studentsWithStatus,
            totalStudents: studentsWithStatus.length,
            teacherName: teacherName,
            // Additional stats for teacher dashboard
            activeStudents: studentsWithStatus.filter(s => s.isRunning).length,
            presentStudents: studentsWithStatus.filter(s => s.status === 'present' || s.isRunning).length,
            absentStudents: studentsWithStatus.filter(s => s.status === 'absent' && !s.isRunning).length
        });

    } catch (error) {
        console.error('❌ Error in current-class-students:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to convert time string to minutes (single definition)
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Helper function to create default timetable
function createDefaultTimetable(semester, branch) {
    const periods = [];
    for (let i = 0; i < 8; i++) {
        const startHour = 8 + Math.floor((i * 45) / 60);
        const startMinute = (i * 45) % 60;
        const endHour = 8 + Math.floor(((i + 1) * 45) / 60);
        const endMinute = ((i + 1) * 45) % 60;

        periods.push({
            number: i + 1,
            startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
            endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
        });
    }

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
                teacherName: ''
            };
        });
    });

    return { semester, branch, periods, timetable };
}

// Socket.IO for real-time updates
io.on('connection', (socket) => {
    console.log('📱 Client connected:', socket.id);

    // Student updates timer
    socket.on('timer_update', async (data) => {
        try {
            const { studentId, timerValue, isRunning, status, studentName } = data;

            console.log('🔔 Timer update received:', { studentId, timerValue, isRunning, status, studentName });

            // Check if it's an offline ID (starts with "offline_")
            const isOfflineId = studentId && studentId.toString().startsWith('offline_');

            if (mongoose.connection.readyState === 1 && !isOfflineId) {
                console.log('📊 Database connected, processing timer update...');
                try {
                    // Check if studentId is a valid ObjectId format
                    const isValidObjectId = mongoose.Types.ObjectId.isValid(studentId) &&
                        /^[0-9a-fA-F]{24}$/.test(studentId);

                    let student;
                    if (isValidObjectId) {
                        // Try both _id and enrollmentNo
                        student = await StudentManagement.findOne({
                            $or: [
                                { _id: studentId },
                                { enrollmentNo: studentId }
                            ]
                        });
                    } else {
                        // Not a valid ObjectId, search only by enrollmentNo
                        console.log(`🔍 Searching for student by enrollmentNo: ${studentId}`);
                        student = await StudentManagement.findOne({ enrollmentNo: studentId });
                    }

                    if (student) {
                        console.log(`✅ Found student: ${student.name} (${student.enrollmentNo})`);
                        const updateResult = await StudentManagement.findByIdAndUpdate(student._id, {
                            timerValue,
                            isRunning,
                            status,
                            lastUpdated: new Date()
                        }, { new: true });

                        console.log(`💾 Database updated:`, {
                            id: student._id,
                            isRunning: updateResult.isRunning,
                            status: updateResult.status,
                            timerValue: updateResult.timerValue
                        });

                        // Broadcast with enrollmentNo for teacher matching
                        io.emit('student_update', {
                            studentId: student._id.toString(),
                            enrollmentNo: student.enrollmentNo,
                            name: student.name,
                            timerValue,
                            isRunning,
                            status
                        });
                        console.log(`📡 Broadcasted update for ${student.name} (${student.enrollmentNo})`);
                    } else {
                        console.log(`⚠️ Student not found with ID: ${studentId}`);
                        // Still broadcast with what we have
                        io.emit('student_update', { studentId, timerValue, isRunning, status });
                    }
                } catch (dbError) {
                    console.error('❌ Database error in timer update:', dbError.message);
                    // Continue without throwing - don't break the socket connection
                    // Broadcast with what we have
                    io.emit('student_update', { studentId, timerValue, isRunning, status });
                }
            } else {
                // Handle offline/in-memory students
                let student = studentsMemory.find(s => s._id === studentId);
                if (!student && studentName) {
                    // Auto-register offline student
                    student = {
                        _id: studentId,
                        name: studentName,
                        status: status || 'absent',
                        timerValue: timerValue || 120,
                        isRunning: isRunning || false
                    };
                    studentsMemory.push(student);
                    io.emit('student_registered', { name: studentName });
                } else if (student) {
                    student.timerValue = timerValue;
                    student.isRunning = isRunning;
                    student.status = status;
                }

                // Broadcast to all teachers
                io.emit('student_update', { studentId, timerValue, isRunning, status });
            }
        } catch (error) {
            console.error('❌ Error updating timer:', error);
            socket.emit('error', { message: 'Failed to update timer' });
        }
    });

    // Student starts timer (centralized system)
    socket.on('start_timer', async (data) => {
        try {
            const { studentId, enrollmentNo, name, semester, branch, currentClass, lectureDuration } = data;

            console.log(`⏱️ Starting timer for ${name} (${enrollmentNo}) - ${currentClass}`);

            // Add to active timers (legacy support)
            activeStudentTimers.set(studentId, {
                startTime: Date.now(),
                semester,
                branch,
                currentClass,
                enrollmentNo,
                name,
                lectureDuration: lectureDuration || 60 // default 60 minutes
            });

            // Update database with NEW attendance session system
            if (mongoose.connection.readyState === 1) {
                const now = new Date();

                await StudentManagement.findOneAndUpdate(
                    { $or: [{ _id: studentId }, { enrollmentNo }] },
                    {
                        isRunning: true,
                        status: 'attending',
                        lastUpdated: now,
                        // CRITICAL: Set up attendance session for timer broadcast
                        'attendanceSession.sessionStartTime': now,
                        'attendanceSession.totalAttendedSeconds': 0,
                        'attendanceSession.isPaused': false,
                        'attendanceSession.pausedDuration': 0,
                        'attendanceSession.lastPauseTime': null
                    }
                );

                console.log(`✅ Attendance session created for ${name} at ${now.toISOString()}`);
            }

            socket.emit('timer_started', { success: true, studentId });
            console.log(`✅ Timer started for ${name}`);
        } catch (error) {
            console.error('❌ Error starting timer:', error);
            socket.emit('timer_error', { message: 'Failed to start timer' });
        }
    });

    // Student stops timer (centralized system)
    socket.on('stop_timer', async (data) => {
        try {
            const { studentId, enrollmentNo } = data;

            const timerData = activeStudentTimers.get(studentId);
            if (timerData) {
                const elapsedMinutes = Math.floor((Date.now() - timerData.startTime) / 60000);
                console.log(`⏹️ Stopping timer for ${timerData.name} - Attended: ${elapsedMinutes} min`);

                // Remove from active timers
                activeStudentTimers.delete(studentId);

                // Update database
                if (mongoose.connection.readyState === 1) {
                    await StudentManagement.findOneAndUpdate(
                        { $or: [{ _id: studentId }, { enrollmentNo }] },
                        {
                            isRunning: false,
                            status: 'absent',
                            timerValue: 0,
                            lastUpdated: new Date()
                        }
                    );
                }

                socket.emit('timer_stopped', { success: true, attendedMinutes: elapsedMinutes });
            }
        } catch (error) {
            console.error('❌ Error stopping timer:', error);
            socket.emit('timer_error', { message: 'Failed to stop timer' });
        }
    });

    socket.on('disconnect', () => {
        console.log('📴 Client disconnected:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// Helper function already defined above - removed duplicate

// Helper: Get current lecture info from timetable
async function getCurrentLectureInfo(semester, branch) {
    try {
        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getDay()];
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const timetable = await Timetable.findOne({ semester, branch });
        if (!timetable) return null;

        const daySchedule = timetable.timetable[currentDay];
        if (!daySchedule) return null;

        for (let i = 0; i < daySchedule.length; i++) {
            const period = daySchedule[i];
            const periodInfo = timetable.periods[i];
            if (!periodInfo) continue;

            const periodStart = timeToMinutes(periodInfo.startTime);
            const periodEnd = timeToMinutes(periodInfo.endTime);

            if (currentTime >= periodStart && currentTime <= periodEnd && !period.isBreak) {
                const totalSeconds = (periodEnd - periodStart) * 60;
                const elapsedSeconds = (currentTime - periodStart) * 60;
                const remainingSeconds = (periodEnd - currentTime) * 60;

                return {
                    subject: period.subject,
                    teacher: period.teacher,
                    room: period.room,
                    period: i + 1,
                    startTime: periodInfo.startTime,
                    endTime: periodInfo.endTime,
                    totalSeconds,
                    elapsedSeconds,
                    remainingSeconds,
                    periodStart,
                    periodEnd
                };
            }
        }
        return null;
    } catch (error) {
        console.error('❌ Error getting lecture info:', error);
        return null;
    }
}

// Helper: Calculate attended time for a student
function calculateAttendedTime(student) {
    if (!student.attendanceSession || !student.attendanceSession.sessionStartTime) {
        console.log(`⚠️  No session data for ${student.name}`);
        return 0;
    }

    const session = student.attendanceSession;
    const now = Date.now();

    // If paused, don't count time since pause
    if (session.isPaused && session.lastPauseTime) {
        const timeBeforePause = session.totalAttendedSeconds || 0;
        console.log(`⏸️  ${student.name} is paused - returning ${timeBeforePause}s`);
        return timeBeforePause;
    }

    // Calculate time since session start (ensure proper Date conversion)
    const startTime = new Date(session.sessionStartTime).getTime();
    const sessionDuration = Math.floor((now - startTime) / 1000);
    const pausedDuration = session.pausedDuration || 0;
    const attended = Math.max(0, sessionDuration - pausedDuration);

    // Log only every 30 seconds to reduce spam
    if (sessionDuration % 30 === 0) {
        // console.log(`⏱️  ${student.name}: now=${now}, start=${startTime}, duration=${sessionDuration}s, paused=${pausedDuration}s, attended=${attended}s`);
    }

    // Total attended = session duration - paused duration
    return attended;
}

// Server-side timer broadcast (every 1 second)
setInterval(async () => {
    try {
        if (mongoose.connection.readyState !== 1) return;

        // Get all students with active timers
        const activeStudents = await StudentManagement.find({ isRunning: true });

        for (const student of activeStudents) {
            try {
                const studentId = student._id.toString();

                // Get current lecture info from timetable
                const lectureInfo = await getCurrentLectureInfo(student.semester, student.course);

                if (!lectureInfo) {
                    // No active lecture, stop timer and save final attendance
                    const finalAttendedSeconds = calculateAttendedTime(student);

                    await StudentManagement.findByIdAndUpdate(student._id, {
                        isRunning: false,
                        status: 'present',
                        'attendanceSession.totalAttendedSeconds': finalAttendedSeconds,
                        lastUpdated: new Date()
                    });

                    console.log(`⏹️  Timer stopped for ${student.name} - No active lecture`);

                    // Broadcast stop event
                    io.emit('timer_broadcast', {
                        studentId: studentId,
                        enrollmentNo: student.enrollmentNo,
                        name: student.name,
                        isRunning: false,
                        status: 'present',
                        attendedSeconds: finalAttendedSeconds
                    });
                    continue;
                }

                // Calculate current attended time
                const attendedSeconds = calculateAttendedTime(student);

                // Check if lecture is ending (last 5 seconds) - save to history
                if (lectureInfo.remainingSeconds <= 5 && lectureInfo.remainingSeconds > 0) {
                    // Save period attendance to history
                    const attendedMinutes = Math.floor(attendedSeconds / 60);
                    const totalMinutes = Math.floor(lectureInfo.totalSeconds / 60);
                    const percentage = lectureInfo.totalSeconds > 0
                        ? Math.round((attendedSeconds / lectureInfo.totalSeconds) * 100)
                        : 0;

                    const periodData = {
                        subject: lectureInfo.subject,
                        room: lectureInfo.room,
                        teacher: lectureInfo.teacher,
                        startTime: lectureInfo.startTime,
                        endTime: lectureInfo.endTime,
                        attendedSeconds: attendedSeconds,
                        totalSeconds: lectureInfo.totalSeconds,
                        attendedMinutes: attendedMinutes,
                        totalMinutes: totalMinutes,
                        percentage: percentage,
                        present: percentage >= ATTENDANCE_THRESHOLD,
                        verifiedFace: true,
                        randomRingTriggered: student.attendanceSession?.randomRingId ? true : false,
                        randomRingPassed: student.attendanceSession?.randomRingId ?
                            (student.attendanceSession?.randomRingPassed || false) : null,
                        offlineTime: student.attendanceSession?.offlineAttendedSeconds || 0
                    };

                    // Save to AttendanceHistory
                    try {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        let attendance = await AttendanceHistory.findOne({
                            enrollmentNo: student.enrollmentNo,
                            date: today
                        });

                        if (!attendance) {
                            attendance = new AttendanceHistory({
                                studentId: student._id,
                                enrollmentNo: student.enrollmentNo,
                                studentName: student.name,
                                date: today,
                                semester: student.semester,
                                branch: student.course,
                                periods: []
                            });
                        }

                        // Check if period already saved
                        const existingPeriodIndex = attendance.periods.findIndex(p =>
                            p.subject === periodData.subject &&
                            p.startTime === periodData.startTime
                        );

                        if (existingPeriodIndex >= 0) {
                            attendance.periods[existingPeriodIndex] = periodData;
                        } else {
                            attendance.periods.push(periodData);
                        }

                        // Recalculate daily totals
                        attendance.totalAttendedSeconds = attendance.periods.reduce((sum, p) => sum + p.attendedSeconds, 0);
                        attendance.totalClassSeconds = attendance.periods.reduce((sum, p) => sum + p.totalSeconds, 0);
                        attendance.totalAttendedMinutes = Math.floor(attendance.totalAttendedSeconds / 60);
                        attendance.totalClassMinutes = Math.floor(attendance.totalClassSeconds / 60);
                        attendance.dayPercentage = attendance.totalClassSeconds > 0
                            ? Math.round((attendance.totalAttendedSeconds / attendance.totalClassSeconds) * 100)
                            : 0;
                        attendance.dayPresent = attendance.dayPercentage >= 75;
                        attendance.updatedAt = new Date();

                        await attendance.save();
                        console.log(`💾 Saved period attendance for ${student.name} - ${lectureInfo.subject}`);
                    } catch (historyError) {
                        console.error('❌ Error saving attendance history:', historyError);
                    }
                }

                // Update database with current attended time (persistent storage)
                await StudentManagement.findByIdAndUpdate(student._id, {
                    'attendanceSession.totalAttendedSeconds': attendedSeconds,
                    'currentClass.totalDurationSeconds': lectureInfo.totalSeconds,
                    lastUpdated: new Date()
                });

                // Calculate time wasted (lecture elapsed - attended)
                const timeWastedSeconds = Math.max(0, lectureInfo.elapsedSeconds - attendedSeconds);

                // Broadcast to all clients (teacher dashboard + student app)
                const broadcastData = {
                    studentId: studentId,
                    enrollmentNo: student.enrollmentNo,
                    name: student.name,
                    semester: student.semester,
                    branch: student.course,

                    // Lecture info
                    lectureSubject: lectureInfo.subject,
                    lectureTeacher: lectureInfo.teacher,
                    lectureRoom: lectureInfo.room,
                    lecturePeriod: lectureInfo.period,
                    lectureStartTime: lectureInfo.startTime,
                    lectureEndTime: lectureInfo.endTime,

                    // Time tracking (all in seconds, server-calculated)
                    totalLectureSeconds: lectureInfo.totalSeconds,
                    elapsedLectureSeconds: lectureInfo.elapsedSeconds,
                    remainingLectureSeconds: lectureInfo.remainingSeconds,
                    attendedSeconds: attendedSeconds,
                    timeWastedSeconds: timeWastedSeconds,

                    // Status
                    isRunning: true,
                    isPaused: student.attendanceSession?.isPaused || false,
                    pauseReason: student.attendanceSession?.pauseReason || null,
                    status: student.attendanceSession?.isPaused ? 'paused' : 'attending'
                };

                io.emit('timer_broadcast', broadcastData);

            } catch (studentError) {
                console.error(`❌ Error processing student ${student.name}:`, studentError);
            }
        }
    } catch (error) {
        console.error('❌ Timer broadcast error:', error);
    }
}, 1000); // Broadcast every 1 second



// ============================================
// UNIFIED TIMER SYSTEM - SINGLE SOURCE OF TRUTH
// ============================================

// Get current timer state (unified endpoint)
app.post('/api/attendance/get-timer-state', async (req, res) => {
    try {
        const { studentId, clientTime, currentState } = req.body;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID required' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find active session
        const session = await AttendanceSession.findOne({
            studentId,
            date: today,
            isActive: true
        });

        if (!session) {
            return res.json({
                success: true,
                timerState: {
                    attendedSeconds: 0,
                    totalLectureSeconds: 0,
                    isRunning: false,
                    isPaused: false,
                    sessionId: null
                }
            });
        }

        // Calculate current attended time
        const now = Date.now();
        const sessionStart = new Date(session.sessionStartTime).getTime();
        let attendedSeconds = Math.floor((now - sessionStart) / 1000);

        // Subtract paused time
        if (session.pausedDuration) {
            attendedSeconds -= session.pausedDuration;
        }

        // Validate against client state for security
        if (currentState && currentState.attendedSeconds) {
            const drift = Math.abs(attendedSeconds - currentState.attendedSeconds);
            if (drift > 30) { // 30 seconds max drift
                console.warn(`⚠️ Timer drift detected for ${studentId}: ${drift}s`);
            }
        }

        res.json({
            success: true,
            timerState: {
                attendedSeconds: Math.max(0, attendedSeconds),
                totalLectureSeconds: session.totalLectureSeconds || 0,
                isRunning: session.isActive && !session.isPaused,
                isPaused: session.isPaused || false,
                sessionId: session._id.toString(),
                gracePeriodsUsed: session.gracePeriodsUsed || 0
            },
            serverTime: now
        });

    } catch (error) {
        console.error('❌ Error getting timer state:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start unified timer (secure)
app.post('/api/attendance/start-unified-timer', async (req, res) => {
    try {
        const { studentId, lectureInfo, clientTime, deviceInfo } = req.body;

        if (!studentId) {
            return res.status(400).json({ success: false, error: 'Student ID required' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = new Date();

        // Check for existing session
        let session = await AttendanceSession.findOne({
            studentId,
            date: today
        });

        if (session && session.isActive) {
            return res.status(400).json({
                success: false,
                error: 'Timer already running'
            });
        }

        // Create new session
        if (!session) {
            session = new AttendanceSession({
                studentId,
                date: today,
                sessionStartTime: now,
                timerValue: 0,
                isActive: true,
                isPaused: false,
                gracePeriodsUsed: 0,
                maxGracePeriods: 999, // Practically unlimited
                deviceInfo: deviceInfo
            });
        } else {
            // Resume existing session
            session.sessionStartTime = now;
            session.isActive = true;
            session.isPaused = false;
            session.timerValue = 0;
        }

        await session.save();

        // Log security event
        console.log(`✅ Unified timer started for ${studentId}`, {
            sessionId: session._id,
            clientTime,
            serverTime: now.getTime(),
            drift: Math.abs(clientTime - now.getTime())
        });

        res.json({
            success: true,
            sessionId: session._id.toString(),
            timerState: {
                attendedSeconds: 0,
                totalLectureSeconds: lectureInfo?.duration || 0,
                isRunning: true,
                isPaused: false,
                sessionId: session._id.toString(),
                gracePeriodsUsed: 0
            },
            serverTime: now.getTime()
        });

    } catch (error) {
        console.error('❌ Error starting unified timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop unified timer (secure)
app.post('/api/attendance/stop-unified-timer', async (req, res) => {
    try {
        const { studentId, sessionId, reason, clientTime } = req.body;

        if (!studentId || !sessionId) {
            return res.status(400).json({ success: false, error: 'Student ID and session ID required' });
        }

        const session = await AttendanceSession.findById(sessionId);

        if (!session || session.studentId !== studentId) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Calculate final attended time
        const now = Date.now();
        const sessionStart = new Date(session.sessionStartTime).getTime();
        let finalAttendedSeconds = Math.floor((now - sessionStart) / 1000);

        // Subtract paused time
        if (session.pausedDuration) {
            finalAttendedSeconds -= session.pausedDuration;
        }

        // Update session
        session.isActive = false;
        session.isPaused = false;
        session.timerValue = Math.max(0, finalAttendedSeconds);
        session.stopReason = reason;
        session.stopTime = new Date();

        await session.save();

        // Log security event
        console.log(`⏹️ Unified timer stopped for ${studentId}`, {
            sessionId,
            reason,
            finalTime: finalAttendedSeconds,
            clientTime,
            serverTime: now
        });

        res.json({
            success: true,
            finalAttendedSeconds: Math.max(0, finalAttendedSeconds),
            reason: reason
        });

    } catch (error) {
        console.error('❌ Error stopping unified timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pause unified timer (with grace period management)
app.post('/api/attendance/pause-unified-timer', async (req, res) => {
    try {
        const { studentId, sessionId, reason, gracePeriodsUsed, clientTime } = req.body;

        if (!studentId || !sessionId) {
            return res.status(400).json({ success: false, error: 'Student ID and session ID required' });
        }

        const session = await AttendanceSession.findById(sessionId);

        if (!session || session.studentId !== studentId) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Check grace period limits for WiFi-related pauses (STUDENT-FRIENDLY: No hard limits)
        if (reason.includes('wifi') && gracePeriodsUsed >= 999) { // Practically unlimited
            // Only stop after extreme abuse (999 disconnections)
            session.isActive = false;
            session.isPaused = false;
            session.stopReason = 'max_grace_periods_exceeded';
            session.stopTime = new Date();

            await session.save();

            return res.json({
                success: true,
                action: 'stopped',
                reason: 'Extreme disconnection abuse detected (999+ times)'
            });
        }

        // Pause timer
        session.isPaused = true;
        session.pauseReason = reason;
        session.pauseStartTime = new Date();

        // Increment grace periods for WiFi issues
        if (reason.includes('wifi')) {
            session.gracePeriodsUsed = (session.gracePeriodsUsed || 0) + 1;
        }

        await session.save();

        console.log(`⏸️ Unified timer paused for ${studentId}`, {
            sessionId,
            reason,
            gracePeriodsUsed: session.gracePeriodsUsed
        });

        res.json({
            success: true,
            action: 'paused',
            gracePeriodsUsed: session.gracePeriodsUsed,
            maxGracePeriods: 999 // Practically unlimited
        });

    } catch (error) {
        console.error('❌ Error pausing unified timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resume unified timer
app.post('/api/attendance/resume-unified-timer', async (req, res) => {
    try {
        const { studentId, sessionId, reason, clientTime } = req.body;

        if (!studentId || !sessionId) {
            return res.status(400).json({ success: false, error: 'Student ID and session ID required' });
        }

        const session = await AttendanceSession.findById(sessionId);

        if (!session || session.studentId !== studentId) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Calculate paused duration
        if (session.pauseStartTime) {
            const pauseDuration = Date.now() - new Date(session.pauseStartTime).getTime();
            session.pausedDuration = (session.pausedDuration || 0) + Math.floor(pauseDuration / 1000);
        }

        // Resume timer
        session.isPaused = false;
        session.pauseReason = null;
        session.pauseStartTime = null;
        session.resumeReason = reason;

        await session.save();

        console.log(`▶️ Unified timer resumed for ${studentId}`, {
            sessionId,
            reason,
            totalPausedTime: session.pausedDuration
        });

        res.json({
            success: true,
            action: 'resumed',
            totalPausedTime: session.pausedDuration || 0
        });

    } catch (error) {
        console.error('❌ Error resuming unified timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LEGACY ATTENDANCE TRACKING SYSTEM (DEPRECATED)
// ============================================

// 1. Face Verification & Timer Start
app.post('/api/attendance/start-session', async (req, res) => {
    try {
        const { studentId, studentName, enrollmentNo, semester, branch, faceData } = req.body;  // Changed from enrollmentNumber

        // TODO: Verify face data against stored photo
        // For now, assume verification successful

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if session already exists for today
        let session = await AttendanceSession.findOne({
            studentId,
            date: today
        });

        if (session) {
            // Resume existing session
            session.isActive = true;
            session.wifiConnected = true;
            session.lastUpdate = new Date();
            await session.save();

            return res.json({
                success: true,
                message: 'Session resumed',
                session: {
                    timerValue: session.timerValue,
                    sessionStartTime: session.sessionStartTime,
                    currentClass: session.currentClass
                }
            });
        }

        // Create new session
        session = new AttendanceSession({
            studentId,
            studentName,
            enrollmentNo,  // Changed from enrollmentNumber
            date: today,
            sessionStartTime: new Date(),
            timerValue: 0,
            isActive: true,
            wifiConnected: true,
            semester,
            branch
        });

        await session.save();

        // Also create/update attendance record
        let record = await AttendanceRecord.findOne({
            studentId,
            date: today
        });

        if (!record) {
            record = new AttendanceRecord({
                studentId,
                studentName,
                enrollmentNo,  // Changed from enrollmentNumber
                date: today,
                status: 'present',
                lectures: [],
                checkInTime: new Date(),
                semester,
                branch
            });
            await record.save();
        }

        res.json({
            success: true,
            message: 'Session started',
            session: {
                timerValue: 0,
                sessionStartTime: session.sessionStartTime
            }
        });

    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Update Timer (Heartbeat every 5 minutes)
app.post('/api/attendance/update-timer', async (req, res) => {
    try {
        const { studentId, timerValue, wifiConnected } = req.body;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const session = await AttendanceSession.findOne({
            studentId,
            date: today
        });

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        session.timerValue = timerValue;
        session.wifiConnected = wifiConnected;
        session.isActive = wifiConnected;
        session.lastUpdate = new Date();

        await session.save();

        // Also update attendance record
        await AttendanceRecord.updateOne(
            { studentId, date: today },
            {
                timerValue,
                checkOutTime: new Date()
            }
        );

        res.json({ success: true, message: 'Timer updated' });

    } catch (error) {
        console.error('Error updating timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Lecture Started (Called by server when lecture begins)
app.post('/api/attendance/lecture-start', async (req, res) => {
    try {
        const { period, subject, teacher, teacherName, room, startTime, endTime, semester, branch } = req.body;

        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find all active sessions for this semester/branch
        const sessions = await AttendanceSession.find({
            date: today,
            semester,
            branch,
            isActive: true,
            wifiConnected: true
        });

        // Update each session with current class info
        for (const session of sessions) {
            session.currentClass = {
                period,
                subject,
                teacher,
                teacherName,
                room,
                startTime,
                endTime,
                classStartedAt: now
            };
            await session.save();
        }

        res.json({
            success: true,
            message: `Lecture started for ${sessions.length} students`,
            studentsInClass: sessions.length
        });

    } catch (error) {
        console.error('Error starting lecture:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Lecture Ended (Calculate and save attendance)
app.post('/api/attendance/lecture-end', async (req, res) => {
    try {
        const { period, subject, semester, branch } = req.body;

        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find all sessions with this lecture
        const sessions = await AttendanceSession.find({
            date: today,
            semester,
            branch,
            'currentClass.period': period,
            'currentClass.subject': subject
        });

        let updatedCount = 0;

        for (const session of sessions) {
            const classInfo = session.currentClass;
            const lectureStartTime = new Date(classInfo.classStartedAt);
            const lectureDuration = 50 * 60; // 50 minutes in seconds

            // Calculate how long student was present
            const studentCheckIn = new Date(session.sessionStartTime);
            const timeInLecture = Math.floor((now - lectureStartTime) / 1000);
            const attendedSeconds = Math.min(timeInLecture, lectureDuration);
            const percentage = Math.round((attendedSeconds / lectureDuration) * 100);

            // Update attendance record
            const record = await AttendanceRecord.findOne({
                studentId: session.studentId,
                date: today
            });

            if (record) {
                // Add lecture to record
                record.lectures.push({
                    period,
                    subject: classInfo.subject,
                    teacher: classInfo.teacher,
                    teacherName: classInfo.teacherName,
                    room: classInfo.room,
                    startTime: classInfo.startTime,
                    endTime: classInfo.endTime,
                    lectureStartedAt: lectureStartTime,
                    lectureEndedAt: now,
                    studentCheckIn,
                    attended: attendedSeconds,
                    total: lectureDuration,
                    percentage,
                    present: percentage >= ATTENDANCE_THRESHOLD,
                    verifications: []
                });

                // Update totals
                record.totalAttended = record.lectures.reduce((sum, l) => sum + l.attended, 0);
                record.totalClassTime = record.lectures.reduce((sum, l) => sum + l.total, 0);
                record.dayPercentage = record.totalClassTime > 0
                    ? Math.round((record.totalAttended / record.totalClassTime) * 100)
                    : 0;

                await record.save();
                updatedCount++;
            }

            // Clear current class from session
            session.currentClass = null;
            await session.save();
        }

        res.json({
            success: true,
            message: `Lecture ended, updated ${updatedCount} students`,
            studentsUpdated: updatedCount
        });

    } catch (error) {
        console.error('Error ending lecture:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Add Face Verification Event
app.post('/api/attendance/add-verification', async (req, res) => {
    try {
        const { studentId, period, verificationType, event } = req.body;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const record = await AttendanceRecord.findOne({
            studentId,
            date: today
        });

        if (!record) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }

        // Find the lecture and add verification
        const lecture = record.lectures.find(l => l.period === period);
        if (lecture) {
            lecture.verifications.push({
                time: new Date(),
                type: verificationType || 'face',
                success: true,
                event: event || 'periodic'
            });
            await record.save();
        }

        res.json({ success: true, message: 'Verification added' });

    } catch (error) {
        console.error('Error adding verification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LEGACY ATTENDANCE ENDPOINTS (Keep for backward compatibility)
// ============================================

// Attendance Records API
app.post('/api/attendance/record', async (req, res) => {
    try {
        const {
            studentId, studentName, enrollmentNo, status, timerValue, semester, branch,  // Changed from enrollmentNumber
            lectures, totalAttended, totalClassTime, dayPercentage, clientDate
        } = req.body;

        // SECURITY: Always use server time, never trust client
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Optional: Validate client date matches server date (within 1 day tolerance)
        if (clientDate) {
            const clientDateObj = new Date(clientDate);
            clientDateObj.setHours(0, 0, 0, 0);
            const daysDiff = Math.abs((today - clientDateObj) / (1000 * 60 * 60 * 24));

            if (daysDiff > 1) {
                console.warn(`⚠️ Client date mismatch: client=${clientDate}, server=${today.toISOString()}`);
                return res.status(400).json({
                    success: false,
                    error: 'Date mismatch. Please sync your device time.',
                    serverDate: today.toISOString()
                });
            }
        }

        if (mongoose.connection.readyState === 1) {
            // Check if record already exists for today
            let record = await AttendanceRecord.findOne({
                studentId,
                date: today
            });

            if (record) {
                // Update existing record with detailed data
                record.status = status;
                record.timerValue = timerValue;
                record.checkOutTime = new Date();

                // Update detailed attendance if provided
                if (lectures) record.lectures = lectures;
                if (totalAttended !== undefined) record.totalAttended = totalAttended;
                if (totalClassTime !== undefined) record.totalClassTime = totalClassTime;
                if (dayPercentage !== undefined) record.dayPercentage = dayPercentage;

                await record.save();
            } else {
                // Create new record
                record = new AttendanceRecord({
                    studentId,
                    studentName,
                    enrollmentNo,  // Changed from enrollmentNumber
                    date: today,
                    status,
                    timerValue,
                    checkInTime: new Date(),
                    semester,
                    branch,
                    lectures: lectures || [],
                    totalAttended: totalAttended || 0,
                    totalClassTime: totalClassTime || 0,
                    dayPercentage: dayPercentage || 0
                });
                await record.save();
            }
            res.json({ success: true, record });
        } else {
            // In-memory storage
            let record = attendanceRecordsMemory.find(r =>
                r.studentId === studentId && r.date.toDateString() === today.toDateString()
            );

            if (record) {
                record.status = status;
                record.timerValue = timerValue;
                record.checkOutTime = new Date();
                if (lectures) record.lectures = lectures;
                if (totalAttended !== undefined) record.totalAttended = totalAttended;
                if (totalClassTime !== undefined) record.totalClassTime = totalClassTime;
                if (dayPercentage !== undefined) record.dayPercentage = dayPercentage;
            } else {
                record = {
                    _id: 'record_' + Date.now(),
                    studentId,
                    studentName,
                    enrollmentNo,  // Changed from enrollmentNumber
                    date: today,
                    status,
                    timerValue,
                    checkInTime: new Date(),
                    semester,
                    branch,
                    lectures: lectures || [],
                    totalAttended: totalAttended || 0,
                    totalClassTime: totalClassTime || 0,
                    dayPercentage: dayPercentage || 0
                };
                attendanceRecordsMemory.push(record);
            }
            res.json({ success: true, record });
        }
    } catch (error) {
        console.error('Error saving attendance record:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get attendance records with filters
app.get('/api/attendance/records', async (req, res) => {
    try {
        const { studentId, startDate, endDate, semester, branch } = req.query;
        let query = {};

        if (studentId) query.studentId = studentId;
        if (semester) query.semester = semester;
        if (branch) query.branch = branch;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        if (mongoose.connection.readyState === 1) {
            const records = await AttendanceRecord.find(query).sort({ date: -1 });
            res.json({ success: true, records });
        } else {
            let records = attendanceRecordsMemory;
            if (studentId) records = records.filter(r => r.studentId === studentId);
            if (semester) records = records.filter(r => r.semester === semester);
            if (branch) records = records.filter(r => r.branch === branch);
            res.json({ success: true, records });
        }
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5-minute backup: Save attended minutes for recovery
app.post('/api/attendance/backup', async (req, res) => {
    try {
        const {
            studentId, enrollmentNo, studentName, semester, branch,
            attendedMinutes, currentClass, timestamp, isRunning, status
        } = req.body;

        console.log(`💾 Backup received: ${studentName} - ${attendedMinutes} minutes in ${currentClass}`);

        // Use server time for backup timestamp
        const serverTimestamp = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (mongoose.connection.readyState === 1) {
            // Update StudentManagement with latest attended minutes
            const student = await StudentManagement.findOne({
                $or: [
                    { _id: studentId },
                    { enrollmentNo: enrollmentNo }
                ]
            });

            if (student) {
                // Store backup data in a new field
                if (!student.attendanceBackup) {
                    student.attendanceBackup = [];
                }

                // Add backup entry
                student.attendanceBackup.push({
                    date: today,
                    timestamp: serverTimestamp,
                    attendedMinutes,
                    currentClass,
                    isRunning,
                    status
                });

                // Keep only last 10 backups per day
                student.attendanceBackup = student.attendanceBackup
                    .filter(b => b.date.toDateString() === today.toDateString())
                    .slice(-10);

                // Update current status
                student.status = status;
                student.isRunning = isRunning;
                student.lastUpdated = serverTimestamp;

                await student.save();

                console.log(`✅ Backup saved for ${studentName}: ${attendedMinutes} min`);
                res.json({
                    success: true,
                    message: 'Backup saved',
                    attendedMinutes,
                    serverTimestamp: serverTimestamp.toISOString()
                });
            } else {
                console.warn(`⚠️ Student not found for backup: ${studentId}`);
                res.status(404).json({ success: false, error: 'Student not found' });
            }
        } else {
            // In-memory fallback
            console.log('📝 Backup saved to memory (DB not connected)');
            res.json({
                success: true,
                message: 'Backup saved to memory',
                attendedMinutes
            });
        }
    } catch (error) {
        console.error('❌ Error saving backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// Get attendance statistics
app.get('/api/attendance/stats', async (req, res) => {
    try {
        const { studentId, semester, branch, startDate, endDate } = req.query;
        let query = {};

        if (studentId) query.studentId = studentId;
        if (semester) query.semester = semester;
        if (branch) query.branch = branch;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        if (mongoose.connection.readyState === 1) {
            const records = await AttendanceRecord.find(query);
            const total = records.length;
            const present = records.filter(r => r.status === 'present').length;
            const absent = records.filter(r => r.status === 'absent').length;
            const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

            res.json({
                success: true,
                stats: { total, present, absent, percentage }
            });
        } else {
            let records = attendanceRecordsMemory;
            if (studentId) records = records.filter(r => r.studentId === studentId);
            const total = records.length;
            const present = records.filter(r => r.status === 'present').length;
            const absent = records.filter(r => r.status === 'absent').length;
            const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

            res.json({
                success: true,
                stats: { total, present, absent, percentage }
            });
        }
    } catch (error) {
        console.error('Error fetching attendance stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get students attendance for a specific date (for teachers)
app.get('/api/attendance/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { semester, branch } = req.query;

        console.log('📅 Fetching students for date:', date, 'Semester:', semester, 'Branch:', branch);

        if (!date || !semester || !branch) {
            return res.status(400).json({
                success: false,
                error: 'Date, semester, and branch are required'
            });
        }

        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

        if (mongoose.connection.readyState === 1) {
            // Fetch all attendance records for this date, semester, and branch
            const records = await AttendanceRecord.find({
                date: { $gte: startOfDay, $lte: endOfDay },
                semester: semester,
                branch: branch
            }).lean();

            console.log('📊 Found', records.length, 'attendance records');

            // Group by student and aggregate their data
            const studentMap = {};

            for (const record of records) {
                if (!studentMap[record.studentId]) {
                    // Fetch student details
                    const student = await Student.findOne({ studentId: record.studentId }).lean();

                    studentMap[record.studentId] = {
                        studentId: record.studentId,
                        name: student?.name || 'Unknown',
                        status: record.status,
                        totalAttended: record.totalAttended || 0,
                        totalClassTime: record.totalClassTime || 0,
                        percentage: record.dayPercentage || 0,
                        lectures: record.lectures || []
                    };
                } else {
                    // Aggregate if multiple records exist
                    studentMap[record.studentId].totalAttended += record.totalAttended || 0;
                    studentMap[record.studentId].totalClassTime += record.totalClassTime || 0;
                    if (record.lectures) {
                        studentMap[record.studentId].lectures.push(...record.lectures);
                    }
                }
            }

            const students = Object.values(studentMap);
            console.log('👥 Returning', students.length, 'students');

            res.json({
                success: true,
                students: students,
                date: date,
                semester: semester,
                branch: branch
            });
        } else {
            // Memory fallback
            const records = attendanceRecordsMemory.filter(r => {
                const recordDate = new Date(r.date);
                return recordDate >= startOfDay && recordDate <= endOfDay &&
                    r.semester === semester && r.branch === branch;
            });

            const students = records.map(r => ({
                studentId: r.studentId,
                name: r.studentName || 'Unknown',
                status: r.status,
                totalAttended: r.totalAttended || 0,
                totalClassTime: r.totalClassTime || 0,
                percentage: r.dayPercentage || 0
            }));

            res.json({
                success: true,
                students: students,
                date: date,
                semester: semester,
                branch: branch
            });
        }
    } catch (error) {
        console.error('❌ Error fetching students for date:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Face-API service removed - no longer needed
// const faceApiService = require('./face-api-service');

// Face-API.js models loading removed - face verification disabled
console.log('ℹ️  Face verification disabled - using simple photo upload only');

// Face Verification API - DISABLED (face-api.js removed)
app.post('/api/verify-face', async (req, res) => {
    // Face verification disabled - return error
    return res.status(503).json({
        success: false,
        match: false,
        confidence: 0,
        message: 'Face verification has been disabled. This feature is no longer available.'
    });
    
    /* ORIGINAL CODE COMMENTED OUT - Face verification removed

    try {
        const { userId, capturedImage } = req.body;

        console.log('📸 Face verification request for user:', userId);

        if (!userId || !capturedImage) {
            return res.status(400).json({
                success: false,
                match: false,
                confidence: 0,
                message: 'Missing userId or capturedImage'
            });
        }

        // SECURITY: Fetch reference photo from database (not from client)
        // This prevents tampering with the reference photo
        console.log('🔍 Looking for user with ID:', userId);
        let user;

        // Try finding by MongoDB ID first
        try {
            user = await StudentManagement.findById(userId);
        } catch (dbError) {
            console.log('⚠️ Invalid MongoDB ID format');
        }

        // If not found by ID, try enrollment number
        if (!user) {
            console.log('⚠️ Not found by ID, trying enrollment number...');
            user = await StudentManagement.findOne({ enrollmentNo: userId });
        }

        if (!user) {
            console.log('❌ User not found in database by ID or enrollment number');
            return res.status(404).json({
                success: false,
                match: false,
                confidence: 0,
                message: 'User not found. Please log out and log in again to refresh your session.'
            });
        }

        console.log('✅ Found user:', user.name, 'Photo:', user.photoUrl ? 'Yes' : 'No');

        // Check if user has profile photo
        if (!user.photoUrl) {
            console.log('⚠️ User has no profile photo:', userId);
            return res.status(404).json({
                success: false,
                match: false,
                confidence: 0,
                message: 'No profile photo found. Please upload your photo via admin panel first.'
            });
        }

        // Validate captured image format
        const isValidImage = capturedImage &&
            capturedImage.length > 1000 &&
            (capturedImage.startsWith('/9j/') || capturedImage.startsWith('iVBOR')); // JPEG or PNG

        if (!isValidImage) {
            console.log('❌ Invalid image format');
            return res.json({
                success: false,
                match: false,
                confidence: 0,
                message: 'Invalid image format'
            });
        }

        // Load reference photo from server
        let referenceImageBase64 = '';
        try {
            const photoUrl = user.photoUrl;

            // Handle base64 data URIs (stored in database)
            if (photoUrl.startsWith('data:image')) {
                console.log('📥 Loading reference photo from database (base64)...');
                referenceImageBase64 = photoUrl.replace(/^data:image\/\w+;base64,/, '');
                console.log('✅ Reference photo loaded from database');
            }
            // Handle Cloudinary URLs
            else if (photoUrl.includes('cloudinary.com')) {
                console.log('📥 Downloading reference photo from Cloudinary...');
                const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
                referenceImageBase64 = Buffer.from(response.data, 'binary').toString('base64');
                console.log('✅ Reference photo downloaded from Cloudinary');
            }
            // Handle local file paths
            else if (photoUrl.includes('localhost') || photoUrl.includes('192.168')) {
                const filename = photoUrl.split('/uploads/')[1];
                const filepath = path.join(__dirname, 'uploads', filename);
                if (fs.existsSync(filepath)) {
                    referenceImageBase64 = fs.readFileSync(filepath, 'base64');
                    console.log('✅ Reference photo loaded from local filesystem');
                } else {
                    console.log('❌ Reference photo file not found');
                    return res.json({
                        success: false,
                        match: false,
                        confidence: 0,
                        message: 'Reference photo not found on server'
                    });
                }
            }
            // Handle other URLs (generic HTTP/HTTPS)
            else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                console.log('📥 Downloading reference photo from URL...');
                const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
                referenceImageBase64 = Buffer.from(response.data, 'binary').toString('base64');
                console.log('✅ Reference photo downloaded from URL');
            }

            // Validate that we got the image
            if (!referenceImageBase64) {
                console.log('❌ Failed to load reference photo from:', photoUrl);
                return res.json({
                    success: false,
                    match: false,
                    confidence: 0,
                    message: 'Could not load reference photo. Please re-upload your photo in admin panel.'
                });
            }
        } catch (error) {
            console.log('❌ Error loading reference photo:', error);
            return res.status(500).json({
                success: false,
                match: false,
                confidence: 0,
                message: 'Error loading reference photo: ' + error.message
            });
        }

        const startTime = Date.now();

        // Check if models are loaded
        if (!faceApiService.areModelsLoaded()) {
            console.log('❌ Face-API.js models not loaded');
            return res.status(503).json({
                success: false,
                match: false,
                confidence: 0,
                message: 'Face recognition service not available. Please contact administrator.'
            });
        }

        // Use face-api.js for verification
        console.log('🤖 Using face-api.js for verification...');

        const result = await faceApiService.compareFaces(capturedImage, referenceImageBase64);
        const verificationTime = Date.now() - startTime;

        if (!result.success) {
            console.log('❌ Face verification failed:', result.message);
            return res.json({
                success: false,
                match: false,
                confidence: 0,
                message: result.message
            });
        }

        console.log(`📊 Face-API.js result:`);
        console.log(`   Verification time: ${verificationTime}ms`);
        console.log(`   Match: ${result.match ? 'YES' : 'NO'}`);
        console.log(`   Confidence: ${result.confidence}%`);
        console.log(`   Distance: ${result.distance}`);
        console.log(`   User: ${user.name}`);

        res.json({
            success: true,
            match: result.match,
            confidence: result.confidence,
            distance: result.distance,
            message: result.message,
            method: 'face-api.js'
        });
    } catch (error) {
        console.error('❌ Face verification error:', error);
        res.status(500).json({
            success: false,
            match: false,
            confidence: 0,
            message: 'Verification error: ' + error.message
        });
    }
    */ // END OF COMMENTED CODE
});

// ==================== CLIENT-SIDE FACE VERIFICATION ENDPOINTS - DISABLED ====================

// Get face descriptor for client-side verification (encrypted) - DISABLED
app.get('/api/face-descriptor/:userId', async (req, res) => {
    return res.status(503).json({
        success: false,
        message: 'Face verification has been disabled. This feature is no longer available.'
    });
});

// Verify face proof from client (cryptographic verification) - DISABLED
app.post('/api/verify-face-proof', async (req, res) => {
    return res.status(503).json({
        success: false,
        message: 'Face verification has been disabled. This feature is no longer available.'
    });
});

// Helper function to generate signature (must match client-side)
function generateSignature(userId, timestamp, match, confidence, descriptorHash) {
    const data = `${userId}:${timestamp}:${match}:${confidence}:${descriptorHash}`;
    let signature = 0;
    for (let i = 0; i < data.length; i++) {
        signature = ((signature << 5) - signature) + data.charCodeAt(i);
        signature = signature & signature;
    }
    return signature.toString(16);
}

// ==================== ADMIN PANEL API ENDPOINTS ====================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Attendance System API Server',
        version: '2.4.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            config: '/api/config',
            time: '/api/time',
            health: '/api/health',
            students: '/api/students',
            timetable: '/api/timetable/:semester/:branch',
            subjects: '/api/subjects',
            classrooms: '/api/classrooms'
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Server time endpoint (for time synchronization)
app.get('/api/time', (req, res) => {
    const serverTime = Date.now();
    res.json({
        success: true,
        serverTime: serverTime,
        serverTimeISO: new Date(serverTime).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
});

// Server will be started at the end of the file after all routes are registered

// ============================================
// CONFIGURATION ENDPOINTS (Dynamic Data)
// ============================================

// Get available branches (dynamic)
app.get('/api/config/branches', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const branches = await getBranchesFromConfig();

            res.json({
                success: true,
                branches: branches,
                count: branches.length
            });
        } else {
            // Fallback to default branches
            res.json({
                success: true,
                branches: [
                    { id: 'b-tech-data-science', name: 'B.Tech Data Science', displayName: 'Data Science', value: 'B.Tech Data Science' }
                ],
                count: 1
            });
        }
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available semesters (dynamic)
app.get('/api/config/semesters', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const semesters = await getSemestersFromConfig();

            res.json({
                success: true,
                semesters: semesters,
                count: semesters.length
            });
        } else {
            // Fallback to default semesters
            res.json({
                success: true,
                semesters: ['1', '2', '3', '4', '5', '6', '7', '8'],
                count: 8
            });
        }
    } catch (error) {
        console.error('Error fetching semesters:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new branch
app.post('/api/config/branches', async (req, res) => {
    try {
        const { value, displayName } = req.body;

        if (!value) {
            return res.status(400).json({ success: false, error: 'Branch value is required' });
        }

        const newBranch = await Config.create({
            type: 'branch',
            value: value.trim(),
            displayName: displayName?.trim() || value.trim(),
            isActive: true
        });

        res.json({ success: true, branch: newBranch });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Branch already exists' });
        }
        console.error('Error adding branch:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update branch
app.put('/api/config/branches/:id', async (req, res) => {
    try {
        const { value, displayName, isActive } = req.body;

        const updated = await Config.findByIdAndUpdate(
            req.params.id,
            {
                value: value?.trim(),
                displayName: displayName?.trim(),
                isActive,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        res.json({ success: true, branch: updated });
    } catch (error) {
        console.error('Error updating branch:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete branch
app.delete('/api/config/branches/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;

        // Try to delete by _id first, then by value
        let deleted = null;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            deleted = await Config.findByIdAndDelete(identifier);
        }

        if (!deleted) {
            // Try finding by value
            deleted = await Config.findOneAndDelete({ type: 'branch', value: identifier });
        }

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        res.json({ success: true, message: 'Branch deleted successfully' });
    } catch (error) {
        console.error('Error deleting branch:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new semester
app.post('/api/config/semesters', async (req, res) => {
    try {
        const { value } = req.body;

        if (!value) {
            return res.status(400).json({ success: false, error: 'Semester value is required' });
        }

        const newSemester = await Config.create({
            type: 'semester',
            value: value.toString().trim(),
            displayName: `Semester ${value}`,
            isActive: true
        });

        res.json({ success: true, semester: newSemester });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Semester already exists' });
        }
        console.error('Error adding semester:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete semester
app.delete('/api/config/semesters/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;

        // Try to delete by _id first, then by value
        let deleted = null;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            deleted = await Config.findByIdAndDelete(identifier);
        }

        if (!deleted) {
            // Try finding by value
            deleted = await Config.findOneAndDelete({ type: 'semester', value: identifier });
        }

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Semester not found' });
        }

        res.json({ success: true, message: 'Semester deleted successfully' });
    } catch (error) {
        console.error('Error deleting semester:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available departments (dynamic)
app.get('/api/config/departments', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const departments = await getDepartmentsFromConfig();

            res.json({
                success: true,
                departments: departments,
                count: departments.length
            });
        } else {
            // Fallback to default departments
            res.json({
                success: true,
                departments: [
                    { code: 'CSE', name: 'Computer Science', value: 'CSE' },
                    { code: 'ECE', name: 'Electronics', value: 'ECE' }
                ],
                count: 2
            });
        }
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new department
app.post('/api/config/departments', async (req, res) => {
    try {
        const { value, displayName } = req.body;

        if (!value) {
            return res.status(400).json({ success: false, error: 'Department value is required' });
        }

        const newDepartment = await Config.create({
            type: 'department',
            value: value.trim(),
            displayName: displayName?.trim() || value.trim(),
            isActive: true
        });

        res.json({ success: true, department: newDepartment });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Department already exists' });
        }
        console.error('Error adding department:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update department
app.put('/api/config/departments/:id', async (req, res) => {
    try {
        const { value, displayName, isActive } = req.body;

        const updated = await Config.findByIdAndUpdate(
            req.params.id,
            {
                value: value?.trim(),
                displayName: displayName?.trim(),
                isActive,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Department not found' });
        }

        res.json({ success: true, department: updated });
    } catch (error) {
        console.error('Error updating department:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete department
app.delete('/api/config/departments/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;

        // Try to delete by _id first, then by value
        let deleted = null;
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            deleted = await Config.findByIdAndDelete(identifier);
        }

        if (!deleted) {
            // Try finding by value
            deleted = await Config.findOneAndDelete({ type: 'department', value: identifier });
        }

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Department not found' });
        }

        res.json({ success: true, message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current academic year (calculated)
app.get('/api/config/academic-year', async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Academic year starts in July (month 6)
        let academicYear;
        if (month >= 6) {
            academicYear = `${year}-${year + 1}`;
        } else {
            academicYear = `${year - 1}-${year}`;
        }

        res.json({
            success: true,
            academicYear,
            startYear: parseInt(academicYear.split('-')[0]),
            endYear: parseInt(academicYear.split('-')[1])
        });
    } catch (error) {
        console.error('Error calculating academic year:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get app configuration (all dynamic settings)
app.get('/api/config/app', async (req, res) => {
    try {
        // Get branches from Config collection
        const branches = await getBranchesFromConfig();

        // Get semesters from Config collection
        const semesters = await getSemestersFromConfig();

        // Calculate academic year
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const academicYear = month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

        res.json({
            success: true,
            config: {
                appName: 'LetsBunk',
                version: '2.1.0',
                academicYear,
                branches: branches,
                semesters: semesters,
                features: {
                    faceVerification: true,
                    randomRing: true,
                    offlineTracking: true,
                    parentNotifications: false // Coming soon
                }
            }
        });
    } catch (error) {
        console.error('Error fetching app config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rate limiting for login endpoints - Per User ID instead of Per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per user per 15 minutes (increased for legitimate retries)
    message: { success: false, error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Use user ID instead of IP address for rate limiting
    keyGenerator: (req) => {
        // Use the login ID (student enrollment or teacher employee ID) as the key
        return req.body.id || req.ip; // Fallback to IP if no ID provided
    },
    // Skip rate limiting for successful logins
    skipSuccessfulRequests: true,
    // Only count failed login attempts
    skipFailedRequests: false,
});

// Login endpoint
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { id, password } = req.body;
        console.log('Login attempt:', id);

        if (!id || !password) {
            return res.json({ success: false, message: 'ID and password required' });
        }

        // Sanitize input to prevent NoSQL injection
        const sanitizedId = String(id).trim();

        // Try to find as student first
        let user = null;
        let role = null;

        if (mongoose.connection.readyState === 1) {
            // Check in StudentManagement collection
            user = await StudentManagement.findOne({
                $or: [
                    { enrollmentNo: sanitizedId },
                    { email: sanitizedId }
                ]
            });

            if (user) {
                // Check if password is hashed (starts with $2b$ for bcrypt)
                const isPasswordValid = user.password.startsWith('$2b$')
                    ? await bcrypt.compare(password, user.password)
                    : user.password === password; // Fallback for legacy plain text passwords

                if (isPasswordValid) {
                    role = 'student';
                    console.log('✅ Student logged in:', user.name);
                    console.log('📸 PhotoUrl from DB:', user.photoUrl);
                    console.log('👤 Face embedding:', user.faceEmbedding ? `${user.faceEmbedding.length} floats` : 'Not enrolled');
                    return res.json({
                        success: true,
                        user: {
                            _id: user._id,
                            name: user.name,
                            email: user.email,
                            enrollmentNo: user.enrollmentNo,
                            course: user.branch,
                            branch: user.branch,
                            semester: user.semester,
                            phone: user.phone,
                            photoUrl: user.photoUrl,
                            faceEmbedding: user.faceEmbedding || null, // Include face embedding
                            hasFaceEnrolled: !!user.faceEmbedding,
                            role: 'student'
                        }
                    });
                }
            }

            // Check in Teacher collection
            user = await Teacher.findOne({
                $or: [
                    { employeeId: sanitizedId },
                    { email: sanitizedId }
                ]
            });

            if (user) {
                // Check if password is hashed
                const isPasswordValid = user.password.startsWith('$2b$')
                    ? await bcrypt.compare(password, user.password)
                    : user.password === password; // Fallback for legacy plain text passwords

                if (isPasswordValid) {
                    role = 'teacher';
                    console.log('Teacher logged in:', user.name);
                    return res.json({
                        success: true,
                        user: {
                            _id: user._id,
                            name: user.name,
                            email: user.email,
                            employeeId: user.employeeId,
                            department: user.department,
                            phone: user.phone,
                            photoUrl: user.photoUrl,
                            canEditTimetable: user.canEditTimetable,
                            role: 'teacher'
                        }
                    });
                }
            }
        } else {
            // In-memory storage (development only)
            user = studentManagementMemory.find(s =>
                (s.enrollmentNo === sanitizedId || s.email === sanitizedId) && s.password === password
            );

            if (user) {
                console.log('Student logged in (memory):', user.name);
                return res.json({
                    success: true,
                    user: {
                        ...user,
                        role: 'student'
                    }
                });
            }

            user = teachersMemory.find(t =>
                (t.employeeId === sanitizedId || t.email === sanitizedId) && t.password === password
            );

            if (user) {
                console.log('Teacher logged in (memory):', user.name);
                return res.json({
                    success: true,
                    user: {
                        ...user,
                        role: 'teacher'
                    }
                });
            }
        }

        console.log('Login failed for:', sanitizedId);
        res.json({ success: false, message: 'Invalid ID or password' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Student Management
const studentManagementSchema = new mongoose.Schema({
    enrollmentNo: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    branch: { type: String, required: true },
    semester: { type: String, required: true },
    dob: { type: Date, required: true },
    phone: String,
    photoUrl: String,
    faceEmbedding: { type: [Number], default: null }, // Face recognition embedding (192 floats)
    faceEnrolledAt: { type: Date }, // When face was enrolled
    createdAt: { type: Date, default: Date.now },
    // Timer and attendance tracking fields
    timerValue: { type: Number, default: 0 },
    isRunning: { type: Boolean, default: false },
    status: { type: String, enum: ['attending', 'absent', 'present'], default: 'absent' },
    lastUpdated: { type: Date, default: Date.now },
    // Attendance session tracking (server-side timer)
    attendanceSession: {
        sessionStartTime: { type: Date },
        totalAttendedSeconds: { type: Number, default: 0 },
        lastPauseTime: { type: Date },
        pausedDuration: { type: Number, default: 0 },
        isPaused: { type: Boolean, default: false },
        pauseReason: { type: String },
        randomRingId: { type: String }, // Current Random Ring ID
        randomRingTime: { type: Date }, // When Random Ring was triggered
        timeBeforeRandomRing: { type: Number }, // Attended time before Random Ring
        verifiedForPeriod: { type: String }, // Period ID for face verification
        offlinePeriods: [{ // Track offline periods
            startTime: { type: Date },
            endTime: { type: Date },
            duration: { type: Number }
        }],
        // WiFi-based attendance tracking
        wifiEvents: [{ // Track WiFi connection events
            timestamp: { type: Date },
            type: { type: String }, // 'connected', 'disconnected', 'bssid_changed', 'grace_expired'
            bssid: { type: String },
            lecture: {
                subject: String,
                room: String,
                startTime: String,
                endTime: String
            },
            gracePeriod: { type: Boolean, default: false }
        }],
        pauseEvents: [{ // Track timer pause/resume events
            type: { type: String }, // 'paused', 'resumed'
            reason: { type: String }, // 'wifi_disconnected', 'grace_expired', 'wrong_bssid', etc.
            timestamp: { type: Date }
        }]
    },
    // Current class info
    currentClass: {
        subject: String,
        teacher: String,
        room: String,
        period: Number,
        startTime: String,
        endTime: String,
        totalDurationSeconds: Number
    },
    // 5-minute backup data for recovery
    attendanceBackup: [{
        date: { type: Date, required: true },
        timestamp: { type: Date, required: true },
        attendedMinutes: { type: Number, required: true },
        currentClass: { type: String },
        isRunning: { type: Boolean },
        status: { type: String }
    }]
});

const StudentManagement = mongoose.model('StudentManagement', studentManagementSchema);

// Debug endpoint to test timer calculation
app.get('/api/debug/timer-calc/:enrollmentNo', async (req, res) => {
    try {
        const student = await StudentManagement.findOne({ enrollmentNo: req.params.enrollmentNo });
        if (!student) {
            return res.json({ error: 'Student not found' });
        }

        const now = Date.now();
        const session = student.attendanceSession;

        if (!session || !session.sessionStartTime) {
            return res.json({
                error: 'No session data',
                student: student.name,
                hasSession: !!session,
                hasStartTime: !!session?.sessionStartTime
            });
        }

        const startTime = new Date(session.sessionStartTime).getTime();
        const sessionDuration = Math.floor((now - startTime) / 1000);
        const pausedDuration = session.pausedDuration || 0;
        const attended = Math.max(0, sessionDuration - pausedDuration);

        res.json({
            student: student.name,
            enrollmentNo: student.enrollmentNo,
            now: new Date(now).toISOString(),
            sessionStartTime: session.sessionStartTime,
            sessionStartTimeType: typeof session.sessionStartTime,
            startTimeConverted: new Date(session.sessionStartTime).toISOString(),
            startTimeMs: startTime,
            nowMs: now,
            sessionDurationSeconds: sessionDuration,
            pausedDurationSeconds: pausedDuration,
            attendedSeconds: attended,
            attendedMinutes: Math.floor(attended / 60),
            isPaused: session.isPaused,
            totalAttendedSecondsInDB: session.totalAttendedSeconds
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/students', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const students = await StudentManagement.find();
            res.json({ success: true, students });
        } else {
            res.json({ success: true, students: studentManagementMemory });
        }
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single student by enrollment number
app.get('/api/student-management', async (req, res) => {
    try {
        const { enrollmentNo } = req.query;
        if (!enrollmentNo) {
            return res.status(400).json({ success: false, error: 'Enrollment number required' });
        }

        if (mongoose.connection.readyState === 1) {
            const student = await StudentManagement.findOne({ enrollmentNo });
            if (student) {
                res.json({ success: true, student });
            } else {
                res.json({ success: false, error: 'Student not found' });
            }
        } else {
            const student = studentManagementMemory.find(s => s.enrollmentNo === enrollmentNo);
            if (student) {
                res.json({ success: true, student });
            } else {
                res.json({ success: false, error: 'Student not found' });
            }
        }
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get students by semester and branch (for ViewRecords screen)
app.get('/api/view-records/students', async (req, res) => {
    try {
        const { semester, branch } = req.query;

        if (!semester || !branch) {
            return res.status(400).json({
                success: false,
                error: 'Semester and branch required'
            });
        }

        console.log(`📋 Fetching records for ${branch} Semester ${semester}`);

        if (mongoose.connection.readyState === 1) {
            const students = await StudentManagement.find({
                semester: semester,
                branch: branch
            }).select('-password');

            // Get current attendance session and stats for each student
            const today = new Date().toISOString().split('T')[0];
            const studentsWithStats = await Promise.all(
                students.map(async (student) => {
                    try {
                        // Get attendance records for stats
                        const records = await AttendanceRecord.find({
                            studentId: student._id
                        });

                        const total = records.length;
                        const present = records.filter(r => r.status === 'present').length;
                        const attendancePercentage = total > 0 ? Math.round((present / total) * 100) : 0;

                        // Get current session for real-time status
                        const session = await AttendanceSession.findOne({
                            studentId: student._id,
                            date: today
                        });

                        // Get today's record
                        const todayRecord = await AttendanceRecord.findOne({
                            studentId: student._id,
                            date: today
                        });

                        return {
                            ...student.toObject(),
                            // Historical stats
                            attendancePercentage,
                            totalDays: total,
                            presentDays: present,
                            // Real-time status
                            isRunning: session?.isActive || false,
                            timerValue: session?.timerValue || 0,
                            status: session?.isActive ? 'attending' : (todayRecord?.status || 'absent'),
                            joinTime: session?.sessionStartTime || null,
                            wifiConnected: session?.wifiConnected || false,
                            sessionId: session?._id || null
                        };
                    } catch (error) {
                        console.error(`❌ Error getting data for student ${student.name}:`, error);
                        return {
                            ...student.toObject(),
                            attendancePercentage: 0,
                            totalDays: 0,
                            presentDays: 0,
                            isRunning: false,
                            timerValue: 0,
                            status: 'absent',
                            joinTime: null,
                            wifiConnected: false
                        };
                    }
                })
            );

            res.json({
                success: true,
                students: studentsWithStats,
                count: studentsWithStats.length
            });
        } else {
            // In-memory fallback
            const students = studentManagementMemory.filter(s =>
                s.semester === semester && s.branch === branch
            );

            res.json({
                success: true,
                students: students.map(s => ({
                    ...s,
                    attendancePercentage: Math.floor(Math.random() * 30) + 70
                })),
                count: students.length
            });
        }
    } catch (error) {
        console.error('❌ Error fetching view records:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Photo upload endpoint
app.post('/api/upload-photo', async (req, res) => {
    try {
        const { photoData, type, id } = req.body;

        if (!photoData) {
            return res.status(400).json({ success: false, error: 'No photo data provided' });
        }

        // Extract base64 data
        const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');

        // Face validation disabled - accepting all photos
        console.log('ℹ️  Face validation disabled - accepting photo without face detection');

        // Store as base64 data URI (no external storage needed)
        console.log('💾 Storing photo as base64 in database...');

        const photoUrl = `data:image/jpeg;base64,${base64Data}`;

        console.log(`✅ Photo prepared for database storage (${base64Data.length} bytes)`);

        res.json({
            success: true,
            photoUrl,
            filename: `${type}_${id}_${Date.now()}`,
            message: 'Photo uploaded successfully with face detected!'
        });
    } catch (error) {
        console.error('❌ Error uploading photo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get photo by filename (for testing)
app.get('/api/photo/:filename', (req, res) => {
    try {
        const filepath = path.join(uploadsDir, req.params.filename);
        if (fs.existsSync(filepath)) {
            res.sendFile(filepath);
        } else {
            res.status(404).json({ success: false, error: 'Photo not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/students', async (req, res) => {
    try {
        console.log('Received student data:', req.body);
        if (mongoose.connection.readyState === 1) {
            const student = new StudentManagement(req.body);
            await student.save();
            console.log('Student saved to MongoDB:', student);
            res.json({ success: true, student });
        } else {
            // In-memory storage
            const student = {
                _id: 'student_' + Date.now(),
                ...req.body,
                createdAt: new Date()
            };
            studentManagementMemory.push(student);
            console.log('Student saved to memory:', student);
            res.json({ success: true, student });
        }
    } catch (error) {
        console.error('Error saving student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/students/bulk', async (req, res) => {
    try {
        const { students } = req.body;
        console.log('Bulk import students:', students.length);
        if (mongoose.connection.readyState === 1) {
            const result = await StudentManagement.insertMany(students, { ordered: false });
            res.json({ success: true, count: result.length });
        } else {
            // In-memory storage
            students.forEach(s => {
                studentManagementMemory.push({
                    _id: 'student_' + Date.now() + Math.random(),
                    ...s,
                    createdAt: new Date()
                });
            });
            res.json({ success: true, count: students.length });
        }
    } catch (error) {
        console.error('Error bulk importing students:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Face Enrollment API Routes
// Enroll face for existing student
app.post('/api/enrollment', async (req, res) => {
    try {
        const { enrollmentNo, faceEmbedding } = req.body;

        // Validation
        if (!enrollmentNo || !faceEmbedding) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: enrollmentNo and faceEmbedding' 
            });
        }

        if (!Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid face embedding data' 
            });
        }

        // Check if student exists
        const student = await StudentManagement.findOne({ enrollmentNo });
        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: `Student with enrollment number ${enrollmentNo} not found. Please register the student first.` 
            });
        }

        // Update student with face embedding
        student.faceEmbedding = faceEmbedding;
        student.faceEnrolledAt = new Date();
        await student.save();

        console.log(`✅ Face enrolled for student: ${enrollmentNo} (${student.name})`);

        res.status(201).json({ 
            success: true, 
            message: `Face enrolled successfully for ${student.name}`,
            data: {
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                faceEnrolledAt: student.faceEnrolledAt
            }
        });

    } catch (error) {
        console.error('❌ Error enrolling face:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while enrolling face',
            error: error.message 
        });
    }
});

// Get enrollment status by enrollment number
app.get('/api/enrollment/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;

        const student = await StudentManagement.findOne({ enrollmentNo })
            .select('enrollmentNo name branch semester faceEmbedding faceEnrolledAt');

        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found' 
            });
        }

        res.json({ 
            success: true, 
            data: {
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                branch: student.branch,
                semester: student.semester,
                hasFaceEnrolled: !!student.faceEmbedding,
                faceEnrolledAt: student.faceEnrolledAt
            }
        });

    } catch (error) {
        console.error('❌ Error fetching enrollment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// Update face enrollment
app.put('/api/enrollment/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { faceEmbedding } = req.body;

        const student = await StudentManagement.findOne({ enrollmentNo });

        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found' 
            });
        }

        if (faceEmbedding) {
            student.faceEmbedding = faceEmbedding;
            student.faceEnrolledAt = new Date();
        }

        await student.save();

        console.log(`✅ Face updated for student: ${enrollmentNo}`);

        res.json({ 
            success: true, 
            message: 'Face enrollment updated successfully' 
        });

    } catch (error) {
        console.error('❌ Error updating face enrollment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// Delete face enrollment
app.delete('/api/enrollment/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;

        const student = await StudentManagement.findOne({ enrollmentNo });

        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found' 
            });
        }

        student.faceEmbedding = null;
        student.faceEnrolledAt = null;
        await student.save();

        console.log(`✅ Face enrollment deleted for: ${enrollmentNo}`);

        res.json({ 
            success: true, 
            message: 'Face enrollment deleted successfully' 
        });

    } catch (error) {
        console.error('❌ Error deleting face enrollment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// Get all enrollments (for admin)
app.get('/api/enrollments', async (req, res) => {
    try {
        const students = await StudentManagement.find({ faceEmbedding: { $ne: null } })
            .select('enrollmentNo name branch semester faceEnrolledAt');

        res.json({ 
            success: true, 
            count: students.length,
            data: students 
        });

    } catch (error) {
        console.error('❌ Error fetching enrollments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});

// Verify if student exists (for enrollment app validation)
app.post('/api/enrollment/verify', async (req, res) => {
    try {
        const { enrollmentNo } = req.body;

        const student = await StudentManagement.findOne({ enrollmentNo })
            .select('enrollmentNo name branch semester faceEmbedding');

        if (!student) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found. Please check the enrollment number.' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Student found',
            data: {
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                branch: student.branch,
                semester: student.semester,
                hasFaceEnrolled: !!student.faceEmbedding
            }
        });

    } catch (error) {
        console.error('❌ Error verifying student:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message 
        });
    }
});
// End of Face Enrollment API Routes

app.put('/api/students/:id', async (req, res) => {
    try {
        console.log('Updating student:', req.params.id, req.body);
        if (mongoose.connection.readyState === 1) {
            const student = await StudentManagement.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            console.log('Student updated in MongoDB:', student);
            res.json({ success: true, student });
        } else {
            // In-memory storage
            const index = studentManagementMemory.findIndex(s => s._id === req.params.id);
            if (index !== -1) {
                studentManagementMemory[index] = {
                    ...studentManagementMemory[index],
                    ...req.body
                };
                console.log('Student updated in memory:', studentManagementMemory[index]);
                res.json({ success: true, student: studentManagementMemory[index] });
            } else {
                res.status(404).json({ success: false, error: 'Student not found' });
            }
        }
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    try {
        console.log('Deleting student:', req.params.id);
        if (mongoose.connection.readyState === 1) {
            await StudentManagement.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } else {
            // In-memory storage
            const index = studentManagementMemory.findIndex(s => s._id === req.params.id);
            if (index !== -1) {
                studentManagementMemory.splice(index, 1);
            }
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Teacher Management
const teacherSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    subject: { type: String, required: true },
    dob: { type: Date, required: true },
    phone: String,
    photoUrl: String,
    semester: String,
    canEditTimetable: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);

app.get('/api/teachers', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const teachers = await Teacher.find();
            res.json({ success: true, teachers });
        } else {
            res.json({ success: true, teachers: teachersMemory });
        }
    } catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/teachers', async (req, res) => {
    try {
        console.log('📝 Adding new teacher:', req.body.name, req.body.employeeId);

        if (mongoose.connection.readyState === 1) {
            const teacher = new Teacher(req.body);
            await teacher.save();
            console.log('✅ Teacher saved to database:', teacher.name);
            res.json({
                success: true,
                teacher,
                message: `Teacher ${teacher.name} added successfully`
            });
        } else {
            // Check for duplicates in memory
            const exists = teachersMemory.find(t =>
                t.employeeId === req.body.employeeId || t.email === req.body.email
            );

            if (exists) {
                return res.status(400).json({
                    success: false,
                    error: 'Teacher with this Employee ID or Email already exists'
                });
            }

            const teacher = {
                _id: 'teacher_' + Date.now(),
                ...req.body,
                createdAt: new Date()
            };
            teachersMemory.push(teacher);
            console.log('✅ Teacher added to memory storage:', teacher.name);
            res.json({
                success: true,
                teacher,
                message: `Teacher ${teacher.name} added successfully`
            });
        }
    } catch (error) {
        console.error('❌ Error saving teacher:', error);

        // Handle duplicate key errors
        if (error.code === 11000) {
            const duplicateField = error.message.includes('email') ? 'email' : 'employeeId';
            res.status(400).json({
                success: false,
                error: `A teacher with this ${duplicateField} already exists`,
                details: error.message
            });
        } else if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors.join(', ')
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error.message
            });
        }
    }
});

app.post('/api/teachers/bulk', async (req, res) => {
    try {
        const { teachers } = req.body;

        if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request: teachers array is required and must not be empty'
            });
        }

        console.log(`📥 Bulk importing ${teachers.length} teachers...`);

        if (mongoose.connection.readyState === 1) {
            // Use insertMany with ordered: false to continue on duplicates
            const result = await Teacher.insertMany(teachers, {
                ordered: false,
                rawResult: true
            });

            const insertedCount = result.insertedCount || result.length;
            console.log(`✅ Successfully inserted ${insertedCount} teachers`);

            res.json({
                success: true,
                count: insertedCount,
                message: `Successfully imported ${insertedCount} teacher${insertedCount !== 1 ? 's' : ''}`,
                total: teachers.length
            });
        } else {
            // Fallback to memory storage
            let addedCount = 0;
            teachers.forEach(t => {
                // Check for duplicates in memory
                const exists = teachersMemory.find(existing =>
                    existing.employeeId === t.employeeId || existing.email === t.email
                );

                if (!exists) {
                    teachersMemory.push({
                        _id: 'teacher_' + Date.now() + Math.random(),
                        ...t,
                        createdAt: new Date()
                    });
                    addedCount++;
                }
            });

            console.log(`✅ Added ${addedCount} teachers to memory storage`);
            res.json({
                success: true,
                count: addedCount,
                message: `Successfully imported ${addedCount} teacher${addedCount !== 1 ? 's' : ''}`,
                total: teachers.length
            });
        }
    } catch (error) {
        console.error('❌ Error bulk importing teachers:', error);

        // Handle duplicate key errors
        if (error.code === 11000) {
            const duplicateField = error.message.includes('email') ? 'email' : 'employeeId';
            res.status(400).json({
                success: false,
                error: `Duplicate ${duplicateField} found. Please check your data for duplicates.`,
                details: error.message
            });
        } else if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors.join(', ')
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Internal server error during bulk import',
                details: error.message
            });
        }
    }
});

app.put('/api/teachers/:id/timetable-access', async (req, res) => {
    try {
        const { canEditTimetable } = req.body;
        if (mongoose.connection.readyState === 1) {
            await Teacher.findByIdAndUpdate(req.params.id, { canEditTimetable });
            res.json({ success: true });
        } else {
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/teachers/:id', async (req, res) => {
    try {
        console.log('Updating teacher:', req.params.id, req.body);
        if (mongoose.connection.readyState === 1) {
            const teacher = await Teacher.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            res.json({ success: true, teacher });
        } else {
            const index = teachersMemory.findIndex(t => t._id === req.params.id);
            if (index !== -1) {
                teachersMemory[index] = {
                    ...teachersMemory[index],
                    ...req.body
                };
                res.json({ success: true, teacher: teachersMemory[index] });
            } else {
                res.status(404).json({ success: false, error: 'Teacher not found' });
            }
        }
    } catch (error) {
        console.error('Error updating teacher:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    try {
        console.log('Deleting teacher:', req.params.id);
        if (mongoose.connection.readyState === 1) {
            await Teacher.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } else {
            const index = teachersMemory.findIndex(t => t._id === req.params.id);
            if (index !== -1) {
                teachersMemory.splice(index, 1);
            }
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting teacher:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ATTENDANCE QUERY ENDPOINTS (Teacher Views)
// ============================================

// Get all dates for a student (Level 1: Student Overview)
app.get('/api/attendance/student/:enrollmentNo/dates', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        const records = await AttendanceRecord.find({
            enrollmentNo: enrollmentNo,  // Changed from enrollmentNumber
            ...dateFilter
        })
            .select('date status dayPercentage totalAttended totalClassTime lectures')
            .sort({ date: -1 });

        // Calculate summary
        const totalDays = records.length;
        const presentDays = records.filter(r => r.status === 'present').length;
        const totalSeconds = records.reduce((sum, r) => sum + (r.totalAttended || 0), 0);
        const totalClassSeconds = records.reduce((sum, r) => sum + (r.totalClassTime || 0), 0);
        const overallPercentage = totalClassSeconds > 0
            ? Math.round((totalSeconds / totalClassSeconds) * 100)
            : 0;

        res.json({
            success: true,
            student: {
                enrollmentNo: enrollmentNo,  // Changed from enrollmentNumber
                totalDays,
                presentDays,
                overallPercentage,
                totalHours: Math.floor(totalSeconds / 3600),
                totalMinutes: Math.floor((totalSeconds % 3600) / 60)
            },
            dates: records.map(r => ({
                date: r.date,
                status: r.status,
                percentage: r.dayPercentage,
                attended: r.totalAttended,
                total: r.totalClassTime,
                lectureCount: r.lectures.length
            }))
        });

    } catch (error) {
        console.error('Error fetching student dates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get specific date details (Level 2: Date Details)
app.get('/api/attendance/student/:enrollmentNo/date/:date', async (req, res) => {
    try {
        const { enrollmentNo, date } = req.params;

        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        const record = await AttendanceRecord.findOne({
            enrollmentNo: enrollmentNo,  // Changed from enrollmentNumber
            date: targetDate
        });

        if (!record) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }

        res.json({
            success: true,
            record: {
                date: record.date,
                status: record.status,
                dayPercentage: record.dayPercentage,
                totalAttended: record.totalAttended,
                totalClassTime: record.totalClassTime,
                checkInTime: record.checkInTime,
                checkOutTime: record.checkOutTime,
                lectures: record.lectures.map(l => ({
                    period: l.period,
                    subject: l.subject,
                    teacher: l.teacher,
                    teacherName: l.teacherName,
                    room: l.room,
                    startTime: l.startTime,
                    endTime: l.endTime,
                    attended: l.attended,
                    total: l.total,
                    percentage: l.percentage,
                    present: l.present,
                    attendedFormatted: formatSeconds(l.attended),
                    totalFormatted: formatSeconds(l.total)
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching date details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get specific lecture details (Level 3: Lecture Details)
app.get('/api/attendance/student/:enrollmentNo/date/:date/lecture/:period', async (req, res) => {
    try {
        const { enrollmentNo, date, period } = req.params;

        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        const record = await AttendanceRecord.findOne({
            enrollmentNo: enrollmentNo,
            date: targetDate
        });

        if (!record) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }

        const lecture = record.lectures.find(l => l.period === period);
        if (!lecture) {
            return res.status(404).json({ success: false, error: 'Lecture not found' });
        }

        res.json({
            success: true,
            lecture: {
                period: lecture.period,
                subject: lecture.subject,
                teacher: lecture.teacher,
                teacherName: lecture.teacherName,
                room: lecture.room,
                startTime: lecture.startTime,
                endTime: lecture.endTime,
                lectureStartedAt: lecture.lectureStartedAt,
                lectureEndedAt: lecture.lectureEndedAt,
                studentCheckIn: lecture.studentCheckIn,
                attended: lecture.attended,
                total: lecture.total,
                percentage: lecture.percentage,
                present: lecture.present,
                timeBreakdown: {
                    hours: Math.floor(lecture.attended / 3600),
                    minutes: Math.floor((lecture.attended % 3600) / 60),
                    seconds: lecture.attended % 60
                },
                totalDuration: {
                    hours: Math.floor(lecture.total / 3600),
                    minutes: Math.floor((lecture.total % 3600) / 60),
                    seconds: lecture.total % 60
                },
                verifications: lecture.verifications
            }
        });

    } catch (error) {
        console.error('Error fetching lecture details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get teacher's lectures (Level 4: Teacher View)
app.get('/api/attendance/teacher/:teacherId/lectures', async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { startDate, endDate, subject } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // Aggregate all lectures for this teacher
        const records = await AttendanceRecord.aggregate([
            { $match: dateFilter },
            { $unwind: '$lectures' },
            {
                $match: {
                    'lectures.teacher': teacherId,
                    ...(subject ? { 'lectures.subject': subject } : {})
                }
            },
            {
                $group: {
                    _id: {
                        date: '$date',
                        period: '$lectures.period',
                        subject: '$lectures.subject'
                    },
                    teacherName: { $first: '$lectures.teacherName' },
                    room: { $first: '$lectures.room' },
                    startTime: { $first: '$lectures.startTime' },
                    endTime: { $first: '$lectures.endTime' },
                    students: {
                        $push: {
                            studentId: '$studentId',
                            studentName: '$studentName',
                            enrollmentNo: '$enrollmentNo',  // Changed from enrollmentNumber
                            attended: '$lectures.attended',
                            total: '$lectures.total',
                            percentage: '$lectures.percentage',
                            present: '$lectures.present'
                        }
                    }
                }
            },
            { $sort: { '_id.date': -1 } }
        ]);

        // Calculate statistics
        const totalLectures = records.length;
        let totalStudents = 0;
        let totalPresent = 0;
        let totalSeconds = 0;
        let totalClassSeconds = 0;

        records.forEach(lecture => {
            totalStudents += lecture.students.length;
            totalPresent += lecture.students.filter(s => s.present).length;
            lecture.students.forEach(s => {
                totalSeconds += s.attended;
                totalClassSeconds += s.total;
            });
        });

        const avgAttendance = totalStudents > 0
            ? Math.round((totalPresent / totalStudents) * 100)
            : 0;

        res.json({
            success: true,
            summary: {
                teacherId,
                totalLectures,
                avgAttendance,
                totalTeachingHours: Math.floor(totalClassSeconds / 3600),
                totalStudentHours: Math.floor(totalSeconds / 3600)
            },
            lectures: records.map(l => ({
                date: l._id.date,
                period: l._id.period,
                subject: l._id.subject,
                room: l.room,
                startTime: l.startTime,
                endTime: l.endTime,
                studentsEnrolled: l.students.length,
                studentsPresent: l.students.filter(s => s.present).length,
                attendanceRate: l.students.length > 0
                    ? Math.round((l.students.filter(s => s.present).length / l.students.length) * 100)
                    : 0,
                students: l.students
            }))
        });

    } catch (error) {
        console.error('Error fetching teacher lectures:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// WIFI-BASED ATTENDANCE ENDPOINTS
// ============================================

// Log WiFi events for attendance tracking
app.post('/api/attendance/wifi-event', async (req, res) => {
    try {
        const { timestamp, type, bssid, lecture, studentId, timerState, gracePeriod } = req.body;

        console.log('📶 WiFi Event:', { type, studentId, bssid, gracePeriod });

        // Create WiFi event log entry
        const wifiEvent = {
            timestamp: new Date(timestamp),
            type: type, // 'connected', 'disconnected', 'bssid_changed', 'grace_expired'
            bssid: bssid,
            studentId: studentId,
            lecture: lecture,
            timerState: timerState,
            gracePeriod: gracePeriod || false
        };

        // Update student's attendance session with WiFi status
        if (mongoose.connection.readyState === 1) {
            const student = await StudentManagement.findOne({
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
                    { enrollmentNo: studentId }
                ].filter(query => query._id !== null || query.enrollmentNo)
            });

            if (student) {
                // Initialize attendance session if not exists
                if (!student.attendanceSession) {
                    student.attendanceSession = {
                        wifiConnected: false,
                        wifiEvents: [],
                        isActive: false
                    };
                }
                // Update WiFi connection status
                student.attendanceSession.wifiConnected = (type === 'connected');

                // Add WiFi event to history
                if (!student.attendanceSession.wifiEvents) {
                    student.attendanceSession.wifiEvents = [];
                }
                student.attendanceSession.wifiEvents.push(wifiEvent);

                // Keep only last 50 events
                if (student.attendanceSession.wifiEvents.length > 50) {
                    student.attendanceSession.wifiEvents = student.attendanceSession.wifiEvents.slice(-50);
                }

                // If disconnected and grace period expired, pause timer
                if (type === 'grace_expired' && student.attendanceSession.isActive) {
                    student.attendanceSession.isActive = false;
                    student.status = 'absent';
                    console.log(`⏸️ Timer paused for ${student.name} - WiFi grace period expired`);
                }

                // If reconnected and was paused due to WiFi, resume timer
                if (type === 'connected' && !student.attendanceSession.isActive &&
                    student.attendanceSession.wifiEvents.some(e => e.type === 'disconnected' || e.type === 'grace_expired')) {
                    student.attendanceSession.isActive = true;
                    student.status = 'attending';
                    console.log(`▶️ Timer resumed for ${student.name} - WiFi reconnected`);
                }

                await student.save();
            }
        }

        res.json({ success: true, message: 'WiFi event logged' });
    } catch (error) {
        console.error('❌ Error logging WiFi event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get authorized BSSIDs for current lecture
app.get('/api/attendance/authorized-bssid/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;

        // Get student's current lecture info
        const orConditions = [{ enrollmentNo: studentId }];
        if (studentId.match(/^[0-9a-fA-F]{24}$/)) {
            orConditions.push({ _id: studentId });
        }
        const student = await StudentManagement.findOne({ $or: orConditions });

        if (!student || !student.attendanceSession || !student.attendanceSession.currentClass) {
            return res.json({
                success: true,
                authorized: false,
                reason: 'no_active_lecture',
                message: 'No active lecture found'
            });
        }

        const currentClass = student.attendanceSession.currentClass;

        // Get classroom BSSID
        const classroom = await Classroom.findOne({ roomNumber: currentClass.room });

        if (!classroom || !classroom.wifiBSSID) {
            return res.json({
                success: true,
                authorized: false,
                reason: 'room_not_configured',
                message: `Room ${currentClass.room} WiFi not configured`
            });
        }

        res.json({
            success: true,
            authorized: true,
            bssid: classroom.wifiBSSID,
            room: currentClass.room,
            lecture: {
                subject: currentClass.subject,
                startTime: currentClass.startTime,
                endTime: currentClass.endTime
            }
        });

    } catch (error) {
        console.error('❌ Error getting authorized BSSID:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Validate BSSID for current lecture
app.post('/api/attendance/validate-bssid', async (req, res) => {
    try {
        const { studentId, currentBSSID, roomNumber } = req.body;

        console.log('📶 BSSID Validation:', { studentId, currentBSSID, roomNumber });

        if (!currentBSSID) {
            return res.json({
                success: true,
                authorized: false,
                reason: 'no_wifi',
                message: 'Not connected to WiFi'
            });
        }

        // Get classroom's authorized BSSID
        const classroom = await Classroom.findOne({ roomNumber: roomNumber });

        if (!classroom || !classroom.wifiBSSID) {
            return res.json({
                success: true,
                authorized: false,
                reason: 'room_not_configured',
                message: `Room ${roomNumber} WiFi not configured`
            });
        }

        const isAuthorized = currentBSSID.toLowerCase() === classroom.wifiBSSID.toLowerCase();

        console.log(`📶 BSSID Check: ${currentBSSID} vs ${classroom.wifiBSSID} = ${isAuthorized ? '✅' : '❌'}`);

        res.json({
            success: true,
            authorized: isAuthorized,
            expectedBSSID: classroom.wifiBSSID,
            currentBSSID: currentBSSID,
            room: {
                roomNumber: classroom.roomNumber,
                building: classroom.building
            },
            reason: isAuthorized ? 'authorized' : 'wrong_bssid',
            message: isAuthorized ?
                `Connected to ${roomNumber} WiFi` :
                `Wrong WiFi - Connect to ${roomNumber} network`
        });

    } catch (error) {
        console.error('❌ Error validating BSSID:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Timer pause/resume events from WiFi system
app.post('/api/attendance/timer-paused', async (req, res) => {
    try {
        const { studentId, reason, timestamp } = req.body;

        console.log('⏸️ Timer paused by WiFi system:', { studentId, reason });

        // Update student status
        const student = await StudentManagement.findOne({
            $or: [
                { _id: studentId },
                { enrollmentNo: studentId }
            ]
        });

        if (student && student.attendanceSession) {
            student.attendanceSession.isActive = false;
            student.status = 'absent';

            // Log pause event
            if (!student.attendanceSession.pauseEvents) {
                student.attendanceSession.pauseEvents = [];
            }
            student.attendanceSession.pauseEvents.push({
                type: 'paused',
                reason: reason,
                timestamp: new Date(timestamp)
            });

            await student.save();

            // Broadcast to teachers
            io.emit('student_update', {
                studentId: student._id,
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                status: 'absent',
                isRunning: false,
                timerValue: student.attendanceSession.totalAttendedSeconds || 0,
                pauseReason: reason
            });
        }

        res.json({ success: true, message: 'Timer paused' });
    } catch (error) {
        console.error('❌ Error pausing timer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Offline attendance sync endpoint
app.post('/api/attendance/sync-offline', async (req, res) => {
    try {
        const {
            studentId, studentName, semester, branch,
            offlineStartTime, offlineEndTime, totalOfflineSeconds,
            lastKnownOnlineSeconds, currentLecture, events, syncTimestamp
        } = req.body;

        console.log('🔄 Syncing offline attendance:', {
            studentId,
            offlineMinutes: Math.floor(totalOfflineSeconds / 60),
            eventCount: events?.length || 0
        });

        // Validate offline session
        if (!studentId || !offlineStartTime || !offlineEndTime) {
            return res.status(400).json({
                success: false,
                error: 'Missing required offline session data'
            });
        }

        // Find student
        const student = await StudentManagement.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
                { enrollmentNo: studentId }
            ].filter(query => query._id !== null || query.enrollmentNo)
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // CRITICAL: Check for failed random ring during offline period
        let acceptedSeconds = totalOfflineSeconds;
        let rejectionReason = null;

        const session = student.attendanceSession;
        if (session && session.randomRingPassed === false) {
            // Random ring FAILED - apply timer cutoff
            const randomRingTime = new Date(session.randomRingTime).getTime();
            const offlineStart = new Date(offlineStartTime).getTime();
            const offlineEnd = new Date(offlineEndTime).getTime();

            // If offline period includes or is after failed random ring
            if (offlineEnd > randomRingTime && randomRingTime >= offlineStart) {
                // Only count time until random ring
                const timeUntilRandomRing = Math.floor((randomRingTime - offlineStart) / 1000);
                acceptedSeconds = Math.max(0, timeUntilRandomRing);
                rejectionReason = 'random_ring_failed_cutoff';

                console.log(`❌ Random ring cutoff applied for ${studentName}:`);
                console.log(`   Random ring time: ${new Date(randomRingTime).toISOString()}`);
                console.log(`   Offline start: ${new Date(offlineStart).toISOString()}`);
                console.log(`   Offline end: ${new Date(offlineEnd).toISOString()}`);
                console.log(`   Original offline: ${Math.floor(totalOfflineSeconds / 60)} min`);
                console.log(`   Accepted (until random ring): ${Math.floor(acceptedSeconds / 60)} min`);
            } else if (offlineStart >= randomRingTime) {
                // Entire offline period is after failed random ring - reject all
                acceptedSeconds = 0;
                rejectionReason = 'random_ring_failed_all_rejected';

                console.log(`❌ All offline time rejected - after failed random ring`);
            }
        }

        // Apply other business rules only if not already cut off by random ring
        if (rejectionReason !== 'random_ring_failed_cutoff' && rejectionReason !== 'random_ring_failed_all_rejected') {
            // Business rule: Maximum 2 hours offline per session
            const maxOfflineSeconds = 2 * 60 * 60; // 2 hours
            if (totalOfflineSeconds > maxOfflineSeconds) {
                acceptedSeconds = maxOfflineSeconds;
                rejectionReason = 'exceeded_max_offline_time';
            }

            // Business rule: Must have valid lecture during offline period
            if (!currentLecture || !currentLecture.subject) {
                acceptedSeconds = Math.floor(acceptedSeconds * 0.5); // 50% penalty
                rejectionReason = 'no_valid_lecture';
            }

            // Business rule: Check for suspicious patterns in events
            if (events && events.length > 0) {
                const disconnectEvents = events.filter(e => e.type === 'wifi_disconnected').length;
                const connectEvents = events.filter(e => e.type === 'wifi_connected').length;

                // Too many WiFi toggles might indicate manipulation
                if (disconnectEvents > 10 || Math.abs(disconnectEvents - connectEvents) > 5) {
                    acceptedSeconds = Math.floor(acceptedSeconds * 0.7); // 30% penalty
                    rejectionReason = 'suspicious_wifi_pattern';
                }
            }
        }

        // Update student's attendance session
        if (!student.attendanceSession) {
            student.attendanceSession = {};
        }

        // Add offline time to total attended seconds
        const previousAttended = student.attendanceSession.totalAttendedSeconds || lastKnownOnlineSeconds || 0;
        student.attendanceSession.totalAttendedSeconds = previousAttended + acceptedSeconds;

        // Log offline sync event
        if (!student.attendanceSession.offlineSyncs) {
            student.attendanceSession.offlineSyncs = [];
        }

        student.attendanceSession.offlineSyncs.push({
            syncTimestamp: new Date(syncTimestamp),
            offlineStartTime: new Date(offlineStartTime),
            offlineEndTime: new Date(offlineEndTime),
            totalOfflineSeconds: totalOfflineSeconds,
            acceptedSeconds: acceptedSeconds,
            rejectionReason: rejectionReason,
            currentLecture: currentLecture,
            eventCount: events?.length || 0,
            randomRingCutoff: rejectionReason?.includes('random_ring') || false
        });

        // Keep only last 10 offline syncs
        if (student.attendanceSession.offlineSyncs.length > 10) {
            student.attendanceSession.offlineSyncs = student.attendanceSession.offlineSyncs.slice(-10);
        }

        await student.save();

        console.log(`✅ Offline sync completed for ${studentName}:`);
        console.log(`   Total offline: ${Math.floor(totalOfflineSeconds / 60)} minutes`);
        console.log(`   Accepted: ${Math.floor(acceptedSeconds / 60)} minutes`);
        console.log(`   Reason: ${rejectionReason || 'full_acceptance'}`);

        // Broadcast updated attendance to teachers
        io.emit('student_update', {
            studentId: student._id,
            enrollmentNo: student.enrollmentNo,
            name: student.name,
            status: 'present',
            isRunning: false,
            timerValue: student.attendanceSession.totalAttendedSeconds,
            offlineSync: {
                totalOfflineSeconds,
                acceptedSeconds,
                rejectionReason
            }
        });

        res.json({
            success: true,
            acceptedSeconds: acceptedSeconds,
            totalOfflineSeconds: totalOfflineSeconds,
            rejectionReason: rejectionReason,
            newTotalSeconds: student.attendanceSession.totalAttendedSeconds,
            message: rejectionReason ?
                `Offline time partially accepted: ${rejectionReason}` :
                'Offline time fully accepted',
            randomRingCutoff: rejectionReason?.includes('random_ring') || false
        });

    } catch (error) {
        console.error('❌ Error syncing offline attendance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/attendance/timer-resumed', async (req, res) => {
    try {
        const { studentId, reason, timestamp } = req.body;

        console.log('▶️ Timer resumed by WiFi system:', { studentId, reason });

        // Update student status
        const student = await StudentManagement.findOne({
            $or: [
                { _id: studentId },
                { enrollmentNo: studentId }
            ]
        });

        if (student && student.attendanceSession) {
            student.attendanceSession.isActive = true;
            student.status = 'attending';

            // Log resume event
            if (!student.attendanceSession.pauseEvents) {
                student.attendanceSession.pauseEvents = [];
            }
            student.attendanceSession.pauseEvents.push({
                type: 'resumed',
                reason: reason,
                timestamp: new Date(timestamp)
            });

            await student.save();

            // Broadcast to teachers
            io.emit('student_update', {
                studentId: student._id,
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                status: 'attending',
                isRunning: true,
                timerValue: student.attendanceSession.totalAttendedSeconds || 0,
                resumeReason: reason
            });
        }

        res.json({ success: true, message: 'Timer resumed' });
    } catch (error) {
        console.error('❌ Error handling timer resume:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// SYSTEM SETTINGS ENDPOINTS
// ============================================

// Get attendance threshold
app.get('/api/settings/attendance-threshold', async (req, res) => {
    try {
        const setting = await SystemSettings.findOne({ settingKey: 'attendance_threshold' });
        res.json({
            success: true,
            threshold: setting ? parseInt(setting.settingValue) : 75,
            description: setting?.description || 'Minimum attendance percentage required'
        });
    } catch (error) {
        console.error('Error getting threshold:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update attendance threshold
app.post('/api/settings/attendance-threshold', async (req, res) => {
    try {
        const { threshold, updatedBy } = req.body;

        // Validate threshold
        const thresholdValue = parseInt(threshold);
        if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 100) {
            return res.status(400).json({
                success: false,
                error: 'Threshold must be a number between 0 and 100'
            });
        }

        // Update in database
        await SystemSettings.findOneAndUpdate(
            { settingKey: 'attendance_threshold' },
            {
                settingValue: thresholdValue,
                description: 'Minimum attendance percentage required to mark student as present',
                updatedAt: new Date(),
                updatedBy: updatedBy || 'admin'
            },
            { upsert: true, new: true }
        );

        // Update in-memory value
        ATTENDANCE_THRESHOLD = thresholdValue;

        console.log(`✅ Attendance threshold updated to ${thresholdValue}% by ${updatedBy || 'admin'}`);

        res.json({
            success: true,
            message: `Attendance threshold updated to ${thresholdValue}%`,
            threshold: thresholdValue
        });
    } catch (error) {
        console.error('Error updating threshold:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all system settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await SystemSettings.find();
        res.json({
            success: true,
            settings: settings.map(s => ({
                key: s.settingKey,
                value: s.settingValue,
                description: s.description,
                updatedAt: s.updatedAt,
                updatedBy: s.updatedBy
            }))
        });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function to format seconds
function formatSeconds(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

// System Settings Schema
const systemSettingsSchema = new mongoose.Schema({
    settingKey: { type: String, required: true, unique: true },
    settingValue: mongoose.Schema.Types.Mixed,
    description: String,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String
});

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

// Default attendance threshold
let ATTENDANCE_THRESHOLD = 75; // Default 75%

// Load attendance threshold from database on startup
async function loadAttendanceThreshold() {
    try {
        const setting = await SystemSettings.findOne({ settingKey: 'attendance_threshold' });
        if (setting) {
            ATTENDANCE_THRESHOLD = parseInt(setting.settingValue) || 75;
            console.log(`✅ Loaded attendance threshold: ${ATTENDANCE_THRESHOLD}%`);
        } else {
            // Create default setting
            await SystemSettings.create({
                settingKey: 'attendance_threshold',
                settingValue: 75,
                description: 'Minimum attendance percentage required to mark student as present',
                updatedBy: 'system'
            });
            console.log(`✅ Created default attendance threshold: 75%`);
        }
    } catch (error) {
        console.error('⚠️ Error loading attendance threshold:', error);
        ATTENDANCE_THRESHOLD = 75; // Fallback to default
    }
}

// Call on server start
loadAttendanceThreshold();

// Config Schema - Store branches, semesters, and departments
const configSchema = new mongoose.Schema({
    type: { type: String, required: true, enum: ['branch', 'semester', 'department'] },
    value: { type: String, required: true },
    displayName: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

configSchema.index({ type: 1, value: 1 }, { unique: true });

const Config = mongoose.model('Config', configSchema);

// Helper functions to get branches and semesters from Config collection
async function getBranchesFromConfig() {
    try {
        const configBranches = await Config.find({ type: 'branch', isActive: true }).sort({ value: 1 });

        if (configBranches.length > 0) {
            return configBranches.map(branch => ({
                id: branch.value.toLowerCase().replace(/\s+/g, '-'),
                name: branch.value,
                displayName: branch.displayName || branch.value,
                value: branch.value
            }));
        }

        // Fallback: Get unique branches from StudentManagement collection
        const branches = await StudentManagement.distinct('course');
        return branches.map(branch => ({
            id: branch.toLowerCase().replace(/\s+/g, '-'),
            name: branch,
            displayName: branch,
            value: branch
        }));
    } catch (error) {
        console.error('Error getting branches:', error);
        return [{ id: 'b-tech-data-science', name: 'B.Tech Data Science', displayName: 'Data Science', value: 'B.Tech Data Science' }];
    }
}

async function getSemestersFromConfig() {
    try {
        const configSemesters = await Config.find({ type: 'semester', isActive: true }).sort({ value: 1 });

        if (configSemesters.length > 0) {
            return configSemesters.map(sem => sem.value);
        }

        // Fallback: Get unique semesters from StudentManagement collection
        const semesters = await StudentManagement.distinct('semester');
        return semesters.sort((a, b) => parseInt(a) - parseInt(b));
    } catch (error) {
        console.error('Error getting semesters:', error);
        return ['1', '2', '3', '4', '5', '6', '7', '8'];
    }
}

async function getDepartmentsFromConfig() {
    try {
        const configDepartments = await Config.find({ type: 'department', isActive: true }).sort({ value: 1 });

        if (configDepartments.length > 0) {
            return configDepartments.map(dept => ({
                code: dept.value,
                name: dept.displayName || dept.value,
                value: dept.value
            }));
        }

        // Fallback: Get unique departments from Teacher collection
        const departments = await Teacher.distinct('department');
        return departments.filter(d => d).map(dept => ({
            code: dept,
            name: dept,
            value: dept
        }));
    } catch (error) {
        console.error('Error getting departments:', error);
        return [
            { code: 'CSE', name: 'Computer Science', value: 'CSE' },
            { code: 'ECE', name: 'Electronics', value: 'ECE' },
            { code: 'ME', name: 'Mechanical', value: 'ME' },
            { code: 'CE', name: 'Civil', value: 'CE' }
        ];
    }
}

// Classroom Management
const classroomSchema = new mongoose.Schema({
    roomNumber: { type: String, required: true, unique: true },
    building: { type: String, required: true },
    capacity: { type: Number, required: true },
    wifiBSSID: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const Classroom = mongoose.model('Classroom', classroomSchema);

// Holiday Schema
const holidaySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['holiday', 'exam', 'event'], default: 'holiday' },
    description: String,
    color: { type: String, default: '#ff6b6b' },
    createdAt: { type: Date, default: Date.now }
});

const Holiday = mongoose.model('Holiday', holidaySchema);

// Random Ring Schema
const randomRingSchema = new mongoose.Schema({
    teacherId: { type: String, required: true },
    teacherName: String,
    semester: String,
    branch: String,
    subject: String,
    room: String,
    bssid: String,
    type: { type: String, enum: ['all', 'select'], required: true },
    count: Number,
    triggerTime: { type: Date, default: Date.now }, // When Random Ring was triggered
    selectedStudents: [{
        studentId: String,
        name: String,
        enrollmentNo: String,
        notificationSent: Boolean,
        notificationTime: Date,
        verified: Boolean,
        verificationTime: Date,
        verificationPhoto: String,
        teacherAccepted: Boolean, // Teacher manually accepted
        teacherRejected: Boolean, // Teacher rejected
        teacherActionTime: Date,
        reVerified: Boolean, // Re-verified after rejection
        reVerifyTime: Date,
        failed: Boolean // Failed to verify within 5 minutes
    }],
    status: { type: String, enum: ['pending', 'completed', 'expired'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});

const RandomRing = mongoose.model('RandomRing', randomRingSchema);

// AttendanceHistory Schema - Detailed per-period, per-day, per-subject tracking
const attendanceHistorySchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentManagement', required: true },
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    semester: String,
    branch: String,

    // Per-period attendance
    periods: [{
        subject: String,
        room: String,
        teacher: String,
        startTime: String,
        endTime: String,
        attendedSeconds: Number,
        totalSeconds: Number,
        attendedMinutes: Number,
        totalMinutes: Number,
        percentage: Number,
        present: Boolean, // true if >= 75%
        verifiedFace: Boolean,
        randomRingTriggered: Boolean,
        randomRingPassed: Boolean,
        offlineTime: Number, // seconds attended offline
        timestamp: { type: Date, default: Date.now }
    }],

    // Daily summary
    totalAttendedSeconds: { type: Number, default: 0 },
    totalClassSeconds: { type: Number, default: 0 },
    totalAttendedMinutes: { type: Number, default: 0 },
    totalClassMinutes: { type: Number, default: 0 },
    dayPercentage: { type: Number, default: 0 },
    dayPresent: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Index for fast queries
attendanceHistorySchema.index({ studentId: 1, date: -1 });
attendanceHistorySchema.index({ enrollmentNo: 1, date: -1 });
attendanceHistorySchema.index({ date: -1 });

const AttendanceHistory = mongoose.model('AttendanceHistory', attendanceHistorySchema);

// Attendance History APIs

// Get attendance history for a student
app.get('/api/attendance/history/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { startDate, endDate } = req.query;

        console.log(`📊 Fetching attendance history for ${enrollmentNo}`);

        if (!enrollmentNo) {
            return res.status(400).json({ success: false, error: 'Enrollment number required' });
        }

        // Build date filter
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        if (mongoose.connection.readyState === 1) {
            // Get student info
            const student = await StudentManagement.findOne({ enrollmentNo });
            if (!student) {
                return res.json({ success: false, error: 'Student not found' });
            }

            // Get attendance records using enrollmentNo field
            const records = await AttendanceRecord.find({
                $or: [
                    { studentId: enrollmentNo },
                    { enrollmentNo: enrollmentNo }
                ],
                ...dateFilter
            }).sort({ date: -1 }).lean();

            res.json({
                success: true,
                records,
                student: {
                    enrollmentNo: student.enrollmentNo,
                    name: student.name,
                    course: student.course,
                    semester: student.semester
                }
            });
        } else {
            // Memory fallback
            const records = attendanceRecordsMemory.filter(r => {
                const matchesStudent = r.enrollmentNo === enrollmentNo || r.studentId === enrollmentNo;
                if (!matchesStudent) return false;

                if (startDate && endDate) {
                    const recordDate = new Date(r.date);
                    return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
                }
                return true;
            }).sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json({
                success: true,
                records,
                student: {
                    enrollmentNo,
                    name: 'Unknown',
                    course: 'Unknown',
                    semester: 'Unknown'
                }
            });
        }
    } catch (error) {
        console.error('❌ Error fetching attendance history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save/Update attendance for a period
app.post('/api/attendance/history/period', async (req, res) => {
    try {
        const {
            studentId,
            enrollmentNo,
            studentName,
            date,
            semester,
            branch,
            period
        } = req.body;

        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, message: 'Database not connected' });
        }

        const dateObj = new Date(date);
        dateObj.setHours(0, 0, 0, 0);

        // Find or create attendance record for the day
        let attendance = await AttendanceHistory.findOne({
            $or: [
                { studentId: studentId },
                { enrollmentNo: enrollmentNo }
            ],
            date: dateObj
        });

        if (!attendance) {
            attendance = new AttendanceHistory({
                studentId,
                enrollmentNo,
                studentName,
                date: dateObj,
                semester,
                branch,
                periods: []
            });
        }

        // Check if period already exists
        const existingPeriodIndex = attendance.periods.findIndex(p =>
            p.subject === period.subject &&
            p.startTime === period.startTime
        );

        if (existingPeriodIndex >= 0) {
            // Update existing period
            attendance.periods[existingPeriodIndex] = {
                ...attendance.periods[existingPeriodIndex].toObject(),
                ...period,
                timestamp: new Date()
            };
        } else {
            // Add new period
            attendance.periods.push({
                ...period,
                timestamp: new Date()
            });
        }

        // Recalculate daily totals
        attendance.totalAttendedSeconds = attendance.periods.reduce((sum, p) => sum + (p.attendedSeconds || 0), 0);
        attendance.totalClassSeconds = attendance.periods.reduce((sum, p) => sum + (p.totalSeconds || 0), 0);
        attendance.totalAttendedMinutes = Math.floor(attendance.totalAttendedSeconds / 60);
        attendance.totalClassMinutes = Math.floor(attendance.totalClassSeconds / 60);
        attendance.dayPercentage = attendance.totalClassSeconds > 0
            ? Math.round((attendance.totalAttendedSeconds / attendance.totalClassSeconds) * 100)
            : 0;
        attendance.dayPresent = attendance.dayPercentage >= 75;
        attendance.updatedAt = new Date();

        await attendance.save();

        res.json({ success: true, attendance });

    } catch (error) {
        console.error('❌ Error saving period attendance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get date range of available attendance data
app.get('/api/attendance/date-range', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const records = await AttendanceRecord.find().sort({ date: 1 }).lean();

            if (records.length === 0) {
                return res.json({
                    success: true,
                    dateRange: {
                        earliest: null,
                        latest: null,
                        totalRecords: 0
                    }
                });
            }

            res.json({
                success: true,
                dateRange: {
                    earliest: records[0].date,
                    latest: records[records.length - 1].date,
                    totalRecords: records.length
                }
            });
        } else {
            // Memory fallback
            if (attendanceRecordsMemory.length === 0) {
                return res.json({
                    success: true,
                    dateRange: {
                        earliest: null,
                        latest: null,
                        totalRecords: 0
                    }
                });
            }

            const sorted = [...attendanceRecordsMemory].sort((a, b) => new Date(a.date) - new Date(b.date));
            res.json({
                success: true,
                dateRange: {
                    earliest: sorted[0].date,
                    latest: sorted[sorted.length - 1].date,
                    totalRecords: sorted.length
                }
            });
        }
    } catch (error) {
        console.error('❌ Error fetching date range:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get attendance summary for a student
app.get('/api/attendance/summary/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { startDate, endDate } = req.query;

        console.log(`📊 Fetching attendance summary for ${enrollmentNo}`);

        if (!enrollmentNo) {
            return res.status(400).json({ success: false, error: 'Enrollment number required' });
        }

        // Build date filter
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        if (mongoose.connection.readyState === 1) {
            // Get student info
            const student = await StudentManagement.findOne({ enrollmentNo });
            if (!student) {
                return res.json({
                    success: true,
                    summary: {
                        totalDays: 0,
                        presentDays: 0,
                        totalAttendedMinutes: 0,
                        totalClassMinutes: 0,
                        overallPercentage: 0,
                        subjects: []
                    }
                });
            }

            // Get attendance records - use enrollmentNumber field (note: different from enrollmentNo)
            const records = await AttendanceRecord.find({
                $or: [
                    { studentId: enrollmentNo },
                    { enrollmentNo: enrollmentNo }
                ],
                ...dateFilter
            }).lean();

            console.log(`   Found ${records.length} attendance records`);

            // Calculate summary
            const uniqueDates = [...new Set(records.map(r => new Date(r.date).toDateString()))];
            const presentRecords = records.filter(r => r.status === 'present');

            // Use totalAttended/totalClassTime if available, otherwise calculate from lectures
            let totalAttendedMinutes = records.reduce((sum, r) => sum + (r.totalAttended || 0), 0);
            let totalClassMinutes = records.reduce((sum, r) => sum + (r.totalClassTime || 0), 0);

            // If totalAttended/totalClassTime are 0, calculate from lectures (assuming 50 min per lecture)
            if (totalAttendedMinutes === 0 && totalClassMinutes === 0) {
                const totalLecturesAttended = records.reduce((sum, r) => sum + (r.lecturesAttended || 0), 0);
                const totalLecturesTotal = records.reduce((sum, r) => sum + (r.totalLectures || 0), 0);
                totalAttendedMinutes = totalLecturesAttended * 50; // 50 minutes per lecture
                totalClassMinutes = totalLecturesTotal * 50;
            }

            const overallPercentage = totalClassMinutes > 0
                ? Math.round((totalAttendedMinutes / totalClassMinutes) * 100)
                : 0;

            res.json({
                success: true,
                summary: {
                    totalDays: uniqueDates.length,
                    presentDays: presentRecords.length,
                    totalAttendedMinutes,
                    totalClassMinutes,
                    overallPercentage,
                    subjects: []
                }
            });
        } else {
            // Memory fallback
            const records = attendanceRecordsMemory.filter(r => {
                const matchesStudent = r.enrollmentNo === enrollmentNo || r.studentId === enrollmentNo;
                if (!matchesStudent) return false;

                if (startDate && endDate) {
                    const recordDate = new Date(r.date);
                    return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
                }
                return true;
            });

            const uniqueDates = [...new Set(records.map(r => new Date(r.date).toDateString()))];
            const presentRecords = records.filter(r => r.status === 'present');

            // Use totalAttended/totalClassTime if available, otherwise calculate from lectures
            let totalAttendedMinutes = records.reduce((sum, r) => sum + (r.totalAttended || 0), 0);
            let totalClassMinutes = records.reduce((sum, r) => sum + (r.totalClassTime || 0), 0);

            // If totalAttended/totalClassTime are 0, calculate from lectures (assuming 50 min per lecture)
            if (totalAttendedMinutes === 0 && totalClassMinutes === 0) {
                const totalLecturesAttended = records.reduce((sum, r) => sum + (r.lecturesAttended || 0), 0);
                const totalLecturesTotal = records.reduce((sum, r) => sum + (r.totalLectures || 0), 0);
                totalAttendedMinutes = totalLecturesAttended * 50; // 50 minutes per lecture
                totalClassMinutes = totalLecturesTotal * 50;
            }

            const overallPercentage = totalClassMinutes > 0
                ? Math.round((totalAttendedMinutes / totalClassMinutes) * 100)
                : 0;

            res.json({
                success: true,
                summary: {
                    totalDays: uniqueDates.length,
                    presentDays: presentRecords.length,
                    totalAttendedMinutes,
                    totalClassMinutes,
                    overallPercentage,
                    subjects: []
                }
            });
        }
    } catch (error) {
        console.error('❌ Error fetching attendance summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Holiday APIs
app.get('/api/holidays', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const holidays = await Holiday.find().sort({ date: 1 });
            res.json({ success: true, holidays });
        } else {
            res.json({ success: true, holidays: [] });
        }
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/holidays', async (req, res) => {
    try {
        const { date, name, type, description, color } = req.body;

        if (mongoose.connection.readyState === 1) {
            const holiday = new Holiday({ date, name, type, description, color });
            await holiday.save();
            res.json({ success: true, holiday });
        } else {
            res.json({ success: true, holiday: req.body });
        }
    } catch (error) {
        console.error('Error adding holiday:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/holidays/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { date, name, type, description, color } = req.body;

        if (mongoose.connection.readyState === 1) {
            const holiday = await Holiday.findByIdAndUpdate(
                id,
                { date, name, type, description, color },
                { new: true }
            );
            res.json({ success: true, holiday });
        } else {
            res.json({ success: true, holiday: req.body });
        }
    } catch (error) {
        console.error('Error updating holiday:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/holidays/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (mongoose.connection.readyState === 1) {
            await Holiday.findByIdAndDelete(id);
            res.json({ success: true });
        } else {
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting holiday:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get holidays for a specific date range
app.get('/api/holidays/range', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (mongoose.connection.readyState === 1) {
            const holidays = await Holiday.find({
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            }).sort({ date: 1 });
            res.json({ success: true, holidays });
        } else {
            res.json({ success: true, holidays: [] });
        }
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/classrooms', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const classrooms = await Classroom.find();
            res.json({ success: true, classrooms });
        } else {
            res.json({ success: true, classrooms: classroomsMemory });
        }
    } catch (error) {
        console.error('Error fetching classrooms:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/classrooms', async (req, res) => {
    try {
        console.log('Received classroom data:', req.body);
        if (mongoose.connection.readyState === 1) {
            const classroom = new Classroom(req.body);
            await classroom.save();
            res.json({ success: true, classroom });
        } else {
            const classroom = {
                _id: 'classroom_' + Date.now(),
                ...req.body,
                createdAt: new Date()
            };
            classroomsMemory.push(classroom);
            res.json({ success: true, classroom });
        }
    } catch (error) {
        console.error('Error saving classroom:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/classrooms/:id', async (req, res) => {
    try {
        console.log('Updating classroom:', req.params.id, req.body);
        if (mongoose.connection.readyState === 1) {
            const classroom = await Classroom.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            res.json({ success: true, classroom });
        } else {
            const index = classroomsMemory.findIndex(c => c._id === req.params.id);
            if (index !== -1) {
                classroomsMemory[index] = {
                    ...classroomsMemory[index],
                    ...req.body
                };
                res.json({ success: true, classroom: classroomsMemory[index] });
            } else {
                res.status(404).json({ success: false, error: 'Classroom not found' });
            }
        }
    } catch (error) {
        console.error('Error updating classroom:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/classrooms/:id', async (req, res) => {
    try {
        console.log('Deleting classroom:', req.params.id);
        if (mongoose.connection.readyState === 1) {
            await Classroom.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } else {
            const index = classroomsMemory.findIndex(c => c._id === req.params.id);
            if (index !== -1) {
                classroomsMemory.splice(index, 1);
            }
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting classroom:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== START SERVER ====================
// Random Ring - Send notifications to selected students
app.post('/api/random-ring', async (req, res) => {
    try {
        const { type, count, teacherId, teacherName, semester, branch, subject, room, bssid } = req.body;

        console.log('🔔 Random Ring initiated:', { type, count, teacherId, semester, branch });

        if (!teacherId) {
            return res.status(400).json({
                success: false,
                error: 'Teacher ID required'
            });
        }

        // Get students for the class
        let students = [];
        if (mongoose.connection.readyState === 1) {
            const query = {};
            if (semester) query.semester = semester;
            if (branch) query.course = branch;

            students = await StudentManagement.find(query);
        } else {
            students = studentManagementMemory;
        }

        // Filter students who are currently attending (connected to WiFi)
        const attendingStudents = students.filter(s =>
            s.status === 'attending' || s.status === 'active' || s.isRunning
        );

        console.log(`📊 Found ${attendingStudents.length} attending students out of ${students.length} total`);

        if (attendingStudents.length === 0) {
            return res.json({
                success: true,
                message: 'No students currently attending',
                selectedStudents: []
            });
        }

        // Select students based on type
        let selectedStudents = [];
        if (type === 'all') {
            selectedStudents = attendingStudents;
        } else if (type === 'select' && count) {
            // Randomly select N students
            const shuffled = [...attendingStudents].sort(() => 0.5 - Math.random());
            selectedStudents = shuffled.slice(0, Math.min(count, attendingStudents.length));
        }

        console.log(`✅ Selected ${selectedStudents.length} students for random ring`);

        // Create random ring record in database
        let randomRingId = null;
        const randomRingTimestamp = new Date();

        if (mongoose.connection.readyState === 1) {
            const randomRing = new RandomRing({
                teacherId,
                teacherName: teacherName || 'Teacher',
                semester,
                branch,
                subject,
                room,
                bssid,
                type,
                count: type === 'select' ? count : selectedStudents.length,
                selectedStudents: selectedStudents.map(s => ({
                    studentId: s._id ? s._id.toString() : s.enrollmentNo,
                    name: s.name,
                    enrollmentNo: s.enrollmentNo,
                    notificationSent: true,
                    notificationTime: randomRingTimestamp,
                    verified: false
                })),
                status: 'pending',
                createdAt: randomRingTimestamp
            });

            await randomRing.save();
            randomRingId = randomRing._id.toString();
            console.log(`💾 Random ring record created: ${randomRingId}`);
        }

        // CRITICAL: SAVE CURRENT TIMER VALUE BEFORE PAUSING
        // This is the cutoff point - if student fails verification, timer counts only until here
        if (mongoose.connection.readyState === 1) {
            for (const student of selectedStudents) {
                // Calculate current attended time
                const session = student.attendanceSession;
                let currentAttendedSeconds = 0;

                if (session && session.sessionStartTime) {
                    const sessionStart = new Date(session.sessionStartTime).getTime();
                    const sessionDuration = Math.floor((randomRingTimestamp.getTime() - sessionStart) / 1000);
                    const pausedDuration = session.pausedDuration || 0;
                    currentAttendedSeconds = Math.max(0, sessionDuration - pausedDuration);
                }

                console.log(`📊 Student ${student.name}: Attended ${currentAttendedSeconds}s before random ring`);

                // Update student with random ring data
                await StudentManagement.findByIdAndUpdate(student._id, {
                    'attendanceSession.isPaused': true,
                    'attendanceSession.pauseReason': 'random_ring',
                    'attendanceSession.lastPauseTime': randomRingTimestamp,
                    'attendanceSession.randomRingId': randomRingId,
                    'attendanceSession.randomRingTime': randomRingTimestamp,
                    'attendanceSession.timeBeforeRandomRing': currentAttendedSeconds, // CRITICAL: Save cutoff time
                    'attendanceSession.randomRingPassed': null // Reset verification status
                });
            }
            console.log(`⏸️  Paused timer for ${selectedStudents.length} students with cutoff timestamps saved`);
        }

        // Send notifications via Socket.IO
        selectedStudents.forEach(student => {
            io.emit('random_ring_notification', {
                randomRingId: randomRingId,
                studentId: student._id || student.enrollmentNo,
                enrollmentNo: student.enrollmentNo,
                studentName: student.name,
                message: 'Timer Paused - Verify your presence to resume!',
                teacherId: teacherId,
                teacherName: teacherName,
                bssid: bssid,
                timestamp: Date.now(),
                timerPaused: true // Flag to indicate timer is paused
            });
        });

        res.json({
            success: true,
            message: `Random ring sent to ${selectedStudents.length} students`,
            randomRingId: randomRingId,
            selectedStudents: selectedStudents.map(s => ({
                id: s._id || s.enrollmentNo,
                name: s.name,
                enrollmentNo: s.enrollmentNo
            }))
        });

    } catch (error) {
        console.error('❌ Error in random ring:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Student verifies random ring
app.post('/api/random-ring/verify', async (req, res) => {
    try {
        const { randomRingId, studentId, verificationPhoto, bssid } = req.body;

        console.log('🔔 Random Ring verification:', { randomRingId, studentId });

        if (!randomRingId || !studentId) {
            return res.status(400).json({
                success: false,
                error: 'Random Ring ID and Student ID required'
            });
        }

        // Find the random ring record
        let randomRing = null;
        if (mongoose.connection.readyState === 1) {
            randomRing = await RandomRing.findById(randomRingId);

            if (!randomRing) {
                return res.status(404).json({
                    success: false,
                    error: 'Random ring not found'
                });
            }

            // Update student verification status
            const studentIndex = randomRing.selectedStudents.findIndex(
                s => s.studentId === studentId || s.enrollmentNo === studentId
            );

            if (studentIndex === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Student not found in this random ring'
                });
            }

            randomRing.selectedStudents[studentIndex].verified = true;
            randomRing.selectedStudents[studentIndex].verificationTime = new Date();
            randomRing.selectedStudents[studentIndex].verificationPhoto = verificationPhoto;

            // Check if all students have verified
            const allVerified = randomRing.selectedStudents.every(s => s.verified);
            if (allVerified) {
                randomRing.status = 'completed';
            }

            await randomRing.save();
            console.log(`✅ Student ${studentId} verified for random ring ${randomRingId}`);
        }

        res.json({
            success: true,
            message: 'Verification successful'
        });

    } catch (error) {
        console.error('❌ Error in random ring verification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Student verifies face after teacher rejection
app.post('/api/random-ring/verify-after-rejection', async (req, res) => {
    try {
        const { randomRingId, studentId, verificationPhoto, bssid } = req.body;

        console.log('🔔 Random Ring face verification after rejection:', { randomRingId, studentId });

        if (!randomRingId || !studentId) {
            return res.status(400).json({
                success: false,
                error: 'Random Ring ID and Student ID required'
            });
        }

        // Find the random ring record
        let randomRing = null;
        if (mongoose.connection.readyState === 1) {
            randomRing = await RandomRing.findById(randomRingId);

            if (!randomRing) {
                return res.status(404).json({
                    success: false,
                    error: 'Random ring not found'
                });
            }

            // Find student in selected students
            const studentIndex = randomRing.selectedStudents.findIndex(s => {
                if (s.studentId === studentId) return true;
                if (s.enrollmentNo === studentId) return true;
                if (s.studentId?.toString() === studentId?.toString()) return true;
                if (s.enrollmentNo?.toString() === studentId?.toString()) return true;
                return false;
            });

            if (studentIndex === -1) {
                return res.status(404).json({
                    success: false,
                    error: 'Student not found in this random ring'
                });
            }

            // Check if teacher already rejected this student
            if (randomRing.selectedStudents[studentIndex].teacherAction !== 'rejected') {
                return res.status(400).json({
                    success: false,
                    error: 'Face verification only allowed after teacher rejection'
                });
            }

            const now = new Date();

            // Mark as face verified after rejection
            randomRing.selectedStudents[studentIndex].faceVerifiedAfterRejection = true;
            randomRing.selectedStudents[studentIndex].faceVerificationTime = now;
            randomRing.selectedStudents[studentIndex].verificationPhoto = verificationPhoto;

            await randomRing.save();
            console.log(`✅ Student ${studentId} face verified after rejection for random ring ${randomRingId}`);

            // CRITICAL: Resume student timer - FULL TIME COUNTED (face verification successful)
            const student = await StudentManagement.findOne({
                $or: [{ _id: studentId }, { enrollmentNo: studentId }]
            });

            if (student && student.attendanceSession?.isPaused) {
                const pausedDuration = student.attendanceSession.pausedDuration || 0;
                const lastPauseTime = student.attendanceSession.lastPauseTime;
                const additionalPausedTime = lastPauseTime
                    ? Math.floor((Date.now() - lastPauseTime.getTime()) / 1000)
                    : 0;

                await StudentManagement.findByIdAndUpdate(student._id, {
                    'attendanceSession.isPaused': false,
                    'attendanceSession.pauseReason': null,
                    'attendanceSession.pausedDuration': pausedDuration + additionalPausedTime,
                    'attendanceSession.lastPauseTime': null,
                    'attendanceSession.randomRingPassed': true, // PASSED - full time counted
                    isRunning: true,
                    status: 'attending',
                    lastUpdated: new Date()
                });

                console.log(`▶️ Timer resumed for ${student.name} - Face verified after rejection - FULL TIME COUNTED`);

                // Notify teacher about face verification
                io.emit('random_ring_face_verified_after_rejection', {
                    randomRingId: randomRingId,
                    studentId: student._id.toString(),
                    enrollmentNo: student.enrollmentNo,
                    studentName: student.name,
                    teacherId: randomRing.teacherId,
                    message: `${student.name} verified face after rejection`
                });

                // Notify student
                io.emit('random_ring_face_verification_success', {
                    studentId: student._id.toString(),
                    enrollmentNo: student.enrollmentNo,
                    message: 'Face verification successful. Timer resumed with full time counted.',
                    randomRingId: randomRingId
                });
            }
        }

        const responseTime = (Date.now() - new Date(req.body.timestamp || Date.now())) / 1000;

        res.json({
            success: true,
            message: 'Face verification after rejection successful - Full time counted',
            responseTime: responseTime,
            fullTimeCounted: true
        });

    } catch (error) {
        console.error('❌ Error in random ring face verification after rejection:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Random Ring History
app.get('/api/random-ring/history/:teacherId', async (req, res) => {
    try {
        const { teacherId } = req.params;

        if (mongoose.connection.readyState === 1) {
            const history = await RandomRing.find({ teacherId })
                .sort({ createdAt: -1 })
                .limit(50);

            res.json({
                success: true,
                history: history
            });
        } else {
            res.json({
                success: true,
                history: []
            });
        }

    } catch (error) {
        console.error('❌ Error fetching random ring history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Teacher manually accepts/rejects student presence
app.post('/api/random-ring/teacher-action', async (req, res) => {
    try {
        const { randomRingId, studentId, action, reason } = req.body;

        console.log(`👨‍🏫 Teacher ${action} student ${studentId} in random ring ${randomRingId}`);

        if (!['accepted', 'rejected'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action. Must be "accepted" or "rejected"'
            });
        }

        if (mongoose.connection.readyState === 1) {
            const randomRing = await RandomRing.findById(randomRingId);

            if (!randomRing) {
                return res.status(404).json({
                    success: false,
                    error: 'Random ring not found'
                });
            }

            // Find student in selected students
            const studentIndex = randomRing.selectedStudents.findIndex(s => {
                if (s.studentId === studentId) return true;
                if (s.enrollmentNo === studentId) return true;
                if (s.studentId?.toString() === studentId?.toString()) return true;
                if (s.enrollmentNo?.toString() === studentId?.toString()) return true;
                return false;
            });

            if (studentIndex === -1) {
                console.error(`❌ Student not found in random ring`);
                return res.status(404).json({
                    success: false,
                    error: 'Student not found in this random ring'
                });
            }

            const now = new Date();

            // Update teacher action
            randomRing.selectedStudents[studentIndex].teacherAction = action;
            randomRing.selectedStudents[studentIndex].teacherActionTime = now;
            randomRing.selectedStudents[studentIndex].teacherActionReason = reason || '';

            if (action === 'accepted') {
                // Mark as verified and resume timer
                randomRing.selectedStudents[studentIndex].verified = true;
                randomRing.selectedStudents[studentIndex].verificationTime = now;

                // Resume student timer - FULL TIME COUNTED
                const student = await StudentManagement.findOne({
                    $or: [{ _id: studentId }, { enrollmentNo: studentId }]
                });

                if (student && student.attendanceSession?.isPaused) {
                    const pausedDuration = student.attendanceSession.pausedDuration || 0;
                    const lastPauseTime = student.attendanceSession.lastPauseTime;
                    const additionalPausedTime = lastPauseTime
                        ? Math.floor((Date.now() - lastPauseTime.getTime()) / 1000)
                        : 0;

                    await StudentManagement.findByIdAndUpdate(student._id, {
                        'attendanceSession.isPaused': false,
                        'attendanceSession.pauseReason': null,
                        'attendanceSession.pausedDuration': pausedDuration + additionalPausedTime,
                        'attendanceSession.lastPauseTime': null,
                        'attendanceSession.randomRingPassed': true, // Mark as passed
                        isRunning: true,
                        status: 'attending',
                        lastUpdated: new Date()
                    });

                    console.log(`▶️  Timer resumed for ${student.name} - Teacher accepted - FULL TIME COUNTED`);

                    io.emit('random_ring_teacher_accepted', {
                        studentId: student._id.toString(),
                        enrollmentNo: student.enrollmentNo,
                        message: 'Teacher verified your presence. Timer resumed.',
                        randomRingId: randomRingId
                    });
                }
            } else if (action === 'rejected') {
                // CRITICAL: Mark random ring as FAILED
                // Timer will be cut off at random ring time
                const student = await StudentManagement.findOne({
                    $or: [{ _id: studentId }, { enrollmentNo: studentId }]
                });

                if (student) {
                    // Mark random ring as failed - timer cutoff applied
                    await StudentManagement.findByIdAndUpdate(student._id, {
                        'attendanceSession.randomRingPassed': false, // FAILED - timer cutoff at random ring time
                        'attendanceSession.isPaused': true, // Keep paused
                        'attendanceSession.pauseReason': 'random_ring_failed'
                    });

                    console.log(`❌ Random ring FAILED for ${student.name} - Timer cutoff at ${student.attendanceSession.randomRingTime}`);

                    io.emit('random_ring_teacher_rejected', {
                        studentId: student._id.toString(),
                        enrollmentNo: student.enrollmentNo,
                        message: 'Teacher marked you absent. Verify your face within 5 minutes to resume timer.',
                        randomRingId: randomRingId,
                        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
                        timerCutoff: true // Indicate timer is cut off
                    });
                }
            }

            await randomRing.save();

            // Notify all teachers about the action
            io.emit('random_ring_teacher_action_update', {
                randomRingId: randomRingId,
                studentId: studentId,
                action: action,
                teacherActionTime: now
            });

            res.json({
                success: true,
                message: `Student ${action}`,
                action: action
            });
        } else {
            res.json({ success: true, message: 'Action recorded (in-memory)' });
        }

    } catch (error) {
        console.error('❌ Error in teacher action:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Startup validation
function validateEnvironment() {
    const required = ['MONGODB_URI'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        return false;
    }

    console.log('✅ Environment validation passed');
    return true;
}

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

    try {
        // Stop accepting new connections
        server.close(() => {
            console.log('✅ HTTP server closed');
        });

        // Close all socket connections
        console.log(`🔌 Closing ${activeConnections.size} active socket connections...`);
        activeConnections.forEach((connection, socketId) => {
            connection.timers.forEach(timer => clearInterval(timer));
        });
        io.close(() => {
            console.log('✅ Socket.IO server closed');
        });

        // Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');
        }

        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// All routes must be registered before starting the server
const PORT = process.env.PORT || 3000;

// Validate environment before starting
if (!validateEnvironment()) {
    console.error('❌ Server startup aborted due to configuration errors');
    process.exit(1);
}

server.listen(PORT, '0.0.0.0', async () => {
    console.log('========================================');
    console.log('🚀 Attendance SDUI Server Running v2.6 - Teachers & Subjects Updated');
    console.log('========================================');
    console.log(`📡 HTTP Server: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📊 Config API: http://localhost:${PORT}/api/config`);
    console.log(`👥 Students API: http://localhost:${PORT}/api/students`);
    console.log(`🔍 Face Verify: http://localhost:${PORT}/api/verify-face`);
    console.log(`⏰ Time Sync: http://localhost:${PORT}/api/time`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? 'MongoDB Atlas ✅' : 'In-Memory ⚠️'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');

    // Display server IP addresses
    console.log('🌐 Server Network Information:');
    const localIPs = getServerIPs();
    if (localIPs.length > 0) {
        localIPs.forEach(({ interface: iface, ip }) => {
            console.log(`   📍 ${iface}: ${ip}`);
        });
    } else {
        console.log('   📍 No external network interfaces found');
    }

    // Get public IP (for Render/cloud deployments)
    try {
        const response = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
        console.log(`   🌍 Public IP: ${response.data.ip}`);
        console.log('   ℹ️  Add this IP to MongoDB Atlas whitelist!');
    } catch (error) {
        console.log('   ⚠️  Could not fetch public IP (this is normal for local development)');
    }

    console.log('========================================');
});
// Bulk update subjects
app.put('/api/subjects/bulk-update', async (req, res) => {
    try {
        console.log('📝 Bulk update request received:', req.body);
        const { subjectCodes, updates } = req.body;

        if (!subjectCodes || !Array.isArray(subjectCodes) || subjectCodes.length === 0) {
            return res.status(400).json({ success: false, error: 'No subject codes provided' });
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No updates provided' });
        }

        console.log(`📋 Updating ${subjectCodes.length} subjects with:`, updates);

        // Add updatedAt timestamp
        updates.updatedAt = new Date();

        // Perform bulk update
        const result = await Subject.updateMany(
            { subjectCode: { $in: subjectCodes } },
            { $set: updates }
        );

        console.log('✅ Bulk update result:', result);

        res.json({
            success: true,
            updatedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            message: `Successfully updated ${result.modifiedCount} subjects`
        });

    } catch (error) {
        console.error('❌ Error in bulk update:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// ===== ATTENDANCE MANAGEMENT API ENDPOINTS =====

// Get attendance records with management features
app.get('/api/attendance/manage', async (req, res) => {
    try {
        const { semester, branch, startDate, endDate, studentId } = req.query;

        console.log('📊 Fetching attendance records for management:', { semester, branch, startDate, endDate, studentId });

        // Build query
        let query = {};
        if (semester) query.semester = semester;
        if (branch) query.branch = branch;
        if (studentId) query.studentId = studentId;

        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        // Fetch records with student details
        const records = await AttendanceRecord.find(query)
            .populate('studentId', 'name enrollmentNo course semester photoUrl')
            .sort({ date: -1, createdAt: -1 })
            .limit(1000); // Limit for performance

        // Calculate summary statistics
        const summary = {
            totalRecords: records.length,
            presentCount: records.filter(r => r.status === 'present').length,
            absentCount: records.filter(r => r.status === 'absent').length,
            averageAttendance: 0
        };

        if (records.length > 0) {
            summary.averageAttendance = Math.round((summary.presentCount / records.length) * 100);
        }

        res.json({
            success: true,
            records: records,
            summary: summary
        });

    } catch (error) {
        console.error('❌ Error fetching attendance records:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new attendance record
app.post('/api/attendance/manage', async (req, res) => {
    try {
        const { studentId, date, status, subject, hoursAttended, notes } = req.body;

        console.log('➕ Adding new attendance record:', { studentId, date, status, subject });

        // Validate required fields
        if (!studentId || !date || !status) {
            return res.status(400).json({
                success: false,
                error: 'Student ID, date, and status are required'
            });
        }

        // Check if record already exists for this student and date
        const existing = await AttendanceRecord.findOne({
            studentId: studentId,
            date: new Date(date)
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Attendance record already exists for this student and date'
            });
        }

        // Get student details
        const student = await StudentManagement.findById(studentId);
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        // Create new attendance record
        const attendanceRecord = new AttendanceRecord({
            studentId: studentId,
            studentName: student.name,
            enrollmentNo: student.enrollmentNo,
            date: new Date(date),
            status: status,
            subject: subject,
            hoursAttended: hoursAttended || 0,
            notes: notes,
            semester: student.semester,
            branch: student.course,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await attendanceRecord.save();

        console.log('✅ Attendance record created:', attendanceRecord._id);

        res.json({
            success: true,
            record: attendanceRecord,
            message: 'Attendance record added successfully'
        });

    } catch (error) {
        console.error('❌ Error adding attendance record:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update attendance record
app.put('/api/attendance/manage/:recordId', async (req, res) => {
    try {
        const { recordId } = req.params;
        const { date, status, hoursAttended, notes } = req.body;

        console.log('✏️ Updating attendance record:', recordId, { date, status, hoursAttended });

        const record = await AttendanceRecord.findById(recordId);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Attendance record not found' });
        }

        // Update fields
        if (date) record.date = new Date(date);
        if (status) record.status = status;
        if (hoursAttended !== undefined) record.hoursAttended = hoursAttended;
        if (notes !== undefined) record.notes = notes;
        record.updatedAt = new Date();

        await record.save();

        console.log('✅ Attendance record updated:', recordId);

        res.json({
            success: true,
            record: record,
            message: 'Attendance record updated successfully'
        });

    } catch (error) {
        console.error('❌ Error updating attendance record:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk update attendance records
app.put('/api/attendance/manage/bulk', async (req, res) => {
    try {
        const { recordIds, updates } = req.body;

        console.log('📝 Bulk updating attendance records:', recordIds.length, 'records');
        console.log('Updates:', updates);

        if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No record IDs provided' });
        }

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No updates provided' });
        }

        // Add updatedAt timestamp
        updates.updatedAt = new Date();

        // Perform bulk update
        const result = await AttendanceRecord.updateMany(
            { _id: { $in: recordIds } },
            { $set: updates }
        );

        console.log('✅ Bulk attendance update result:', result);

        res.json({
            success: true,
            updatedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            message: `Successfully updated ${result.modifiedCount} attendance records`
        });

    } catch (error) {
        console.error('❌ Error in bulk attendance update:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete attendance record
app.delete('/api/attendance/manage/:recordId', async (req, res) => {
    try {
        const { recordId } = req.params;

        console.log('🗑️ Deleting attendance record:', recordId);

        const record = await AttendanceRecord.findByIdAndDelete(recordId);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Attendance record not found' });
        }

        console.log('✅ Attendance record deleted:', recordId);

        res.json({
            success: true,
            message: 'Attendance record deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting attendance record:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk operations
app.post('/api/attendance/manage/bulk-operation', async (req, res) => {
    try {
        const { operation, filters, data } = req.body;

        console.log('🔄 Executing bulk operation:', operation, 'with filters:', filters);

        let query = {};
        if (filters.semester) query.semester = filters.semester;
        if (filters.branch) query.branch = filters.branch;
        if (filters.date) query.date = new Date(filters.date);

        let result;

        switch (operation) {
            case 'mark_all_present':
                result = await AttendanceRecord.updateMany(query, {
                    $set: { status: 'present', updatedAt: new Date() }
                });
                break;

            case 'mark_all_absent':
                result = await AttendanceRecord.updateMany(query, {
                    $set: { status: 'absent', updatedAt: new Date() }
                });
                break;

            case 'reset_attendance':
                result = await AttendanceRecord.deleteMany(query);
                break;

            default:
                return res.status(400).json({ success: false, error: 'Invalid operation' });
        }

        console.log('✅ Bulk operation completed:', result);

        res.json({
            success: true,
            operation: operation,
            affectedCount: result.modifiedCount || result.deletedCount,
            message: `Bulk operation '${operation}' completed successfully`
        });

    } catch (error) {
        console.error('❌ Error in bulk operation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all departments for teacher filter - Updated Dec 14, 2025
app.get('/api/departments', async (req, res) => {
    try {
        // Get unique departments from teachers collection
        const departments = await Teacher.distinct('department');

        // Default departments if none exist in database
        const defaultDepartments = [
            { code: 'CSE', name: 'Computer Science' },
            { code: 'ECE', name: 'Electronics' },
            { code: 'ME', name: 'Mechanical' },
            { code: 'CE', name: 'Civil' },
            { code: 'DS', name: 'Data Science' },
            { code: 'IT', name: 'Information Technology' },
            { code: 'AI', name: 'Artificial Intelligence' }
        ];

        // If no departments in database, return defaults
        if (departments.length === 0) {
            res.json({ success: true, departments: defaultDepartments });
            return;
        }

        // Map existing departments to proper format
        const formattedDepartments = departments.map(dept => {
            const defaultDept = defaultDepartments.find(d => d.code === dept);
            return defaultDept || { code: dept, name: dept };
        });

        res.json({ success: true, departments: formattedDepartments });

    } catch (error) {
        console.error('❌ Error fetching departments:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch departments' });
    }
});

// Export attendance data for CSV download
app.get('/api/attendance/export', async (req, res) => {
    try {
        const { startDate, endDate, semester, branch, studentId } = req.query;

        // Build query filters
        const filters = {};

        if (startDate && endDate) {
            filters.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (semester) filters.semester = semester;
        if (branch) filters.branch = branch;
        if (studentId) filters.studentId = studentId;

        // Fetch attendance records with student and teacher details
        const attendanceRecords = await AttendanceHistory.aggregate([
            { $match: filters },
            {
                $lookup: {
                    from: 'students',
                    localField: 'studentId',
                    foreignField: 'enrollmentNo',
                    as: 'studentDetails'
                }
            },
            {
                $lookup: {
                    from: 'teachers',
                    localField: 'teacherId',
                    foreignField: 'employeeId',
                    as: 'teacherDetails'
                }
            },
            {
                $unwind: {
                    path: '$studentDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: '$teacherDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    date: 1,
                    dayOfWeek: { $dayOfWeek: '$date' },
                    studentId: 1,
                    studentName: '$studentDetails.name',
                    course: '$studentDetails.course',
                    semester: 1,
                    subjectCode: '$subject.code',
                    subjectName: '$subject.name',
                    periodTime: '$period.time',
                    periodNumber: '$period.number',
                    status: '$attendance.status',
                    verificationType: '$attendance.verificationType',
                    verificationTime: '$attendance.verificationTime',
                    wifiConnected: '$attendance.wifiConnected',
                    wifiBSSID: '$attendance.wifiBSSID',
                    teacherId: 1,
                    teacherName: '$teacherDetails.name',
                    classroom: '$period.classroom',
                    locationVerified: '$attendance.locationVerified',
                    faceVerificationScore: '$attendance.faceVerificationScore',
                    deviceModel: '$attendance.deviceModel',
                    appVersion: '$attendance.appVersion',
                    remarks: '$attendance.remarks'
                }
            },
            { $sort: { date: -1, periodNumber: 1 } }
        ]);

        // Convert day numbers to day names
        const dayNames = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const processedRecords = attendanceRecords.map(record => ({
            ...record,
            dayOfWeek: dayNames[record.dayOfWeek] || '',
            date: record.date ? record.date.toISOString().split('T')[0] : '',
            verificationTime: record.verificationTime ? new Date(record.verificationTime).toISOString() : ''
        }));

        res.json({
            success: true,
            attendance: processedRecords,
            totalRecords: processedRecords.length,
            dateRange: {
                startDate: startDate || 'All',
                endDate: endDate || 'All'
            },
            filters: {
                semester: semester || 'All',
                branch: branch || 'All',
                studentId: studentId || 'All'
            }
        });

    } catch (error) {
        console.error('❌ Error exporting attendance data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export attendance data',
            details: error.message
        });
    }
});

// Export all attendance data (simplified version)
app.get('/api/attendance/all', async (req, res) => {
    try {
        // Get recent attendance data (last 30 days by default)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const attendanceRecords = await AttendanceHistory.find({
            date: { $gte: thirtyDaysAgo }
        })
            .populate('studentId', 'name course semester')
            .populate('teacherId', 'name')
            .sort({ date: -1 })
            .limit(1000); // Limit to prevent memory issues

        const processedRecords = attendanceRecords.map(record => ({
            date: record.date ? record.date.toISOString().split('T')[0] : '',
            studentId: record.studentId?.enrollmentNo || record.studentId,
            studentName: record.studentId?.name || '',
            course: record.studentId?.course || '',
            semester: record.semester || '',
            subjectCode: record.subject?.code || '',
            subjectName: record.subject?.name || '',
            period: record.period?.number || '',
            status: record.attendance?.status || '',
            verificationType: record.attendance?.verificationType || '',
            wifiStatus: record.attendance?.wifiConnected ? 'Connected' : 'Disconnected',
            timestamp: record.attendance?.verificationTime || '',
            teacherId: record.teacherId?.employeeId || record.teacherId,
            teacherName: record.teacherId?.name || '',
            classroom: record.period?.classroom || '',
            latitude: record.attendance?.location?.latitude || '',
            longitude: record.attendance?.location?.longitude || '',
            deviceInfo: record.attendance?.deviceModel || ''
        }));

        res.json(processedRecords);

    } catch (error) {
        console.error('❌ Error fetching all attendance data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance data'
        });
    }
});
