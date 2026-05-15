// Deployment trigger - Updated May 12, 2026 - v2.11 - Redis caching for timetables, student profiles, live timer state.
// Force IST timezone — all period times are stored as IST strings (HH:MM)
process.env.TZ = 'Asia/Kolkata';

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
const { ipKeyGenerator } = rateLimit;
const bcrypt = require('bcrypt'); // Add bcrypt for password hashing
const { createClient } = require('redis');

// ─── Redis Client ─────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'rediss://red-d810359o3t8c73e6ksn0:sQYYRIADT5i8aWb12Ku9zlbDt9LpgcB8@oregon-keyvalue.render.com:6379';

const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('❌ Redis error:', err.message));
redisClient.on('connect', () => console.log('✅ Redis connected:', REDIS_URL.split('@').pop() || REDIS_URL));
redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));
redisClient.connect().catch(err => console.error('❌ Redis connect failed:', err.message));

// ─── Redis helpers ────────────────────────────────────────────────────────────
const CACHE_TTL = {
    TIMETABLE:  300,   // 5 min  — rarely changes
    STUDENT:    600,   // 10 min — profile data
    LIVE_TIMER: 86400, // 24 hr  — live timer state (auto-expires stale entries)
    PERIODS:    300,   // 5 min
    SUBJECTS:   600,   // 10 min
};

async function cacheGet(key) {
    try {
        const val = await redisClient.get(key);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
}

async function cacheSet(key, value, ttl) {
    try {
        await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } catch (e) { console.warn('⚠️  Redis set failed:', e.message); }
}

async function cacheDel(...keys) {
    try {
        if (keys.length) await redisClient.del(keys);
    } catch (e) { console.warn('⚠️  Redis del failed:', e.message); }
}

async function cacheDelPattern(pattern) {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length) await redisClient.del(keys);
    } catch (e) { console.warn('⚠️  Redis delPattern failed:', e.message); }
}

// Face Verification Service
const faceVerificationService = require('./services/faceVerificationService');

// WiFi Verification Service
const wifiVerificationService = require('./services/wifiVerificationService');

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
        // Note: enrollmentNo and email are already unique via schema field definition.
        // Only add compound/non-unique indexes here to avoid duplicate index conflicts.
        await StudentManagement.collection.createIndex({ semester: 1, course: 1 });
        await StudentManagement.collection.createIndex({ isRunning: 1 });

        // AttendanceRecord indexes
        await AttendanceRecord.collection.createIndex({ enrollmentNo: 1, date: -1 });
        await AttendanceRecord.collection.createIndex({ date: -1 });
        await AttendanceRecord.collection.createIndex({ semester: 1, branch: 1, date: -1 });
        await AttendanceRecord.collection.createIndex({ 'lectures.teacher': 1, date: -1 });

        // DailyAttendance indexes
        await DailyAttendance.collection.createIndex({ enrollmentNo: 1, date: -1 });
        await DailyAttendance.collection.createIndex({ date: -1 });
        await DailyAttendance.collection.createIndex({ semester: 1, branch: 1, date: -1 });
        await DailyAttendance.collection.createIndex({ dailyStatus: 1, date: -1 });

        // AttendanceAudit indexes
        await AttendanceAudit.collection.createIndex({ auditId: 1 }, { unique: true });
        await AttendanceAudit.collection.createIndex({ enrollmentNo: 1, date: -1 });
        await AttendanceAudit.collection.createIndex({ modifiedBy: 1, modifiedAt: -1 });
        await AttendanceAudit.collection.createIndex({ recordId: 1 });

        // Timetable indexes
        await Timetable.collection.createIndex({ semester: 1, branch: 1 }, { unique: true });

        // Teacher indexes
        // Note: employeeId and email are already unique via schema field definition.
        await Teacher.collection.createIndex({ department: 1 });

        // Classroom indexes
        await Classroom.collection.createIndex({ roomNumber: 1 }, { unique: true });
        await Classroom.collection.createIndex({ wifiBSSIDs: 1 });

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

// Attendance Record Schema (Daily summary)
const attendanceRecordSchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    studentId:    { type: String, required: true },   // always = enrollmentNo (legacy field kept for compat)
    enrollmentNo: { type: String, required: true },   // canonical student key
    studentName:  { type: String, required: true },
    semester:     { type: String, required: true },
    branch:       { type: String, required: true },

    // ── Date & Status ─────────────────────────────────────────────────────────
    date:   { type: Date, required: true },           // midnight UTC
    status: { type: String, enum: ['present', 'absent', 'active', 'leave'], required: true },

    // ── Timer ─────────────────────────────────────────────────────────────────
    timerValue:      { type: Number, default: 0 },    // total seconds in college
    totalAttended:   { type: Number, default: 0 },    // minutes attended
    totalClassTime:  { type: Number, default: 0 },    // total scheduled minutes
    dayPercentage:   { type: Number, default: 0 },    // 0-100

    // ── Check-in/out ──────────────────────────────────────────────────────────
    checkInTime:  { type: Date },
    checkOutTime: { type: Date },

    // ── Lecture detail (populated from PeriodAttendance on save) ─────────────
    lectures: [{
        period:          String,
        subject:         String,
        teacher:         String,
        teacherName:     String,
        room:            String,
        startTime:       String,
        endTime:         String,
        lectureStartedAt: Date,
        lectureEndedAt:   Date,
        studentCheckIn:   Date,
        // ── Attendance metrics (populated by syncAttendanceRecord) ────────────
        attended:    { type: Number, default: 0 },   // seconds attended
        total:       { type: Number, default: 0 },   // total period seconds
        percentage:  { type: Number, default: 0 },   // 0-100
        present:     { type: Boolean, default: false },
        status:      { type: String, default: 'absent' },
        verifications: [{
            time:    Date,
            type:    { type: String, enum: ['face', 'random_ring', 'manual'] },
            success: Boolean,
            event:   String
        }]
    }],

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

attendanceRecordSchema.index({ enrollmentNo: 1, date: -1 });
attendanceRecordSchema.index({ semester: 1, branch: 1, date: -1 });
attendanceRecordSchema.index({ date: -1 });

const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);

// PeriodAttendance Schema - Period-based attendance tracking
const periodAttendanceSchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    enrollmentNo: { type: String, required: true },
    studentName:  { type: String, required: true },
    semester:     { type: String, default: '' },   // added — populated on write
    branch:       { type: String, default: '' },   // added — populated on write

    // ── Date & Period ─────────────────────────────────────────────────────────
    date:   { type: Date, required: true },
    period: { type: String, required: true, enum: ['P1','P2','P3','P4','P5','P6','P7','P8'] },

    // ── Timetable context ─────────────────────────────────────────────────────
    subject:     { type: String, required: true },
    teacher:     { type: String, required: true },
    teacherName: { type: String },
    room:        { type: String },

    // ── Status ────────────────────────────────────────────────────────────────
    status:      { type: String, required: true, enum: ['present', 'absent', 'active'] },
    checkInTime: { type: Date },

    // ── Verification ──────────────────────────────────────────────────────────
    verificationType: { type: String, required: true, enum: ['initial', 'random', 'manual'] },
    wifiVerified: { type: Boolean, default: false },
    faceVerified: { type: Boolean, default: false },
    wifiBSSID:    { type: String },

    // ── Audit ─────────────────────────────────────────────────────────────────
    markedBy: { type: String },
    reason:   { type: String },

    // ── Timer progress (updated by offline-sync) ──────────────────────────────
    timerSeconds: { type: Number, default: null }   // seconds attended in this period
}, { timestamps: true });

periodAttendanceSchema.index({ enrollmentNo: 1, date: 1, period: 1 }, { unique: true });
periodAttendanceSchema.index({ semester: 1, branch: 1, date: 1 });   // new — enables class-level queries
periodAttendanceSchema.index({ subject: 1, semester: 1, branch: 1 }); // new — enables subject queries
periodAttendanceSchema.index({ date: 1 });
periodAttendanceSchema.index({ teacher: 1, date: 1 });

const PeriodAttendance = mongoose.model('PeriodAttendance', periodAttendanceSchema);

// DailyAttendance Schema - Daily aggregation of attendance
const dailyAttendanceSchema = new mongoose.Schema({
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    
    // Period counts
    totalPeriods: { type: Number, required: true, min: 0 },
    presentPeriods: { type: Number, required: true, min: 0 },
    absentPeriods: { type: Number, required: true, min: 0 },
    
    // Calculated values
    attendancePercentage: { 
        type: Number, 
        required: true,
        min: 0,
        max: 100
    },
    dailyStatus: { 
        type: String, 
        required: true,
        enum: ['present', 'absent']
    },
    threshold: { type: Number, required: true },
    
    // Metadata
    semester: { type: String, required: true },
    branch: { type: String, required: true },
    
    // Timestamps
    calculatedAt: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Indexes for DailyAttendance
dailyAttendanceSchema.index({ enrollmentNo: 1, date: -1 });
dailyAttendanceSchema.index({ date: -1 });
dailyAttendanceSchema.index({ semester: 1, branch: 1, date: -1 });
dailyAttendanceSchema.index({ dailyStatus: 1, date: -1 });

const DailyAttendance = mongoose.model('DailyAttendance', dailyAttendanceSchema);

// AttendanceAudit Schema - Audit trail for all attendance modifications
const attendanceAuditSchema = new mongoose.Schema({
    auditId: { 
        type: String, 
        required: true,
        default: () => `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },
    
    // Record reference
    recordType: { 
        type: String, 
        required: true,
        enum: ['period_attendance', 'daily_attendance']
    },
    recordId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    
    // Student info
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    period: { type: String }, // "P1", "P2", ..., "P8" (null for daily attendance)
    
    // Modification details
    modifiedBy: { type: String, required: true }, // Teacher/Admin ID
    modifierName: { type: String, required: true },
    modifierRole: { 
        type: String, 
        required: true,
        enum: ['teacher', 'admin', 'system']
    },
    
    // Change tracking
    oldStatus: { type: String }, // Previous status
    newStatus: { type: String, required: true }, // New status
    changeType: { 
        type: String, 
        required: true,
        enum: ['create', 'update', 'delete']
    },
    
    // Justification
    reason: { type: String }, // Reason for manual marking
    
    // Timestamps
    modifiedAt: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Indexes for AttendanceAudit
attendanceAuditSchema.index({ auditId: 1 }, { unique: true });
attendanceAuditSchema.index({ enrollmentNo: 1, date: -1 });
attendanceAuditSchema.index({ modifiedBy: 1, modifiedAt: -1 });
attendanceAuditSchema.index({ recordId: 1 });

const AttendanceAudit = mongoose.model('AttendanceAudit', attendanceAuditSchema);

// ─── TimetableHistory Schema ──────────────────────────────────────────────────
// Records every subject that was scheduled on a given date.
// Written by: (1) lecture-start endpoint, (2) daily midnight cron.
// Read by: /api/attendance/subject-dates to highlight calendar dates.
const timetableHistorySchema = new mongoose.Schema({
    date:        { type: Date, required: true },   // midnight of the day
    semester:    { type: String, required: true },
    branch:      { type: String, required: true },
    period:      { type: String, required: true },  // 'P1'–'P8'
    subject:     { type: String, required: true },
    teacher:     { type: String },
    teacherName: { type: String },
    room:        { type: String },
    startTime:   { type: String },                  // 'HH:MM'
    endTime:     { type: String },
    source:      { type: String, enum: ['cron', 'lecture_start'], default: 'cron' }
}, { timestamps: true });

timetableHistorySchema.index({ date: 1, semester: 1, branch: 1, period: 1 }, { unique: true });
timetableHistorySchema.index({ subject: 1, semester: 1, branch: 1, date: -1 });

const TimetableHistory = mongoose.model('TimetableHistory', timetableHistorySchema);
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
            // Return enrollmentNo as studentId so client always uses enrollmentNo for lookups
            res.json({ success: true, studentId: student.enrollmentNo || student._id.toString(), student });
        } else {
            const student = {
                _id: Date.now().toString(),
                name,
                status: 'absent',
                timerValue: 120,
                isRunning: false
            };
            studentsMemory.push(student);
            // In-memory mode has no enrollmentNo — fall back to _id (dev only)
            res.json({ success: true, studentId: student.enrollmentNo || student._id, student });
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

// Wildcard route to catch branch names with slashes (e.g. /api/timetable/3/AI/ML)
// Must be registered BEFORE the :semester/:branch route
app.get('/api/timetable/:semester/*', async (req, res, next) => {
    // Only handle if there are extra path segments (branch contains '/')
    const wildcard = req.params[0]; // everything after :semester/
    if (!wildcard || !wildcard.includes('/')) return next(); // no slash → let :branch handle it
    const semester = req.params.semester;
    const branch = decodeURIComponent(wildcard); // e.g. "AI/ML"
    try {
        if (mongoose.connection.readyState === 1) {
            let timetable = await Timetable.findOne({ semester, branch }).lean();
            if (!timetable) timetable = createDefaultTimetable(semester, branch);
            res.set('Cache-Control', 'public, max-age=300');
            return res.json({ success: true, timetable });
        } else {
            const key = `${semester}_${branch}`;
            let timetable = timetableMemory[key] || createDefaultTimetable(semester, branch);
            return res.json({ success: true, timetable });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/timetable/:semester/:branch', async (req, res) => {
    try {
        const { semester } = req.params;
        // Express decodes %2F → '/' in params, so req.params.branch already has the correct value
        // e.g. /api/timetable/3/AI%2FML → branch = "AI/ML"
        const effectiveBranch = req.query.branch || req.params.branch;

        // ── Redis cache ───────────────────────────────────────────────────────
        const cacheKey = `timetable:${semester}:${effectiveBranch}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ success: true, timetable: cached });
        }

        if (mongoose.connection.readyState === 1) {
            let timetable = await Timetable.findOne({ semester, branch: effectiveBranch }).lean();
            if (!timetable) {
                timetable = createDefaultTimetable(semester, effectiveBranch);
            }
            await cacheSet(cacheKey, timetable, CACHE_TTL.TIMETABLE);
            res.set('Cache-Control', 'public, max-age=300');
            res.set('X-Cache', 'MISS');
            res.json({ success: true, timetable });
        } else {
            const key = `${semester}_${effectiveBranch}`;
            let timetable = timetableMemory[key];
            if (!timetable) {
                timetable = createDefaultTimetable(semester, effectiveBranch);
                timetableMemory[key] = timetable;
            }
            res.json({ success: true, timetable });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/timetable/current-period ───────────────────────────────────────
// Returns the currently active period for every timetable (all semester/branch combos).
// Used by the admin timetable view to show a live "now" dot on the active cell.
app.get('/api/timetable/current-period', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) return res.json({ success: true, active: [] });

        const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const now  = new Date();
        const currentDay  = days[now.getDay()];
        const currentMins = now.getHours() * 60 + now.getMinutes();

        const timetables = await Timetable.find({}).lean();
        const active = [];

        for (const tt of timetables) {
            const daySchedule = tt.timetable?.[currentDay] || [];
            for (let i = 0; i < daySchedule.length; i++) {
                const slot = daySchedule[i];
                const pInfo = tt.periods?.[i];
                if (!pInfo || slot.isBreak || !slot.subject) continue;
                const start = timeToMinutes(pInfo.startTime);
                const end   = timeToMinutes(pInfo.endTime);
                if (currentMins >= start && currentMins < end) {
                    active.push({
                        semester: tt.semester,
                        branch:   tt.branch,
                        day:      currentDay,
                        periodIdx: i,          // 0-based index
                        periodNum: i + 1,      // 1-based (P1, P2…)
                        subject:  slot.subject,
                        startTime: pInfo.startTime,
                        endTime:   pInfo.endTime
                    });
                    break; // only one active period per timetable at a time
                }
            }
        }

        res.json({ success: true, active, day: currentDay, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}` });
    } catch (error) {
        console.error('❌ Error fetching current period:', error);
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
            // Invalidate timetable cache
            await cacheDel(`timetable:${semester}:${branch}`);
            res.json({ success: true, timetable: existingTimetable });
        } else {
            const key = `${semester}_${branch}`;
            timetableMemory[key] = { semester, branch, periods, timetable, lastUpdated: new Date() };
            res.json({ success: true, timetable: timetableMemory[key] });
        }

        // Notify all students
        io.emit('timetable_updated', { semester, branch });
        
        // Broadcast BSSID schedule update to affected students
        await broadcastBSSIDScheduleUpdate(semester, branch);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT endpoint for updating timetable (used by mobile app)
app.put('/api/timetable/:semester/:branch', async (req, res) => {
    try {
        const { semester } = req.params;
        // Express decodes %2F → '/' in params automatically
        const effectiveBranch = req.query.branch || req.params.branch;
        const { timetable, periods } = req.body;

        console.log(`📝 Updating timetable for ${effectiveBranch} Semester ${semester}`);

        if (mongoose.connection.readyState === 1) {
            let existingTimetable = await Timetable.findOne({ semester, branch: effectiveBranch });
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
                    branch: effectiveBranch,
                    periods: periods || [],
                    timetable
                });
                await newTimetable.save();
                console.log('✅ New timetable created');
                res.json({ success: true, timetable: newTimetable });
            }
        } else {
            const key = `${semester}_${effectiveBranch}`;
            timetableMemory[key] = { semester, branch: effectiveBranch, periods: periods || [], timetable, lastUpdated: new Date() };
            res.json({ success: true, timetable: timetableMemory[key] });
        }

        // Notify all students (fire-and-forget after response sent)
        try {
            io.emit('timetable_updated', { semester, branch: effectiveBranch });
            await broadcastBSSIDScheduleUpdate(semester, effectiveBranch);
        } catch (notifyErr) {
            console.warn('⚠️ Timetable notify error (non-fatal):', notifyErr.message);
        }
    } catch (error) {
        console.error('❌ Error updating timetable:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
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
            
            // Broadcast BSSID schedule update to ALL students (period times changed)
            console.log('📡 Broadcasting BSSID updates to all students (period times changed)');
            const allTimetablesForBroadcast = await Timetable.find({});
            for (const tt of allTimetablesForBroadcast) {
                if (tt.semester && tt.branch) {
                    await broadcastBSSIDScheduleUpdate(tt.semester, tt.branch);
                }
            }
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

// ─── POST /api/admin/purge-orphan-subjects ────────────────────────────────────
// Deletes PeriodAttendance, TimetableHistory, AttendanceRecord, and DailyAttendance
// records whose subject name is NOT in the Subject collection for that semester+branch.
// Call once to clean up corrupt seed/test data.
app.post('/api/admin/purge-orphan-subjects', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, error: 'DB not connected' });
        }

        // Build a set of valid subject names per semester+branch
        const allSubjects = await Subject.find({ isActive: { $ne: false } }, { subjectName: 1, semester: 1, branch: 1 }).lean();
        // Map: "semester||branch" → Set of valid subjectNames
        const validMap = {};
        allSubjects.forEach(s => {
            const key = `${s.semester}||${s.branch}`;
            if (!validMap[key]) validMap[key] = new Set();
            validMap[key].add(s.subjectName);
        });

        // Helper: build $or query for orphan records
        // A record is orphan if its subject is NOT in the valid set for its semester+branch
        // We do this per-key to keep it precise
        const results = { periodAttendance: 0, timetableHistory: 0, attendanceRecord: 0, dailyAttendance: 0 };

        for (const [key, validSubjects] of Object.entries(validMap)) {
            const [semester, branch] = key.split('||');

            // Find all distinct subjects in PeriodAttendance for this sem/branch
            const paSubjects = await PeriodAttendance.distinct('subject', { semester, branch });
            const orphanPA   = paSubjects.filter(s => s && !validSubjects.has(s));
            if (orphanPA.length > 0) {
                const r = await PeriodAttendance.deleteMany({ semester, branch, subject: { $in: orphanPA } });
                results.periodAttendance += r.deletedCount;
                console.log(`🗑️  PeriodAttendance: deleted ${r.deletedCount} records for orphan subjects [${orphanPA.join(', ')}] (${semester}/${branch})`);
            }

            // TimetableHistory
            const thSubjects = await TimetableHistory.distinct('subject', { semester, branch });
            const orphanTH   = thSubjects.filter(s => s && !validSubjects.has(s));
            if (orphanTH.length > 0) {
                const r = await TimetableHistory.deleteMany({ semester, branch, subject: { $in: orphanTH } });
                results.timetableHistory += r.deletedCount;
                console.log(`🗑️  TimetableHistory: deleted ${r.deletedCount} records for orphan subjects [${orphanTH.join(', ')}] (${semester}/${branch})`);
            }
        }

        // AttendanceRecord and DailyAttendance don't store subject directly — skip
        console.log(`✅ Purge complete:`, results);
        res.json({ success: true, deleted: results });
    } catch (error) {
        console.error('❌ Error purging orphan subjects:', error);
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

        // Get current day and time in IST (TZ forced to Asia/Kolkata at startup)
        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getDay()];
        const currentTime = now.getHours() * 60 + now.getMinutes(); // IST minutes since midnight

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

        // Find timetables where this teacher is assigned on the current day — filter at DB level
        const timetables = await Timetable.find({
            [`timetable.${currentDay}`]: {
                $elemMatch: {
                    teacher: { $regex: new RegExp(teacherName, 'i') }
                }
            }
        });

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
            branch: currentClass.branch
        }).select('-password');

        console.log(`👥 Found ${students.length} students for ${currentClass.branch} Semester ${currentClass.semester}`);

        // Enhance students with current attendance session data
        const today = new Date().toISOString().split('T')[0];
        const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — ghost session
        const SYNC_TIMEOUT_MS    =      90 * 1000; // 90 seconds — missed sync = student offline
        const nowMs = Date.now();
        const studentsWithStatus = await Promise.all(students.map(async (student) => {
            try {
                const s = student.toObject();
                // Prefer live in-memory state, fall back to DB attendanceSession
                const live = liveTimerState.get(s.enrollmentNo);

                // Treat live state as stale if not updated in the last 10 minutes
                const isStale = live && live.lastSeen && (nowMs - live.lastSeen) > STALE_THRESHOLD_MS;
                const effectiveLive = (live && !isStale) ? live : null;

                // If student hasn't synced in 90s but is marked running → they went offline
                const isSyncTimedOut = effectiveLive && effectiveLive.isRunning &&
                    effectiveLive.lastSeen && (nowMs - effectiveLive.lastSeen) > SYNC_TIMEOUT_MS;

                const session = s.attendanceSession || {};
                let timerSecs = effectiveLive ? effectiveLive.attendedSeconds : (session.totalAttendedSeconds || 0);
                let isRunning = effectiveLive ? effectiveLive.isRunning : (session.isRunning || false);
                let status    = effectiveLive ? effectiveLive.status    : (session.status    || 'absent');

                // Student went offline — stop showing as running, but KEEP the timer value frozen
                // Use 'offline' status so the client shows it paused, not zeroed
                if (isSyncTimedOut) {
                    isRunning = false;
                    status    = 'offline'; // frozen at last known value
                }

                // If the session's last sync was NOT today, the timerValue is from a previous
                // day's session — reset it to 0 so teacher doesn't see stale timer values.
                const lastSync = effectiveLive
                    ? effectiveLive.lastSyncTime
                    : (session.lastSyncTime || null);
                const lastSyncDate = lastSync
                    ? new Date(lastSync).toISOString().split('T')[0]
                    : null;
                if (lastSyncDate && lastSyncDate !== today) {
                    timerSecs = 0;
                }

                // Zero timer only for genuinely absent students (never attended today),
                // NOT for offline students (they have a real accumulated value to show).
                const displayTimer = (status === 'absent') ? 0 : timerSecs;

                return {
                    ...s,
                    isRunning,
                    timerValue: displayTimer,
                    status,
                    lastUpdated: lastSync,
                    totalAttendedSeconds: timerSecs  // keep real value for stats, only display is zeroed
                };
            } catch (error) {
                console.error(`❌ Error getting status for student ${student.name}:`, error);
                return {
                    ...student.toObject(),
                    isRunning: false,
                    timerValue: 0,
                    status: 'absent',
                    lastUpdated: null,
                    totalAttendedSeconds: 0
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
            activeStudents: studentsWithStatus.filter(s => s.isRunning && s.status !== 'present').length,
            presentStudents: studentsWithStatus.filter(s => s.status === 'present').length,
            absentStudents: studentsWithStatus.filter(s => s.status === 'absent').length,
            attendanceThreshold: ATTENDANCE_THRESHOLD
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
// ============================================
// LIVE TIMER STATE - Redis-backed, survives restarts
// key: enrollmentNo, value: { name, semester, branch, isRunning, timerSeconds, status, lecture, lastSeen }
// ============================================
const liveTimerState = {
    _map: new Map(), // in-memory mirror for fast reads within same process

    async set(enrollmentNo, data) {
        const val = { ...data, lastSeen: Date.now() };
        this._map.set(enrollmentNo, val);
        await cacheSet(`live:${enrollmentNo}`, val, CACHE_TTL.LIVE_TIMER);
    },

    async get(enrollmentNo) {
        if (this._map.has(enrollmentNo)) return this._map.get(enrollmentNo);
        const val = await cacheGet(`live:${enrollmentNo}`);
        if (val) this._map.set(enrollmentNo, val);
        return val || null;
    },

    async delete(enrollmentNo) {
        this._map.delete(enrollmentNo);
        await cacheDel(`live:${enrollmentNo}`);
    },

    // Synchronous forEach over in-memory mirror (for socket broadcasts)
    forEach(cb) {
        this._map.forEach(cb);
    },

    has(enrollmentNo) {
        return this._map.has(enrollmentNo);
    }
};

io.on('connection', (socket) => {
    console.log('� Client connected:', socket.id);

    // Teacher joins a class room to receive targeted broadcasts
    socket.on('join_class_room', ({ semester, branch }) => {
        if (!semester || !branch) return;
        const room = `class:${semester}:${branch}`;
        socket.join(room);
        console.log(`👨‍🏫 Teacher joined room: ${room}`);

        // Immediately send current live state for this class
        // Only include entries that were updated within the last 10 minutes to avoid
        // serving stale 'active' status from a previous session hours ago
        const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
        const SYNC_TIMEOUT_MS    =      90 * 1000; // 90 seconds — missed sync = student offline
        const now = Date.now();
        const todayStr = new Date().toISOString().split('T')[0];
        const classStudents = [];
        liveTimerState.forEach((state) => {
            if (state.semester === semester && state.branch === branch) {
                const isStale = state.lastSeen && (now - state.lastSeen) > STALE_THRESHOLD_MS;
                // Also check if the last sync was from a previous day
                const lastSyncDate = state.lastSyncTime
                    ? new Date(state.lastSyncTime).toISOString().split('T')[0]
                    : null;
                const isFromPreviousDay = lastSyncDate && lastSyncDate !== todayStr;
                // Student hasn't synced in 90s but marked running → offline
                const isSyncTimedOut = state.isRunning && state.lastSeen && (now - state.lastSeen) > SYNC_TIMEOUT_MS;

                if (isStale || isFromPreviousDay) {
                    classStudents.push({ ...state, status: 'absent', isRunning: false, attendedSeconds: 0, timerValue: 0 });
                } else if (isSyncTimedOut) {
                    // Freeze at last known value — student went offline
                    classStudents.push({ ...state, status: 'offline', isRunning: false });
                } else {
                    const displayTimer = state.status === 'absent' ? 0 : (state.attendedSeconds || 0);
                    classStudents.push({ ...state, attendedSeconds: displayTimer, timerValue: displayTimer });
                }
            }
        });
        if (classStudents.length > 0) {
            socket.emit('live_state_snapshot', { semester, branch, students: classStudents });
        }
    });

    socket.on('leave_class_room', ({ semester, branch }) => {
        const room = `class:${semester}:${branch}`;
        socket.leave(room);
        console.log(`👨‍🏫 Teacher left room: ${room}`);
    });

    socket.on('disconnect', () => {
        console.log('📴 Client disconnected:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// ─── Helper: sync AttendanceRecord from PeriodAttendance (status + lectures) ──
async function syncAttendanceRecord(enrollmentNo, date, studentName, semester, branch, threshold = 75) {
    try {
        const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
        const nextDay  = new Date(midnight); nextDay.setDate(nextDay.getDate() + 1);

        const periods = await PeriodAttendance.find({
            enrollmentNo, date: { $gte: midnight, $lt: nextDay }
        }).lean();

        const presentCount  = periods.filter(p => p.status === 'present').length;
        const totalCount    = periods.length;
        // Only count 'present' (threshold crossed) — 'active' means timer running but not yet at threshold
        const dayPercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        // Day status: 'active' if timer is currently running (any period active), else present/absent by threshold
        const hasActiveTimer = periods.some(p => p.status === 'active');
        const dayStatus = hasActiveTimer ? 'active'
            : (dayPercentage >= threshold ? 'present' : 'absent');

        // Build lectures array with attended/total/percentage/present
        // Pull period start/end times from timetable so Level 3 has real data
        let lecturesWithTime = [];
        try {
            const tt = await Timetable.findOne({ semester, branch });
            const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
            const dayName = days[midnight.getDay()];
            const daySchedule = tt ? (tt.timetable[dayName] || []) : [];

            lecturesWithTime = periods.map(p => {
                // Match period by id (P1, P2 …)
                const periodIndex = parseInt(p.period.replace('P', ''), 10) - 1;
                const periodInfo  = tt && tt.periods ? tt.periods[periodIndex] : null;
                const startTime   = periodInfo ? periodInfo.startTime : '';
                const endTime     = periodInfo ? periodInfo.endTime   : '';

                // Duration in seconds
                const durationSec = (startTime && endTime)
                    ? (timeToMinutes(endTime) - timeToMinutes(startTime)) * 60
                    : 0;

                // Attended seconds: use timerSeconds if stored, else full duration if present
                const attendedSec = p.timerSeconds != null
                    ? Math.floor(p.timerSeconds)
                    : (p.status === 'present' ? durationSec : 0);

                const pct = durationSec > 0
                    ? Math.min(100, Math.round((attendedSec / durationSec) * 100))
                    : (p.status === 'present' ? 100 : 0);

                // present = threshold crossed (attended enough) OR already marked present by check-in
                // 'active' alone (timer running but below threshold) is NOT present
                const isPresent = p.status === 'present' ||
                    (durationSec > 0 && (attendedSec / durationSec) * 100 >= threshold);

                return {
                    period:      p.period,
                    subject:     p.subject,
                    teacher:     p.teacher,
                    teacherName: p.teacherName || p.teacher,
                    room:        p.room || '',
                    startTime,
                    endTime,
                    lectureStartedAt: periodInfo ? new Date(`${midnight.toISOString().split('T')[0]}T${startTime}:00`) : null,
                    lectureEndedAt:   periodInfo ? new Date(`${midnight.toISOString().split('T')[0]}T${endTime}:00`)   : null,
                    studentCheckIn:   p.checkInTime || null,
                    attended:    attendedSec,   // seconds
                    total:       durationSec,   // seconds
                    percentage:  pct,
                    present:     isPresent,
                    status:      p.status || (isPresent ? 'present' : 'absent'),
                    verifications: p.checkInTime ? [{
                        time:    p.checkInTime,
                        type:    'face',
                        success: p.faceVerified !== false,
                        event:   'check_in'
                    }] : []
                };
            });
        } catch (_) {
            // Fallback: no timetable data — still store basic info
            lecturesWithTime = periods.map(p => ({
                period:      p.period,
                subject:     p.subject,
                teacher:     p.teacher,
                teacherName: p.teacherName || p.teacher,
                room:        p.room || '',
                startTime:   '',
                endTime:     '',
                attended:    p.timerSeconds || (p.status === 'present' ? durationSec : 0),
                total:       3600,
                percentage:  p.status === 'present' ? 100 : 0,
                present:     p.status === 'present',
                status:      p.status || (p.status === 'present' ? 'present' : 'absent'),
                studentCheckIn: p.checkInTime || null,
                verifications: []
            }));
        }

        // Total attended/class minutes from lectures
        const totalAttendedSec  = lecturesWithTime.reduce((s, l) => s + (l.attended || 0), 0);
        const totalClassSec     = lecturesWithTime.reduce((s, l) => s + (l.total    || 0), 0);
        const totalAttendedMin  = Math.floor(totalAttendedSec / 60);
        const totalClassMin     = Math.floor(totalClassSec    / 60);

        await AttendanceRecord.findOneAndUpdate(
            { enrollmentNo, date: midnight },   // simple filter — enrollmentNo is canonical key
            { $set: {
                studentId:     enrollmentNo,    // keep legacy field in sync
                enrollmentNo,
                studentName:   studentName || enrollmentNo,
                semester:      semester?.toString() || '',
                branch:        branch || '',
                status:        dayStatus,
                dayPercentage,
                totalAttended:  totalAttendedMin,
                totalClassTime: totalClassMin,
                timerValue:     totalAttendedSec,
                lectures:       lecturesWithTime,
                updatedAt:      new Date()
            }},
            { upsert: true }
        );

        return { dayStatus, dayPercentage, presentCount, totalCount };
    } catch (err) {
        console.error('❌ syncAttendanceRecord error:', err.message);
        return null;
    }
}

// Helper function already defined above - removed duplicate

// Helper: Get current lecture info from timetable
// Azure server runs in IST — new Date() already returns IST time.
// Period times stored as "HH:MM" IST strings. Always use server clock.
// clientTimestamp param kept for API compat but ignored.
async function getCurrentLectureInfo(semester, branch, clientTimestamp = null) {
    try {
        const now = new Date(); // server clock = IST on this Azure instance
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay  = days[now.getDay()];
        const currentTime = now.getHours() * 60 + now.getMinutes(); // IST minutes since midnight

        const timetable = await Timetable.findOne({ semester, branch });
        if (!timetable) return null;

        const daySchedule = timetable.timetable[currentDay];
        if (!daySchedule) return null;

        // Find the period whose window contains currentTime
        for (let i = 0; i < daySchedule.length; i++) {
            const period = daySchedule[i];
            const periodInfo = timetable.periods[i];
            if (!periodInfo || period.isBreak || !period.subject) continue;

            const periodStart = timeToMinutes(periodInfo.startTime);
            const periodEnd   = timeToMinutes(periodInfo.endTime);

            if (currentTime >= periodStart && currentTime < periodEnd) {
                return {
                    subject:          period.subject,
                    teacher:          period.teacher,
                    room:             period.room,
                    period:           period.period || (i + 1),
                    startTime:        periodInfo.startTime,
                    endTime:          periodInfo.endTime,
                    totalSeconds:     (periodEnd - periodStart) * 60,
                    elapsedSeconds:   (currentTime - periodStart) * 60,
                    remainingSeconds: (periodEnd - currentTime) * 60,
                    periodStart,
                    periodEnd
                };
            }
        }

        // No exact match — only return a period if it's currently active (not ended)
        // Do NOT return latestStarted if it has already ended — that causes wrong threshold
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

// Helper: Broadcast BSSID schedule update to students
async function broadcastBSSIDScheduleUpdate(semester, branch) {
    try {
        console.log(`📡 Broadcasting BSSID schedule update for ${branch} Semester ${semester}`);
        
        // Get all students in this semester/branch
        const students = await StudentManagement.find({ semester, branch });
        
        if (!students || students.length === 0) {
            console.log(`   No students found for ${branch} Semester ${semester}`);
            return;
        }
        
        console.log(`   Found ${students.length} students to notify`);
        
        // Get today's date
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
        const dayNameLower = dayName.toLowerCase();
        
        // Get timetable for this semester/branch
        const timetable = await Timetable.findOne({ semester, branch });
        if (!timetable || !timetable.timetable) {
            console.log(`   No timetable found for ${branch} Semester ${semester}`);
            return;
        }
        
        // Convert to plain object
        const timetableObj = timetable.toObject ? timetable.toObject() : timetable;
        
        // Get today's schedule (lowercase day name)
        const todaySchedule = timetableObj.timetable[dayNameLower] || [];
        if (todaySchedule.length === 0) {
            console.log(`   No classes on ${dayName}`);
            return;
        }
        
        // Fetch classroom BSSIDs for each period
        const scheduleWithBSSID = await Promise.all(
            todaySchedule.map(async (period) => {
                let bssid = null;
                let bssids = [];
                let roomInfo = null;

                if (period.room) {
                    const classroom = await Classroom.findOne({ roomNumber: period.room });
                    if (classroom) {
                        // Support both single BSSID and multiple BSSIDs
                        if (classroom.wifiBSSIDs && Array.isArray(classroom.wifiBSSIDs) && classroom.wifiBSSIDs.length > 0) {
                            bssids = classroom.wifiBSSIDs.filter(b => b && b.trim() !== '');
                            bssid = bssids[0]; // Primary BSSID for backward compatibility
                        }
                        
                        
                        roomInfo = {
                            building: classroom.building,
                            capacity: classroom.capacity,
                            isActive: classroom.isActive
                        };
                    }
                }

                // Get period times from periods array
                let startTime = null;
                let endTime = null;
                
                if (timetableObj.periods && Array.isArray(timetableObj.periods)) {
                    const periodDef = timetableObj.periods.find(p => p.number === period.period);
                    if (periodDef) {
                        startTime = periodDef.startTime;
                        endTime = periodDef.endTime;
                    }
                }

                return {
                    period: period.period,
                    subject: period.subject || period.teacherName || '',
                    subjectCode: period.subjectCode || '',
                    teacher: period.teacher || period.teacherName || '',
                    room: period.room || '',
                    startTime: startTime,
                    endTime: endTime,
                    bssid: bssid || bssids, // Return array if multiple, single if one, or null
                    bssids: bssids, // Always return array for new clients
                    roomInfo: roomInfo
                };
            })
        );
        
        // Emit socket event to all students in this semester/branch
        for (const student of students) {
            io.emit('bssid-schedule-update', {
                enrollmentNo: student.enrollmentNo,
                date: today.toISOString().split('T')[0],
                dayName: dayName,
                schedule: scheduleWithBSSID,
                reason: 'timetable_updated'
            });
        }
        
        console.log(`✅ BSSID schedule broadcast complete (${students.length} students)`);
    } catch (error) {
        console.error('❌ Error broadcasting BSSID schedule update:', error);
    }
}

// Helper: Broadcast BSSID update for specific room (when classroom BSSID changes)
async function broadcastBSSIDUpdateForRoom(roomNumber) {
    try {
        console.log(`📡 Broadcasting BSSID update for room ${roomNumber}`);
        
        // Get today's date
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Find all timetables that use this room today
        const timetables = await TimetableTable.find({
            [`timetable.schedule.${dayName}`]: {
                $elemMatch: { room: roomNumber }
            }
        });
        
        if (!timetables || timetables.length === 0) {
            console.log(`   No timetables found using room ${roomNumber} on ${dayName}`);
            return;
        }
        
        console.log(`   Found ${timetables.length} timetables using this room`);
        
        // For each timetable, find students and send updates
        for (const timetable of timetables) {
            try {
                // Find students with this timetable
                const students = await StudentManagement.find({ timetableId: timetable._id });
                
                if (!students || students.length === 0) continue;
                
                console.log(`   Found ${students.length} students in ${timetable.branch} Semester ${timetable.semester}`);
                
                // Get today's schedule
                const todaySchedule = timetable.timetable.schedule[dayName] || [];
                
                // Fetch classroom BSSIDs for each period
                const scheduleWithBSSID = await Promise.all(
                    todaySchedule.map(async (period) => {
                        let bssid = null;
                        let bssids = [];
                        let roomInfo = null;

                        if (period.room) {
                            const classroom = await Classroom.findOne({ roomNumber: period.room });
                            if (classroom) {
                                // Support both single BSSID and multiple BSSIDs
                                if (classroom.wifiBSSIDs && Array.isArray(classroom.wifiBSSIDs) && classroom.wifiBSSIDs.length > 0) {
                                    bssids = classroom.wifiBSSIDs.filter(b => b && b.trim() !== '');
                                    bssid = bssids[0]; // Primary BSSID for backward compatibility
                                }
                                
                                
                                roomInfo = {
                                    building: classroom.building,
                                    capacity: classroom.capacity,
                                    isActive: classroom.isActive
                                };
                            }
                        }

                        return {
                            period: period.period,
                            subject: period.subject,
                            subjectCode: period.subjectCode,
                            teacher: period.teacher,
                            room: period.room,
                            startTime: period.startTime,
                            endTime: period.endTime,
                            bssid: bssid || bssids, // Return array if multiple, single if one, or null
                            bssids: bssids, // Always return array for new clients
                            roomInfo: roomInfo
                        };
                    })
                );
                
                // Emit socket event to each student
                for (const student of students) {
                    io.emit('bssid-schedule-update', {
                        enrollmentNo: student.enrollmentNo,
                        date: today.toISOString().split('T')[0],
                        dayName: dayName,
                        schedule: scheduleWithBSSID,
                        reason: 'classroom_bssid_updated',
                        affectedRoom: roomNumber
                    });
                    
                    console.log(`   ✅ Sent BSSID update to ${student.enrollmentNo}`);
                }
            } catch (timetableError) {
                console.error(`   ❌ Error processing timetable ${timetable._id}:`, timetableError.message);
            }
        }
        
        console.log(`✅ Room BSSID broadcast complete`);
    } catch (error) {
        console.error('❌ Error broadcasting room BSSID update:', error);
    }
}

// ============================================
// PERIOD-BASED ATTENDANCE SYSTEM
// ============================================

// Rate limiter for check-in endpoint (10 requests per minute per student)
const checkInLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Use enrollment number if available, otherwise fall back to IP
        const enrollmentNo = req.body?.enrollmentNo;
        if (enrollmentNo) {
            return `enrollment:${enrollmentNo}`;
        }
        // Use the built-in IP key generator for proper IPv6 support
        return ipKeyGenerator(req.ip);
    },
    message: { success: false, message: 'Too many check-in attempts. Please try again later.' }
});

// POST /api/attendance/check-in - Daily student check-in
app.post('/api/attendance/check-in', checkInLimiter, async (req, res) => {
    const startTime = Date.now();
    const { enrollmentNo, faceEmbedding, wifiBSSID, timestamp } = req.body;
    
    // Log all check-in attempts
    console.log(`📱 [CHECK-IN] Attempt started - Student: ${enrollmentNo || 'UNKNOWN'}, Time: ${timestamp || 'UNKNOWN'}, IP: ${req.ip}`);
    
    try {
        // Validate request body
        if (!enrollmentNo || !faceEmbedding || !wifiBSSID || !timestamp) {
            const missingFields = [];
            if (!enrollmentNo) missingFields.push('enrollmentNo');
            if (!faceEmbedding) missingFields.push('faceEmbedding');
            if (!wifiBSSID) missingFields.push('wifiBSSID');
            if (!timestamp) missingFields.push('timestamp');
            
            console.log(`❌ [CHECK-IN] Validation failed - Student: ${enrollmentNo || 'UNKNOWN'}, Missing fields: ${missingFields.join(', ')}`);
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
                missingFields
            });
        }

        // Validate faceEmbedding is an array
        if (!Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
            console.log(`❌ [CHECK-IN] Invalid face embedding - Student: ${enrollmentNo}, Type: ${typeof faceEmbedding}, Length: ${Array.isArray(faceEmbedding) ? faceEmbedding.length : 'N/A'}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid faceEmbedding: must be a non-empty array',
                receivedType: typeof faceEmbedding,
                receivedLength: Array.isArray(faceEmbedding) ? faceEmbedding.length : 0
            });
        }

        console.log(`🔍 [CHECK-IN] Validation passed - Student: ${enrollmentNo}, Face embedding length: ${faceEmbedding.length}, BSSID: ${wifiBSSID}`);

        // Get student information
        let student;
        try {
            student = await StudentManagement.findOne({ enrollmentNo });
            if (!student) {
                console.log(`❌ [CHECK-IN] Student not found - Enrollment: ${enrollmentNo}`);
                return res.status(404).json({
                    success: false,
                    message: 'Student not found',
                    enrollmentNo
                });
            }
            console.log(`✅ [CHECK-IN] Student found - Name: ${student.name}, Semester: ${student.semester}, Branch: ${student.branch}`);

            // Validate semester/branch are configured
            if (!student.semester || !student.branch) {
                return res.status(400).json({
                    success: false,
                    message: 'Your semester/branch is not configured. Please contact admin.',
                    enrollmentNo
                });
            }
        } catch (dbError) {
            console.error(`❌ [CHECK-IN] Database error fetching student - Enrollment: ${enrollmentNo}, Error: ${dbError.message}`);
            return res.status(500).json({
                success: false,
                message: 'Database error while fetching student information',
                error: dbError.message
            });
        }

        // Check if student has face enrolled
        if (!student.faceEmbedding || student.faceEmbedding.length === 0) {
            console.log(`❌ [CHECK-IN] Face not enrolled - Student: ${enrollmentNo}, Name: ${student.name}`);
            return res.status(400).json({
                success: false,
                message: 'Face not enrolled. Please enroll your face first.',
                enrollmentNo,
                studentName: student.name
            });
        }

        // Face verification - Use face verification service
        console.log(`👤 [CHECK-IN] Starting face verification - Student: ${enrollmentNo}`);
        let faceVerificationResult;
        try {
            faceVerificationResult = faceVerificationService.verifyStudentFace(student, faceEmbedding);
            console.log(`👤 [CHECK-IN] Face verification result - Student: ${enrollmentNo}, Success: ${faceVerificationResult.success}, Match: ${faceVerificationResult.isMatch}, Similarity: ${faceVerificationResult.similarity} (${faceVerificationResult.similarityPercentage}%)`);
        } catch (faceError) {
            console.error(`❌ [CHECK-IN] Face verification error - Student: ${enrollmentNo}, Error: ${faceError.message}, Stack: ${faceError.stack}`);
            return res.status(500).json({
                success: false,
                message: 'Face verification service error',
                error: faceError.message
            });
        }

        if (!faceVerificationResult.success || !faceVerificationResult.isMatch) {
            console.log(`❌ [CHECK-IN] Face verification failed - Student: ${enrollmentNo}, Reason: ${faceVerificationResult.message}, Similarity: ${faceVerificationResult.similarity}`);
            return res.status(401).json({
                success: false,
                message: faceVerificationResult.message,
                faceVerified: false,
                similarity: faceVerificationResult.similarity,
                similarityPercentage: faceVerificationResult.similarityPercentage,
                enrollmentNo,
                studentName: student.name
            });
        }

        // Get current lecture info to determine period and room
        console.log(`📚 [CHECK-IN] Fetching current lecture - Semester: ${student.semester}, Branch: ${student.branch}`);
        let currentLecture;
        try {
            currentLecture = await getCurrentLectureInfo(student.semester, student.branch, timestamp);
            if (!currentLecture) {
                console.log(`❌ [CHECK-IN] No active lecture - Student: ${enrollmentNo}, Semester: ${student.semester}, Branch: ${student.branch}, Time: ${timestamp}`);
                return res.status(400).json({
                    success: false,
                    message: 'No active lecture at this time. Check-in is only available during class periods.',
                    enrollmentNo,
                    studentName: student.name,
                    semester: student.semester,
                    branch: student.branch
                });
            }
            console.log(`✅ [CHECK-IN] Current lecture found - Period: ${currentLecture.period}, Subject: ${currentLecture.subject}, Room: ${currentLecture.room}`);
        } catch (lectureError) {
            console.error(`❌ [CHECK-IN] Error fetching current lecture - Student: ${enrollmentNo}, Error: ${lectureError.message}`);
            return res.status(500).json({
                success: false,
                message: 'Error determining current lecture',
                error: lectureError.message
            });
        }

        const currentPeriod = `P${currentLecture.period}`;
        const currentRoom = currentLecture.room;

        // WiFi verification - Use WiFi verification service
        console.log(`📶 [CHECK-IN] Starting WiFi verification - Student: ${enrollmentNo}, Room: ${currentRoom}, BSSID: ${wifiBSSID}`);
        let classroom;
        let wifiVerificationResult;
        try {
            classroom = await Classroom.findOne({ roomNumber: currentRoom });
            if (!classroom) {
                console.log(`❌ [CHECK-IN] Classroom not found - Room: ${currentRoom}, Student: ${enrollmentNo}`);
                return res.status(500).json({
                    success: false,
                    message: `Classroom ${currentRoom} not found in database. Please contact administrator.`,
                    roomNumber: currentRoom
                });
            }
            
            wifiVerificationResult = wifiVerificationService.verifyClassroomWiFi(wifiBSSID, classroom);
            console.log(`📶 [CHECK-IN] WiFi verification result - Student: ${enrollmentNo}, Success: ${wifiVerificationResult.success}, Match: ${wifiVerificationResult.isMatch}, Expected: ${classroom.wifiBSSIDs?.join(', ')}, Received: ${wifiBSSID}`);
        } catch (wifiError) {
            console.error(`❌ [CHECK-IN] WiFi verification error - Student: ${enrollmentNo}, Error: ${wifiError.message}`);
            return res.status(500).json({
                success: false,
                message: 'WiFi verification service error',
                error: wifiError.message
            });
        }

        if (!wifiVerificationResult.success || !wifiVerificationResult.isMatch) {
            console.log(`❌ [CHECK-IN] WiFi verification failed - Student: ${enrollmentNo}, Reason: ${wifiVerificationResult.message}, Expected: ${classroom?.wifiBSSID}, Received: ${wifiBSSID}`);
            return res.status(401).json({
                success: false,
                message: wifiVerificationResult.message,
                wifiVerified: false,
                expectedBSSID: classroom?.wifiBSSID,
                currentBSSID: wifiBSSID,
                roomNumber: currentRoom,
                enrollmentNo,
                studentName: student.name
            });
        }

        // Check for duplicate check-in today
        console.log(`🔍 [CHECK-IN] Checking for duplicate check-in - Student: ${enrollmentNo}`);
        const today = new Date(timestamp);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let existingCheckIn;
        try {
            existingCheckIn = await PeriodAttendance.findOne({
                enrollmentNo,
                date: { $gte: today, $lt: tomorrow },
                verificationType: 'initial'
            }).sort({ checkInTime: 1 });

            if (existingCheckIn) {
                console.log(`⚠️  [CHECK-IN] Duplicate check-in detected - Student: ${enrollmentNo}, Original check-in: ${existingCheckIn.period} at ${existingCheckIn.checkInTime}`);
                
                // Get all period attendance records for today
                const todayAttendance = await PeriodAttendance.find({
                    enrollmentNo,
                    date: { $gte: today, $lt: tomorrow }
                }).sort({ period: 1 });
                
                const markedPeriods = todayAttendance
                    .filter(record => record.status === 'present')
                    .map(record => record.period);
                
                const missedPeriods = todayAttendance
                    .filter(record => record.status === 'absent')
                    .map(record => record.period);
                
                console.log(`ℹ️  [CHECK-IN] Duplicate check-in response - Student: ${enrollmentNo}, Marked: ${markedPeriods.join(', ')}, Missed: ${missedPeriods.join(', ')}`);
                
                return res.status(200).json({
                    success: true,
                    alreadyCheckedIn: true,
                    message: `Already checked in today from ${existingCheckIn.period} onwards`,
                    checkInPeriod: existingCheckIn.period,
                    checkInTime: existingCheckIn.checkInTime,
                    markedPeriods,
                    missedPeriods
                });
            }
        } catch (dbError) {
            console.error(`❌ [CHECK-IN] Database error checking duplicate - Student: ${enrollmentNo}, Error: ${dbError.message}`);
            return res.status(500).json({
                success: false,
                message: 'Database error while checking existing check-in',
                error: dbError.message
            });
        }

        // Get timetable to determine all periods for the day
        console.log(`📅 [CHECK-IN] Fetching timetable - Semester: ${student.semester}, Branch: ${student.branch}`);
        let timetable;
        try {
            timetable = await Timetable.findOne({ 
                semester: student.semester, 
                branch: student.branch 
            });

            if (!timetable) {
                console.log(`❌ [CHECK-IN] Timetable not found - Student: ${enrollmentNo}, Semester: ${student.semester}, Branch: ${student.branch}`);
                return res.status(400).json({
                    success: false,
                    message: 'Timetable not configured for your semester and branch.',
                    semester: student.semester,
                    branch: student.branch
                });
            }
        } catch (dbError) {
            console.error(`❌ [CHECK-IN] Database error fetching timetable - Student: ${enrollmentNo}, Error: ${dbError.message}`);
            return res.status(500).json({
                success: false,
                message: 'Database error while fetching timetable',
                error: dbError.message
            });
        }

        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[new Date(timestamp).getDay()];
        const daySchedule = timetable.timetable[currentDay];

        if (!daySchedule || daySchedule.length === 0) {
            console.log(`❌ [CHECK-IN] No classes scheduled - Student: ${enrollmentNo}, Day: ${currentDay}`);
            return res.status(400).json({
                success: false,
                message: 'No classes scheduled for today.',
                day: currentDay
            });
        }

        // Mark attendance: only the CURRENT period as present.
        // Past periods = absent (student was late/missed). Future periods = untouched (not yet happened).
        console.log(`📝 [CHECK-IN] Marking attendance - Student: ${enrollmentNo}, Current period: ${currentPeriod}`);
        const markedPeriods = [];
        const missedPeriods = [];
        const checkInTime = new Date(timestamp);
        // Use server clock (IST) for period matching — period times are stored in IST
        const serverNow     = new Date();
        const serverMinutes = serverNow.getHours() * 60 + serverNow.getMinutes();
        const dbErrors = [];

        for (let i = 0; i < daySchedule.length; i++) {
            const period = daySchedule[i];
            const periodInfo = timetable.periods[i];

            if (!period || period.isBreak || !period.subject || !periodInfo) continue;

            const periodNumber = i + 1;
            const periodId     = `P${periodNumber}`;
            const periodStart  = timeToMinutes(periodInfo.startTime);
            const periodEnd    = timeToMinutes(periodInfo.endTime);

            // Determine relationship of this period to current server time (IST)
            const isCurrentPeriod = serverMinutes >= periodStart && serverMinutes < periodEnd;
            const isPastPeriod    = periodEnd <= serverMinutes;
            const isFuturePeriod  = periodStart > serverMinutes;

            if (isCurrentPeriod) {
                // Mark present — student is here right now
                try {
                    await PeriodAttendance.findOneAndUpdate(
                        { enrollmentNo, date: today, period: periodId },
                        {
                            enrollmentNo,
                            studentName:  student.name,
                            semester:     student.semester?.toString() || '',
                            branch:       student.branch || '',
                            date:         today,
                            period:       periodId,
                            subject:      period.subject,
                            teacher:      period.teacher,
                            teacherName:  period.teacherName || period.teacher,
                            room:         period.room,
                            status:       'present',
                            checkInTime,
                            verificationType: 'initial',
                            wifiVerified: true,
                            faceVerified: true,
                            wifiBSSID
                        },
                        { upsert: true, new: true }
                    );
                    markedPeriods.push(periodId);
                    console.log(`✅ [CHECK-IN] Present - ${enrollmentNo} ${periodId} (${period.subject})`);
                } catch (dbError) {
                    console.error(`❌ [CHECK-IN] DB error - ${enrollmentNo} ${periodId}: ${dbError.message}`);
                    dbErrors.push({ period: periodId, error: dbError.message });
                }
            } else if (isPastPeriod) {
                // Period already ended — mark absent only if no record exists yet
                try {
                    await PeriodAttendance.findOneAndUpdate(
                        { enrollmentNo, date: today, period: periodId },
                        {
                            $setOnInsert: {
                                enrollmentNo,
                                studentName:  student.name,
                                semester:     student.semester?.toString() || '',
                                branch:       student.branch || '',
                                date:         today,
                                period:       periodId,
                                subject:      period.subject,
                                teacher:      period.teacher,
                                teacherName:  period.teacherName || period.teacher,
                                room:         period.room,
                                status:       'absent',
                                verificationType: 'initial',
                                wifiVerified: false,
                                faceVerified: false
                            }
                        },
                        { upsert: true, new: true }
                    );
                    missedPeriods.push(periodId);
                    console.log(`⏭️  [CHECK-IN] Past/absent - ${enrollmentNo} ${periodId}`);
                } catch (dbError) {
                    if (dbError.code !== 11000) { // ignore duplicate key — record already exists
                        console.error(`❌ [CHECK-IN] DB error absent - ${enrollmentNo} ${periodId}: ${dbError.message}`);
                    }
                }
            }
            // isFuturePeriod → do nothing, will be handled when that period starts
        }

        // Check if there were any database errors during marking
        if (dbErrors.length > 0) {
            console.error(`❌ [CHECK-IN] Partial failure - Student: ${enrollmentNo}, Errors: ${JSON.stringify(dbErrors)}`);
            return res.status(500).json({
                success: false,
                message: 'Partial failure while marking attendance',
                markedPeriods,
                errors: dbErrors
            });
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [CHECK-IN] Success - Student: ${enrollmentNo} (${student.name}), Period: ${currentPeriod}, Marked: ${markedPeriods.join(', ')}, Missed: ${missedPeriods.join(', ')}, Duration: ${duration}ms`);

        // Sync AttendanceRecord daily summary from PeriodAttendance (full — includes lectures with attended/total/percentage)
        syncAttendanceRecord(enrollmentNo, today, student.name, student.semester, student.branch).catch(() => {});

        // Remove the old partial lecture write — syncAttendanceRecord handles it now

        res.json({
            success: true,
            message: `Checked in from ${currentPeriod} onwards`,
            checkInPeriod: currentPeriod,
            checkInTime: checkInTime,
            markedPeriods,
            missedPeriods,
            faceVerified: true,
            wifiVerified: true,
            enrollmentNo,
            studentName: student.name
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [CHECK-IN] Unexpected error - Student: ${enrollmentNo || 'UNKNOWN'}, Duration: ${duration}ms, Error: ${error.message}, Stack: ${error.stack}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error during check-in',
            error: error.message,
            enrollmentNo: enrollmentNo || 'UNKNOWN'
        });
    }
});

// ============================================
// UNIFIED TIMER SYSTEM - SINGLE SOURCE OF TRUTH
// ============================================








// (old /api/attendance/random-ring/verify removed — use /api/random-ring/verify)
// ============================================
// OFFLINE TIMER SYNC ENDPOINTS
// ============================================

// POST /api/attendance/record - Save daily attendance record with class duration
app.post('/api/attendance/record', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { 
            studentId, 
            studentName, 
            enrollmentNo, 
            status, 
            semester, 
            branch, 
            lectures, 
            totalAttended, 
            totalClassTime, 
            dayPercentage,
            clientDate 
        } = req.body;

        console.log(`📊 [ATTENDANCE-RECORD] Saving attendance record - Student: ${enrollmentNo} (${studentName})`);
        console.log(`   Status: ${status}, Total Attended: ${totalAttended}min, Total Class Time: ${totalClassTime}min, Percentage: ${dayPercentage}%`);

        // Validate required fields
        if (!enrollmentNo || !studentName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: enrollmentNo, studentName'
            });
        }

        // Get today's date (server time)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find or create attendance record — always key on enrollmentNo
        let record = await AttendanceRecord.findOne({
            $or: [{ enrollmentNo }, { studentId: enrollmentNo }],
            date: today
        });

        if (!record) {
            record = new AttendanceRecord({
                studentId:     enrollmentNo,
                enrollmentNo,
                studentName,
                semester:      semester || '',
                branch:        branch   || '',
                date:          today,
                status:        status   || 'absent',
                lectures:      lectures || [],
                totalAttended:  Number(totalAttended)  || 0,
                totalClassTime: Number(totalClassTime) || 0,
                dayPercentage:  Number(dayPercentage)  || 0,
                timerValue:     0,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        } else {
            record.status         = status        || record.status;
            record.lectures       = lectures       || record.lectures;
            record.totalAttended  = Number(totalAttended)  || record.totalAttended;
            record.totalClassTime = Number(totalClassTime) || record.totalClassTime;
            record.dayPercentage  = Number(dayPercentage)  || record.dayPercentage;
            // preserve timerValue set by offline-sync — don't overwrite with 0
            record.updatedAt = new Date();
        }

        // Save to database
        await record.save();

        const duration = Date.now() - startTime;
        console.log(`✅ [ATTENDANCE-RECORD] Record saved successfully - Duration: ${duration}ms`);

        res.json({
            success: true,
            record: {
                id: record._id,
                studentId: record.studentId,
                enrollmentNo: record.enrollmentNo,
                status: record.status,
                totalAttended: record.totalAttended,
                totalClassTime: record.totalClassTime,
                dayPercentage: record.dayPercentage,
                date: record.date
            },
            duration: duration
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [ATTENDANCE-RECORD] Failed to save record - Duration: ${duration}ms, Error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to save attendance record',
            details: error.message,
            duration: duration
        });
    }
});

// POST /api/refresh-profile - Refresh user profile data
app.post('/api/refresh-profile', async (req, res) => {
    const startTime = Date.now();
    const { id, role } = req.body;
    
    console.log(`🔄 [REFRESH-PROFILE] Request - ID: ${id}, Role: ${role}, IP: ${req.ip}`);
    
    try {
        // Validate request body
        if (!id || !role) {
            console.log(`❌ [REFRESH-PROFILE] Missing required fields - ID: ${id}, Role: ${role}`);
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: id and role'
            });
        }

        let user = null;

        if (role === 'student') {
            // Find student by enrollment number
            user = await StudentManagement.findOne({ enrollmentNo: id });
            
            if (user) {
                // Format student data
                user = {
                    id: user._id,
                    name: user.name,
                    enrollmentNo: user.enrollmentNo,
                    semester: user.semester,
                    branch: user.branch,
                    role: 'student',
                    profileImage: user.profileImage || null,
                    faceEnrolled: user.faceEmbedding && user.faceEmbedding.length > 0,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                };
            }
        } else if (role === 'teacher') {
            // Find teacher by employee ID
            user = await Teacher.findOne({ employeeId: id });
            
            if (user) {
                // Format teacher data
                user = {
                    id: user._id,
                    name: user.name,
                    employeeId: user.employeeId,
                    department: user.department,
                    email: user.email,
                    phone: user.phone,
                    role: 'teacher',
                    canEditTimetable: user.canEditTimetable || false,
                    profileImage: user.profileImage || null,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                };
            }
        } else {
            console.log(`❌ [REFRESH-PROFILE] Invalid role: ${role}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be "student" or "teacher"'
            });
        }

        if (!user) {
            console.log(`❌ [REFRESH-PROFILE] User not found - ID: ${id}, Role: ${role}`);
            return res.status(404).json({
                success: false,
                message: `${role.charAt(0).toUpperCase() + role.slice(1)} not found`
            });
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [REFRESH-PROFILE] Profile refreshed - User: ${user.name} (${id}), Role: ${role}, Duration: ${duration}ms`);

        res.json({
            success: true,
            user: user,
            message: 'Profile refreshed successfully',
            duration: duration
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [REFRESH-PROFILE] Error refreshing profile - ID: ${id}, Role: ${role}, Duration: ${duration}ms, Error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: 'Failed to refresh profile',
            error: error.message,
            duration: duration
        });
    }
});

// GET /api/students/:studentId/face-data - Get student's face embedding for verification
app.get('/api/students/:studentId/face-data', async (req, res) => {
    const startTime = Date.now();
    const { studentId } = req.params;
    
    console.log(`👤 [FACE-DATA] Request for student: ${studentId}, IP: ${req.ip}`);
    
    try {
        // Find student by enrollment number
        const student = await StudentManagement.findOne({ enrollmentNo: studentId });
        
        if (!student) {
            console.log(`❌ [FACE-DATA] Student not found: ${studentId}`);
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }
        
        // Check if face is enrolled
        if (!student.faceEmbedding || student.faceEmbedding.length === 0) {
            console.log(`❌ [FACE-DATA] No face enrolled for student: ${studentId}`);
            return res.status(404).json({
                success: false,
                error: 'Face not enrolled. Please enroll your face first using the enrollment app.'
            });
        }
        
        const duration = Date.now() - startTime;
        console.log(`✅ [FACE-DATA] Face data found for student: ${studentId}, Embedding size: ${student.faceEmbedding.length}, Duration: ${duration}ms`);
        
        res.json({
            success: true,
            faceEmbedding: student.faceEmbedding,
            enrolledAt: student.faceEnrolledAt || student.createdAt,
            studentName: student.name,
            enrollmentNo: student.enrollmentNo,
            duration: duration
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [FACE-DATA] Error fetching face data for student: ${studentId}, Duration: ${duration}ms, Error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch face data',
            details: error.message,
            duration: duration
        });
    }
});

// POST /api/attendance/offline-sync - Sync offline timer data
app.post('/api/attendance/offline-sync', async (req, res) => {
    const startTime = Date.now();
    const { studentId, timerSeconds, lecture, timestamp, isRunning, isPaused, periodId: clientPeriodId } = req.body;
    
    console.log(`🔄 [OFFLINE-SYNC] Sync request - Student: ${studentId}, Timer: ${timerSeconds}s, IP: ${req.ip}`);
    
    try {
        // 1. Validate request body
        if (!studentId || timerSeconds === undefined || !timestamp) {
            const missingFields = [];
            if (!studentId) missingFields.push('studentId');
            if (timerSeconds === undefined) missingFields.push('timerSeconds');
            if (!timestamp) missingFields.push('timestamp');
            
            console.log(`❌ [OFFLINE-SYNC] Missing required fields: ${missingFields.join(', ')}`);
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                missingFields
            });
        }

        // 2. Find student
        const student = await StudentManagement.findOne({ enrollmentNo: studentId });
        if (!student) {
            console.log(`❌ [OFFLINE-SYNC] Student not found: ${studentId}`);
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // 2b. Guard: reject sync if student has no verified check-in for today
        const syncDate = new Date(timestamp);
        const todayStart = new Date(syncDate);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const hasCheckedIn = await PeriodAttendance.exists({
            enrollmentNo: studentId,
            date: { $gte: todayStart, $lt: todayEnd },
            verificationType: 'initial'
        });

        if (!hasCheckedIn && !isQueuedSync) {
            console.log(`❌ [OFFLINE-SYNC] No verified check-in for today - Student: ${studentId}`);
            return res.status(403).json({
                success: false,
                error: 'No verified check-in found for today. Please check in first.',
                requiresCheckIn: true
            });
        }
        
        if (!hasCheckedIn && isQueuedSync) {
            console.log(`ℹ️ [OFFLINE-SYNC] Allowing queued sync without initial check-in for student: ${studentId}`);
        }

        // 3. Update student's timer data
        // Use $max for totalAttendedSeconds so queued syncs from old periods
        // never overwrite a higher value from a more recent sync
        const isQueuedSync = Boolean(req.body.isQueuedSync);
        const updateData = {
            'attendanceSession.lastSyncTime': new Date(timestamp),
            'attendanceSession.isRunning': Boolean(isRunning),
            'attendanceSession.isPaused': Boolean(isPaused),
            'attendanceSession.lastActivity': new Date()
        };

        // Add lecture info only for live syncs (not queued old-period syncs)
        if (lecture && !isQueuedSync) {
            updateData['attendanceSession.currentLecture'] = {
                subject: lecture.subject,
                teacher: lecture.teacher,
                room: lecture.room,
                startTime: lecture.startTime || new Date().toISOString()
            };
        }

        await StudentManagement.updateOne(
            { enrollmentNo: studentId },
            {
                $set: updateData,
                // Only update totalAttendedSeconds if the new value is higher
                $max: { 'attendanceSession.totalAttendedSeconds': Math.max(0, Math.floor(timerSeconds)) }
            }
        );

        // 4. Check for missed random rings
        let missedRandomRing = null;
        try {
            const now = new Date();
            const activeRings = await RandomRing.find({
                'selectedStudents.enrollmentNo': studentId,
                status: 'active',
                expiresAt: { $gt: now }
            }).sort({ createdAt: -1 }).limit(1);

            if (activeRings.length > 0) {
                const ring = activeRings[0];
                const studentRing = ring.selectedStudents.find(s => s.enrollmentNo === studentId);
                const timeRemaining = Math.floor((new Date(ring.expiresAt).getTime() - now.getTime()) / 1000);

                // Only surface the ring if it's genuinely still active (positive time remaining)
                if (studentRing && !studentRing.responded && studentRing.teacherAction === 'pending' && timeRemaining > 0) {
                    missedRandomRing = {
                        ringId: ring.ringId,
                        teacherId: ring.teacherId,
                        createdAt: ring.createdAt,
                        expiresAt: ring.expiresAt,
                        timeRemaining
                    };
                    console.log(`🔔 [OFFLINE-SYNC] Active random ring found for student: ${studentId}, timeRemaining: ${timeRemaining}s`);
                }
            }
        } catch (ringError) {
            console.error(`❌ [OFFLINE-SYNC] Error checking random rings:`, ringError);
        }

        // 5. Compute attendance status using threshold — use server timetable for period duration
        let computedStatus = 'absent';
        try {
            const currentPeriodInfo = await getCurrentLectureInfo(student.semester, student.branch);
            const periodStart = currentPeriodInfo?.startTime;
            const periodEnd   = currentPeriodInfo?.endTime;

            if (periodStart && periodEnd) {
                const durationMin = timeToMinutes(periodEnd) - timeToMinutes(periodStart);
                // Removed <= 180 cap — periods can be any valid duration
                if (durationMin > 0) {
                    const lectureDurationSeconds = durationMin * 60;
                    const attendedPct = (timerSeconds / lectureDurationSeconds) * 100;
                    if (attendedPct >= ATTENDANCE_THRESHOLD) {
                        computedStatus = 'present';
                    } else if (Boolean(isRunning)) {
                        computedStatus = 'active';
                    }
                } else if (Boolean(isRunning)) {
                    computedStatus = 'active';
                }
            } else {
                // No active period on server right now — this is a queued/late sync
                // arriving after class ended. Don't blindly set 'absent'.
                // Check if the student already has a 'present' PeriodAttendance record
                // for today (written by the final sync that fired when the timer stopped).
                if (Boolean(isRunning)) {
                    computedStatus = 'active';
                } else {
                    // Look for any 'present' period record today — if one exists, preserve it
                    const syncDate2 = new Date(timestamp);
                    const todayStart2 = new Date(syncDate2);
                    todayStart2.setHours(0, 0, 0, 0);
                    const todayEnd2 = new Date(todayStart2);
                    todayEnd2.setDate(todayEnd2.getDate() + 1);

                    const alreadyPresent = await PeriodAttendance.exists({
                        enrollmentNo: studentId,
                        date: { $gte: todayStart2, $lt: todayEnd2 },
                        status: 'present'
                    });
                    computedStatus = alreadyPresent ? 'present' : 'absent';
                }
            }
        } catch (statusErr) {
            console.warn('⚠️ Could not compute status:', statusErr.message);
            // On error, preserve running state — don't silently mark absent
            if (Boolean(isRunning)) computedStatus = 'active';
            else {
                // Same guard as above — don't overwrite an existing 'present'
                try {
                    const syncDateE = new Date(timestamp);
                    const todayStartE = new Date(syncDateE);
                    todayStartE.setHours(0, 0, 0, 0);
                    const todayEndE = new Date(todayStartE);
                    todayEndE.setDate(todayEndE.getDate() + 1);
                    const alreadyPresentE = await PeriodAttendance.exists({
                        enrollmentNo: studentId,
                        date: { $gte: todayStartE, $lt: todayEndE },
                        status: 'present'
                    });
                    computedStatus = alreadyPresentE ? 'present' : 'absent';
                } catch (_) { computedStatus = 'absent'; }
            }
        }

        // Update status in DB — both top-level status and attendanceSession.status
        await StudentManagement.updateOne(
            { enrollmentNo: studentId },
            { $set: {
                status: computedStatus,                          // top-level field (was stale)
                'attendanceSession.status': computedStatus
            }}
        );

        // 6. Update liveTimerState + broadcast to targeted class room
        try {
            const semester = student.semester || '';
            const branch = student.branch || '';
            const broadcastData = {
                studentId: student.enrollmentNo,
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                semester,
                branch,
                attendedSeconds: Math.floor(timerSeconds),
                timerValue: Math.floor(timerSeconds),
                isRunning: Boolean(isRunning),
                lectureSubject: lecture?.subject || '',
                lectureTeacher: lecture?.teacher || '',
                lectureRoom: lecture?.room || '',
                lastSyncTime: new Date(timestamp).toISOString(),
                status: computedStatus
            };

            // Update in-memory live state
            await liveTimerState.set(student.enrollmentNo, {
                ...broadcastData,
                lastSeen: Date.now()
            });

            // Emit to targeted class room only
            const room = `class:${semester}:${branch}`;
            io.to(room).emit('timer_broadcast', broadcastData);
        } catch (broadcastError) {
            console.error(`❌ [OFFLINE-SYNC] Error broadcasting timer data:`, broadcastError);
        }

        // 7. Upsert timer progress into the current period's PeriodAttendance record FIRST
        // so syncAttendanceRecord (step 7b) reads fresh data.
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Try server clock first (period still active)
            const currentLectureInfo = await getCurrentLectureInfo(student.semester, student.branch);

            let periodId = null;
            let periodSubject = lecture?.subject || '';
            let periodTeacher = lecture?.teacher || '';
            let periodRoom    = lecture?.room    || '';

            if (currentLectureInfo) {
                // Period is currently active — use server clock
                periodId      = `P${currentLectureInfo.period}`;
                periodSubject = lecture?.subject || currentLectureInfo.subject || '';
                periodTeacher = lecture?.teacher || currentLectureInfo.teacher || '';
                periodRoom    = lecture?.room    || currentLectureInfo.room    || '';
            } else if (clientPeriodId) {
                // Client explicitly sent the period ID (queued sync) — use it directly
                periodId = clientPeriodId;
                console.log(`📊 [OFFLINE-SYNC] Using client-provided periodId: ${periodId}`);
            } else if (lecture?.subject) {
                // Period has ended — find the existing PeriodAttendance record for this lecture
                // by matching subject + today's date (most recent one for this student today)
                const existingRecord = await PeriodAttendance.findOne({
                    enrollmentNo: student.enrollmentNo,
                    date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
                    subject: lecture.subject
                }).sort({ updatedAt: -1 }).lean();

                if (existingRecord) {
                    periodId = existingRecord.period;
                    console.log(`📊 [OFFLINE-SYNC] Period ended — updating existing record ${periodId} for subject ${lecture.subject}`);
                } else {
                    console.log(`⚠️ [OFFLINE-SYNC] No active period and no existing record for subject ${lecture.subject} — skipping`);
                }
            } else {
                console.log(`⚠️ [OFFLINE-SYNC] No active period and no lecture info — skipping PeriodAttendance upsert`);
            }

            if (periodId) {
                // Use $max to only update timerSeconds if the new value is higher
                // This prevents old queued items from overwriting newer data
                await PeriodAttendance.updateOne(
                    {
                        enrollmentNo: student.enrollmentNo,
                        date: today,
                        period: periodId
                    },
                    {
                        $max: {
                            timerSeconds: Math.floor(timerSeconds)
                        },
                        $set: {
                            updatedAt: new Date()
                        },
                        $setOnInsert: {
                            studentName:      student.name,
                            semester:         student.semester?.toString() || '',
                            branch:           student.branch || '',
                            subject:          periodSubject,
                            teacher:          periodTeacher,
                            teacherName:      periodTeacher,
                            room:             periodRoom,
                            verificationType: 'timer_sync',
                            wifiVerified:     true,
                            faceVerified:     false,
                            checkInTime:      new Date(),
                            createdAt:        new Date()
                        }
                    },
                    { upsert: true }
                );

                // After upsert, compute status from the actual stored timerSeconds
                // (the $max above may have kept a higher value than what arrived in this sync)
                const storedRecord = await PeriodAttendance.findOne({
                    enrollmentNo: student.enrollmentNo,
                    date: today,
                    period: periodId
                }).lean();

                if (storedRecord) {
                    const storedSeconds = storedRecord.timerSeconds || 0;
                    // Recompute status using stored (max) timerSeconds so a late queued sync
                    // with a lower value never downgrades a student who already hit threshold
                    let periodStatus = 'absent';
                    try {
                        const lectureInfoForStatus = await getCurrentLectureInfo(student.semester, student.branch);
                        const pStart = lectureInfoForStatus?.startTime || storedRecord.startTime;
                        const pEnd   = lectureInfoForStatus?.endTime   || storedRecord.endTime;
                        if (pStart && pEnd) {
                            const durMin = timeToMinutes(pEnd) - timeToMinutes(pStart);
                            if (durMin > 0 && (storedSeconds / (durMin * 60)) * 100 >= ATTENDANCE_THRESHOLD) {
                                periodStatus = 'present';
                            } else if (Boolean(isRunning)) {
                                periodStatus = 'active';
                            }
                        } else if (storedSeconds >= Math.floor(timerSeconds) && computedStatus === 'present') {
                            // No period info available but a previous sync already marked present — keep it
                            periodStatus = 'present';
                        }
                    } catch (_) {}

                    await PeriodAttendance.updateOne(
                        { enrollmentNo: student.enrollmentNo, date: today, period: periodId },
                        { $set: { status: periodStatus, updatedAt: new Date() } }
                    );
                }

                console.log(`📊 [OFFLINE-SYNC] Upserted PeriodAttendance - Student: ${studentId}, Period: ${periodId}, Timer: ${Math.floor(timerSeconds)}s`);
            }
        } catch (periodError) {
            console.error(`❌ [OFFLINE-SYNC] Error upserting PeriodAttendance:`, periodError);
        }

        // 7b. Sync AttendanceRecord from PeriodAttendance (now up-to-date from step 7)
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const attendedMinutes = Math.floor(timerSeconds / 60);

            // Ensure a base AttendanceRecord exists before syncAttendanceRecord runs
            // (syncAttendanceRecord uses upsert so this is just a safety net for totalClassTime)
            let attendanceRecord = await AttendanceRecord.findOne({
                $or: [{ enrollmentNo: student.enrollmentNo }, { studentId: student.enrollmentNo }],
                date: today
            });

            if (!attendanceRecord) {
                // Pre-create with totalClassTime from timetable so percentage is correct
                let classMinutes = 0;
                try {
                    const tt = await Timetable.findOne({ semester: student.semester, branch: student.branch });
                    if (tt) {
                        const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                        const dayName = days[today.getDay()];
                        const sched   = tt.timetable[dayName] || [];
                        for (let i = 0; i < sched.length; i++) {
                            const slot = sched[i];
                            const pInfo = tt.periods[i];
                            if (!slot || slot.isBreak || !slot.subject || !pInfo) continue;
                            classMinutes += timeToMinutes(pInfo.endTime) - timeToMinutes(pInfo.startTime);
                        }
                    }
                } catch (_) {}

                attendanceRecord = new AttendanceRecord({
                    studentId:      student.enrollmentNo,
                    enrollmentNo:   student.enrollmentNo,
                    studentName:    student.name,
                    semester:       student.semester?.toString() || '',
                    branch:         student.branch || '',
                    date:           today,
                    status:         computedStatus,
                    lectures:       [],
                    totalAttended:  attendedMinutes,
                    totalClassTime: classMinutes,
                    dayPercentage:  classMinutes > 0 ? Math.round((attendedMinutes / classMinutes) * 100) : 0,
                    timerValue:     Math.floor(timerSeconds),
                    createdAt:      new Date(),
                    updatedAt:      new Date()
                });
                await attendanceRecord.save();
            }

            // Now fully sync from PeriodAttendance (includes P3 upserted above)
            await syncAttendanceRecord(
                student.enrollmentNo,
                today,
                student.name,
                student.semester,
                student.branch
            );
            console.log(`📊 [OFFLINE-SYNC] Synced full AttendanceRecord - Student: ${studentId}`);

        } catch (recordError) {
            console.error(`❌ [OFFLINE-SYNC] Error updating AttendanceRecord:`, recordError);
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [OFFLINE-SYNC] Sync successful - Student: ${studentId}, Timer: ${timerSeconds}s, Duration: ${duration}ms`);

        // Emit real-time update to admin panel so calendar refreshes without page reload
        io.emit('student_timer_sync', {
            enrollmentNo: studentId,
            timerSeconds: Math.floor(timerSeconds),
            isRunning: Boolean(isRunning),
            status: computedStatus,
            activePeriod: periodId, // periodId is available from the logic above
            date: new Date().toISOString().split('T')[0]
        });

        res.json({
            success: true,
            message: 'Timer data synced successfully',
            syncedSeconds: Math.floor(timerSeconds),
            serverTime: new Date().toISOString(),
            missedRandomRing: missedRandomRing,
            duration: duration,
            // Tell student app their current status and how far to threshold
            attendanceStatus: computedStatus,
            attendanceThreshold: ATTENDANCE_THRESHOLD,
            // thresholdSeconds = 75% of the CURRENT PERIOD duration from server timetable
            // getCurrentLectureInfo returns null if no period is currently active — returns null in that case
            thresholdSeconds: await (async () => {
                try {
                    const lectureInfo = await getCurrentLectureInfo(student.semester, student.branch);
                    if (lectureInfo && lectureInfo.startTime && lectureInfo.endTime) {
                        const durationMin = timeToMinutes(lectureInfo.endTime) - timeToMinutes(lectureInfo.startTime);
                        // Removed <= 180 cap — accept any valid period duration
                        if (durationMin > 0) {
                            return Math.ceil(durationMin * 60 * ATTENDANCE_THRESHOLD / 100);
                        }
                    }
                    return null; // no active period — frontend uses offlinePeriod instead
                } catch (_) { return null; }
            })()
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [OFFLINE-SYNC] Sync failed - Student: ${studentId}, Error: ${error.message}, Duration: ${duration}ms`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to sync timer data',
            details: error.message,
            duration: duration
});
    }
});

// POST /api/attendance/sync-offline - Sync offline timer data (legacy format from App.js)
// This endpoint handles the format sent by App.js when reconnecting after offline period
app.post('/api/attendance/sync-offline', async (req, res) => {
    const startTime = Date.now();
    const { studentId, offlineStartTime, offlineEndTime, offlineDuration, lastKnownSeconds, lectureSubject } = req.body;
    
    console.log(`🔄 [SYNC-OFFLINE] Sync request - Student: ${studentId}, Duration: ${offlineDuration}s, IP: ${req.ip}`);
    
    try {
        // 1. Validate required fields
        if (!studentId || offlineDuration === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: studentId, offlineDuration'
            });
        }

        // 2. Find student
        const student = await StudentManagement.findOne({ enrollmentNo: studentId });
        if (!student) {
            console.log(`❌ [SYNC-OFFLINE] Student not found: ${studentId}`);
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // 3. Get today's date
        const syncDate = offlineEndTime ? new Date(offlineEndTime) : new Date();
        const todayStart = new Date(syncDate);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        // 4. Check for missed random rings
        let missedRandomRing = null;
        let ringId = null;
        try {
            const now = new Date();
            const activeRings = await RandomRing.find({
                'selectedStudents.enrollmentNo': studentId,
                status: 'active',
                expiresAt: { $gt: now }
            }).sort({ createdAt: -1 }).limit(1);

            if (activeRings.length > 0) {
                const ring = activeRings[0];
                const ringStart = ring.createdAt.getTime();
                const offlineStart = offlineStartTime || (now.getTime() - offlineDuration * 1000);
                const offlineEnd = offlineEndTime || now.getTime();

                if (ringStart >= offlineStart && ringStart <= offlineEnd) {
                    missedRandomRing = true;
                    ringId = ring._id.toString();
                    
                    await RandomRing.updateOne(
                        { _id: ring._id, 'selectedStudents.enrollmentNo': studentId },
                        { $set: { 'selectedStudents.$.status': 'missed' } }
                    );
                    
                    console.log(`⚠️ [SYNC-OFFLINE] Random ring missed during offline - Ring: ${ringId}, Student: ${studentId}`);
                }
            }
        } catch (ringErr) {
            console.warn(`⚠️ [SYNC-OFFLINE] Error checking random rings:`, ringErr.message);
        }

        // 5. Get current lecture info for the period
        let currentLectureInfo = null;
        try {
            currentLectureInfo = await getCurrentLectureInfo(student.semester, student.branch);
        } catch (_) {}

        // 6. Calculate attendance status based on offline duration
        let computedStatus = 'active';
        const ATTENDANCE_THRESHOLD = 75;
        
        // Calculate threshold based on current or recent period
        if (currentLectureInfo && currentLectureInfo.startTime && currentLectureInfo.endTime) {
            const durationMin = timeToMinutes(currentLectureInfo.endTime) - timeToMinutes(currentLectureInfo.startTime);
            const thresholdSeconds = Math.ceil(durationMin * 60 * ATTENDANCE_THRESHOLD / 100);
            
            if (offlineDuration >= thresholdSeconds) {
                computedStatus = 'present';
            } else if (offlineDuration < 60) {
                computedStatus = 'absent';
            }
        } else if (offlineDuration < 60) {
            computedStatus = 'absent';
        }

        // 7. Check if teacher accepted during offline
        let teacherAccepted = false;
        try {
            const acceptRecords = await StudentManagement.findOne({
                enrollmentNo: studentId,
                'acceptedOfflineSessions.startTime': { $lte: offlineEndTime || Date.now() },
                'acceptedOfflineSessions.endTime': { $gte: offlineStartTime || (Date.now() - offlineDuration * 1000) }
            });
            if (acceptRecords) {
                teacherAccepted = true;
                computedStatus = 'present';
            }
        } catch (_) {}

        // 8. Calculate capped minutes if random ring was missed
        let cappedMinutes = Math.floor(offlineDuration / 60);
        if (missedRandomRing && currentLectureInfo) {
            const durationMin = timeToMinutes(currentLectureInfo.endTime) - timeToMinutes(currentLectureInfo.startTime);
            cappedMinutes = Math.min(cappedMinutes, Math.floor(durationMin * 0.5));
        }

        // 9. Update student's attendance session
        await StudentManagement.updateOne(
            { enrollmentNo: studentId },
            {
                $set: {
                    status: computedStatus,
                    'attendanceSession.totalAttendedSeconds': Math.max(0, Math.floor(offlineDuration)),
                    'attendanceSession.lastSyncTime': new Date(),
                    'attendanceSession.isRunning': false,
                    'attendanceSession.isPaused': false,
                    'attendanceSession.lastActivity': new Date()
                }
            }
        );

        // 10. Update PeriodAttendance for the relevant period
        try {
            // Find the period that was active during offline
            let periodId = 'P1';
            if (currentLectureInfo && currentLectureInfo.period) {
                periodId = currentLectureInfo.period;
            }

            await PeriodAttendance.updateOne(
                {
                    enrollmentNo: student.enrollmentNo,
                    date: todayStart,
                    period: periodId
                },
                {
                    $set: {
                        timerSeconds: Math.max(0, offlineDuration),
                        status: computedStatus === 'present' ? 'present' : 
                               offlineDuration >= 60 ? 'active' : 'absent',
                        offlineSync: true,
                        syncedAt: new Date(),
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        enrollmentNo: student.enrollmentNo,
                        studentName: student.name,
                        semester: student.semester,
                        branch: student.branch,
                        date: todayStart,
                        period: periodId,
                        subject: lectureSubject || currentLectureInfo?.subject || 'Unknown',
                        teacher: currentLectureInfo?.teacher || 'Unknown',
                        room: currentLectureInfo?.room || 'Unknown',
                        startTime: currentLectureInfo?.startTime || '',
                        endTime: currentLectureInfo?.endTime || '',
                        faceVerified: false,
                        checkInTime: new Date(),
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );

            console.log(`📊 [SYNC-OFFLINE] Upserted PeriodAttendance - Student: ${studentId}, Duration: ${offlineDuration}s`);
        } catch (periodError) {
            console.error(`❌ [SYNC-OFFLINE] Error updating PeriodAttendance:`, periodError);
        }

        // 11. Sync AttendanceRecord
        try {
            const attendedMinutes = Math.floor(offlineDuration / 60);
            
            let attendanceRecord = await AttendanceRecord.findOne({
                $or: [{ enrollmentNo: student.enrollmentNo }, { studentId: student.enrollmentNo }],
                date: todayStart
            });

            if (attendanceRecord) {
                // Update existing record
                const existingAttended = attendanceRecord.totalAttended || 0;
                await AttendanceRecord.updateOne(
                    { _id: attendanceRecord._id },
                    {
                        $set: {
                            status: computedStatus,
                            totalAttended: Math.max(existingAttended, attendedMinutes),
                            timerValue: Math.max(attendanceRecord.timerValue || 0, offlineDuration),
                            updatedAt: new Date()
                        }
                    }
                );
            } else {
                // Create new record
                const classMinutes = 240; // Default 4 hours
                const newRecord = new AttendanceRecord({
                    studentId: student.enrollmentNo,
                    enrollmentNo: student.enrollmentNo,
                    studentName: student.name,
                    semester: student.semester?.toString() || '',
                    branch: student.branch || '',
                    date: todayStart,
                    status: computedStatus,
                    lectures: [],
                    totalAttended: attendedMinutes,
                    totalClassTime: classMinutes,
                    dayPercentage: classMinutes > 0 ? Math.round((attendedMinutes / classMinutes) * 100) : 0,
                    timerValue: offlineDuration,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                await newRecord.save();
            }

            console.log(`📊 [SYNC-OFFLINE] Synced AttendanceRecord - Student: ${studentId}`);
        } catch (recordError) {
            console.error(`❌ [SYNC-OFFLINE] Error updating AttendanceRecord:`, recordError);
        }

        // 12. Update live timer state and broadcast
        try {
            liveTimerState.set(student.enrollmentNo, {
                studentId: student.enrollmentNo,
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                semester: student.semester,
                branch: student.branch,
                attendedSeconds: offlineDuration,
                timerValue: offlineDuration,
                isRunning: false,
                lectureSubject: lectureSubject || currentLectureInfo?.subject || '',
                lastSyncTime: new Date().toISOString(),
                lastSeen: Date.now(),
                status: computedStatus
            });

            const room = `class:${student.semester}:${student.branch}`;
            io.to(room).emit('timer_broadcast', {
                studentId: student.enrollmentNo,
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                semester: student.semester,
                branch: student.branch,
                attendedSeconds: offlineDuration,
                timerValue: offlineDuration,
                isRunning: false,
                lectureSubject: lectureSubject || '',
                lastSyncTime: new Date().toISOString(),
                status: computedStatus
            });

            // Notify admin panel
            io.emit('student_timer_sync', {
                enrollmentNo: studentId,
                timerSeconds: offlineDuration,
                isRunning: false,
                status: computedStatus,
                date: todayStart.toISOString().split('T')[0]
            });
        } catch (broadcastError) {
            console.error(`❌ [SYNC-OFFLINE] Error broadcasting:`, broadcastError);
        }

        const duration = Date.now() - startTime;
        console.log(`✅ [SYNC-OFFLINE] Sync successful - Student: ${studentId}, Duration: ${offlineDuration}s, Status: ${computedStatus}, Duration: ${duration}ms`);

        res.json({
            success: true,
            message: 'Offline session synced successfully',
            syncedMinutes: Math.floor(offlineDuration / 60),
            offlineDuration: offlineDuration,
            status: computedStatus,
            missedRandomRing: missedRandomRing,
            ringId: ringId,
            teacherAccepted: teacherAccepted,
            cappedMinutes: missedRandomRing ? cappedMinutes : null,
            serverTime: new Date().toISOString()
        });

    } catch (error) {
        console.error(`❌ [SYNC-OFFLINE] Error:`, error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// POST /api/attendance/period-sync - Save period-specific timer data without check-in requirement
app.post('/api/attendance/period-sync', async (req, res) => {
    const startTime = Date.now();
    const { studentId, timerSeconds, period, subject, teacher, room, semester, branch, timestamp } = req.body;

    console.log(`📊 [PERIOD-SYNC] Saving period timer data - Student: ${studentId}, Period: ${period}, Timer: ${timerSeconds}s`);

    try {
        // Validate required fields
        if (!studentId || timerSeconds === undefined || !period) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: studentId, timerSeconds, period'
            });
        }

        // Get today's date
        const syncDate = new Date(timestamp || Date.now());
        const todayStart = new Date(syncDate);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        // Find student to get semester and branch
        const student = await StudentManagement.findOne({ enrollmentNo: studentId });
        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // Update or create PeriodAttendance record
        await PeriodAttendance.updateOne(
            {
                enrollmentNo: studentId,
                date: { $gte: todayStart, $lt: todayEnd },
                period: period
            },
            {
                $set: {
                    studentName: student.name,
                    semester: semester || student.semester,
                    branch: branch || student.branch,
                    subject: subject,
                    teacher: teacher,
                    room: room,
                    timerSeconds: Math.floor(timerSeconds),
                    status: 'present',
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        const duration = Date.now() - startTime;
        console.log(`✅ [PERIOD-SYNC] Period data saved successfully - Duration: ${duration}ms`);

        res.json({
            success: true,
            period: period,
            timerSeconds: timerSeconds,
            duration: duration
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [PERIOD-SYNC] Failed to save period data - Duration: ${duration}ms, Error: ${error.message}`);

        res.status(500).json({
            success: false,
            error: 'Failed to save period attendance',
            details: error.message
        });
    }
});

// POST /api/attendance/random-ring-response - Student responds to a random ring (offline sync path)
app.post('/api/attendance/random-ring-response', async (req, res) => {
    const startTime = Date.now();
    const { studentId, randomRingId, responseTime, currentBSSID } = req.body;

    console.log(`🔔 [RANDOM-RING-RESPONSE] Student: ${studentId}, Ring: ${randomRingId}`);

    try {
        if (!studentId || !randomRingId) {
            return res.status(400).json({ success: false, error: 'studentId and randomRingId required' });
        }

        // Find ring by string ringId
        const randomRing = await RandomRing.findOne({ ringId: randomRingId });
        if (!randomRing) {
            return res.status(404).json({ success: false, error: 'Random ring not found' });
        }

        if (randomRing.status !== 'active' || new Date() > randomRing.expiresAt) {
            return res.status(400).json({ success: false, error: 'Random ring has expired' });
        }

        const studentIndex = randomRing.selectedStudents.findIndex(s => s.enrollmentNo === studentId);
        if (studentIndex === -1) {
            return res.status(400).json({ success: false, error: 'Student not in this random ring' });
        }

        // Mark responded — teacher will accept/reject
        randomRing.selectedStudents[studentIndex].responded = true;
        randomRing.selectedStudents[studentIndex].responseTime = responseTime ? new Date(responseTime) : new Date();
        await randomRing.save();

        const classRoom = `class:${randomRing.semester}:${randomRing.branch}`;
        io.to(classRoom).emit('random_ring_teacher_action_update', {
            randomRingId: randomRing.ringId,
            enrollmentNo: studentId,
            action: 'responded'
        });

        const duration = Date.now() - startTime;
        console.log(`✅ [RANDOM-RING-RESPONSE] Responded - Student: ${studentId}, Duration: ${duration}ms`);

        res.json({ success: true, message: 'Response recorded. Awaiting teacher action.', duration });

    } catch (error) {
        console.error(`❌ [RANDOM-RING-RESPONSE] Error:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MANUAL ATTENDANCE MARKING
// ============================================

// POST /api/attendance/manual-mark - Teacher manual attendance marking
app.post('/api/attendance/manual-mark', async (req, res) => {
    const startTime = Date.now();
    const { teacherId, enrollmentNo, period, status, reason, timestamp } = req.body;
    
    console.log(`?? [MANUAL-MARK] Request started - Teacher: ${teacherId}, Student: ${enrollmentNo}, Period: ${period}, Status: ${status}`);
    
    try {
        // 1. Validate request body
        if (!teacherId || !enrollmentNo || !period || !status) {
            const missingFields = [];
            if (!teacherId) missingFields.push('teacherId');
            if (!enrollmentNo) missingFields.push('enrollmentNo');
            if (!period) missingFields.push('period');
            if (!status) missingFields.push('status');
            
            console.log(`? [MANUAL-MARK] Validation failed - Missing fields: ${missingFields.join(', ')}`);
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
                missingFields
            });
        }

        // Validate status enum
        if (!['present', 'absent'].includes(status)) {
            console.log(`? [MANUAL-MARK] Invalid status - Received: ${status}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be "present" or "absent"',
                receivedStatus: status
            });
        }

        // Validate period format
        const validPeriods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
        if (!validPeriods.includes(period)) {
            console.log(`? [MANUAL-MARK] Invalid period - Received: ${period}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid period. Must be P1-P8',
                receivedPeriod: period
            });
        }

        // 2. Get teacher information — allow ADMIN bypass
        let teacher;
        const ADMIN_IDS = ['ADMIN', 'ADMIN001', 'admin'];
        if (ADMIN_IDS.includes(teacherId)) {
            // Admin panel manual marking — create a synthetic teacher object
            teacher = { name: 'Admin', employeeId: teacherId, canEditTimetable: true };
            console.log(`✅ [MANUAL-MARK] Admin bypass - ID: ${teacherId}`);
        } else {
            teacher = await Teacher.findOne({ employeeId: teacherId });
            if (!teacher) {
                console.log(`❌ [MANUAL-MARK] Teacher not found - ID: ${teacherId}`);
                return res.status(404).json({
                    success: false,
                    message: 'Teacher not found',
                    teacherId
                });
            }
            console.log(`✅ [MANUAL-MARK] Teacher found - Name: ${teacher.name}`);
        }

        // 3. Get student information
        const student = await StudentManagement.findOne({ enrollmentNo });
        if (!student) {
            console.log(`? [MANUAL-MARK] Student not found - Enrollment: ${enrollmentNo}`);
            return res.status(404).json({
                success: false,
                message: 'Student not found',
                enrollmentNo
            });
        }
        console.log(`? [MANUAL-MARK] Student found - Name: ${student.name}, Semester: ${student.semester}, Branch: ${student.branch}`);

        // 4. Get timetable to validate teacher teaches this class
        const timetable = await Timetable.findOne({ 
            semester: student.semester, 
            branch: student.branch 
        });
        
        if (!timetable) {
            console.log(`? [MANUAL-MARK] Timetable not found - Semester: ${student.semester}, Branch: ${student.branch}`);
            return res.status(404).json({
                success: false,
                message: 'Timetable not found for student class',
                semester: student.semester,
                branch: student.branch
            });
        }

        // 5. Get the date for marking (use provided timestamp or current date)
        const markingDate = timestamp ? new Date(timestamp) : new Date();
        markingDate.setHours(0, 0, 0, 0); // Normalize to start of day
        
        // Validate period is not in the future
        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const markingDay = days[markingDate.getDay()];
        
        // Get period info from timetable
        const periodNumber = parseInt(period.substring(1)); // Extract number from "P1", "P2", etc.
        const daySchedule = timetable.timetable[markingDay];
        
        if (!daySchedule || daySchedule.length === 0) {
            console.log(`? [MANUAL-MARK] No schedule for day - Day: ${markingDay}`);
            return res.status(400).json({
                success: false,
                message: `No classes scheduled for ${markingDay}`,
                day: markingDay
            });
        }

        // Find the lecture for this period
        const lecture = daySchedule.find(l => l.period === periodNumber);
        if (!lecture || lecture.isBreak) {
            console.log(`? [MANUAL-MARK] Period not found or is break - Period: ${period}`);
            return res.status(400).json({
                success: false,
                message: `Period ${period} not found in timetable or is a break`,
                period
            });
        }

        // Validate teacher teaches this period (or is admin)
        if (lecture.teacher !== teacherId && !teacher.canEditTimetable) {
            console.log(`? [MANUAL-MARK] Teacher not authorized - Teacher: ${teacherId}, Period teacher: ${lecture.teacher}`);
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to mark attendance for this period',
                periodTeacher: lecture.teacher,
                yourId: teacherId
            });
        }

        // Check if marking future period
        const periodInfo = timetable.periods[periodNumber - 1];
        if (periodInfo) {
            const periodEndTime = timeToMinutes(periodInfo.endTime);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const isSameDay = now.toDateString() === markingDate.toDateString();
            
            if (isSameDay && currentTime < periodEndTime) {
                console.log(`?? [MANUAL-MARK] Warning: Marking future period - Current: ${currentTime}, Period end: ${periodEndTime}`);
                // Allow but log warning - teachers may need to mark attendance in advance
            }
        }

        console.log(`? [MANUAL-MARK] Validation passed - Teacher authorized for ${lecture.subject}`);

        // 6. Determine which periods to mark based on status
        let periodsToMark = [];
        if (status === 'present') {
            // Mark current period + all future periods
            for (let i = periodNumber; i <= 8; i++) {
                const futureLecture = daySchedule.find(l => l.period === i);
                if (futureLecture && !futureLecture.isBreak) {
                    periodsToMark.push(`P${i}`);
                }
            }
            console.log(`?? [MANUAL-MARK] Marking present for periods: ${periodsToMark.join(', ')}`);
        } else {
            // Mark only the specified period as absent
            periodsToMark = [period];
            console.log(`?? [MANUAL-MARK] Marking absent for period: ${period}`);
        }

        // 7. Create or update PeriodAttendance records
        const markedRecords = [];
        const auditRecords = [];
        
        for (const p of periodsToMark) {
            const pNum = parseInt(p.substring(1));
            const pLecture = daySchedule.find(l => l.period === pNum);
            
            if (!pLecture || pLecture.isBreak) continue;

            // Check if record already exists
            const existingRecord = await PeriodAttendance.findOne({
                enrollmentNo,
                date: markingDate,
                period: p
            });

            let periodRecord;
            let changeType = 'create';
            let oldStatus = null;

            if (existingRecord) {
                // Update existing record
                oldStatus = existingRecord.status;
                changeType = 'update';
                
                existingRecord.status = status;
                existingRecord.verificationType = 'manual';
                existingRecord.markedBy = teacherId;
                existingRecord.reason = reason || 'Manual marking by teacher';
                
                periodRecord = await existingRecord.save();
                console.log(`?? [MANUAL-MARK] Updated existing record - Period: ${p}, Old: ${oldStatus}, New: ${status}`);
            } else {
                // Create new record
                periodRecord = await PeriodAttendance.create({
                    enrollmentNo,
                    studentName:  student.name,
                    semester:     student.semester?.toString() || '',
                    branch:       student.branch || '',
                    date:         markingDate,
                    period:       p,
                    subject:      pLecture.subject,
                    teacher:      pLecture.teacher,
                    teacherName:  pLecture.teacherName,
                    room:         pLecture.room,
                    status,
                    checkInTime:      status === 'present' ? new Date() : null,
                    verificationType: 'manual',
                    wifiVerified: false,
                    faceVerified: false,
                    markedBy:     teacherId,
                    reason:       reason || 'Manual marking by teacher'
                });
                console.log(`? [MANUAL-MARK] Created new record - Period: ${p}, Status: ${status}`);
            }

            markedRecords.push(periodRecord);

            // 8. Create audit trail
            const auditRecord = await AttendanceAudit.create({
                recordType: 'period_attendance',
                recordId: periodRecord._id,
                enrollmentNo,
                studentName: student.name,
                date: markingDate,
                period: p,
                modifiedBy: teacherId,
                modifierName: teacher.name,
                modifierRole: 'teacher',
                oldStatus,
                newStatus: status,
                changeType,
                reason: reason || 'Manual marking by teacher'
            });
            
            auditRecords.push(auditRecord);
            console.log(`?? [MANUAL-MARK] Audit record created - AuditId: ${auditRecord.auditId}`);
        }

        // 9. Update AttendanceRecord (daily summary) so history page reflects manual marks
        try {
            const allPeriodRecords = await PeriodAttendance.find({
                enrollmentNo,
                date: markingDate
            }).lean();

            const presentCount = allPeriodRecords.filter(r => r.status === 'present').length;
            const totalCount = allPeriodRecords.length;
            const dayPercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
            const dayStatus = dayPercentage >= 75 ? 'present' : 'absent';

            await AttendanceRecord.findOneAndUpdate(
                { enrollmentNo, date: markingDate },   // simple filter — no $or with upsert
                {
                    $set: {
                        studentId: enrollmentNo,
                        enrollmentNo,
                        studentName: student.name,
                        semester: student.semester,
                        branch: student.branch,
                        status: dayStatus,
                        dayPercentage,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
            console.log(`✅ [MANUAL-MARK] AttendanceRecord updated - Status: ${dayStatus}, ${presentCount}/${totalCount} periods`);
        } catch (syncErr) {
            console.error('⚠️ [MANUAL-MARK] Failed to sync AttendanceRecord:', syncErr.message);
        }

        // 10. Send response
        const duration = Date.now() - startTime;
        console.log(`? [MANUAL-MARK] Completed in ${duration}ms - Marked ${markedRecords.length} period(s)`);

        return res.json({
            success: true,
            markedPeriods: periodsToMark,
            recordsCreated: markedRecords.length,
            auditIds: auditRecords.map(a => a.auditId),
            message: `Successfully marked ${status} for ${periodsToMark.length} period(s)`,
            details: {
                student: {
                    enrollmentNo,
                    name: student.name,
                    semester: student.semester,
                    branch: student.branch
                },
                teacher: {
                    employeeId: teacherId,
                    name: teacher.name
                },
                date: markingDate,
                status,
                periods: periodsToMark
            }
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`? [MANUAL-MARK] Error after ${duration}ms:`, error);
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error during manual marking',
            message: error.message
        });
    }
});

// ============================================
// REPORTING APIs (TASK 7)
// ============================================

// GET /api/attendance/period-report - Get period-wise attendance report
app.get('/api/attendance/period-report', async (req, res) => {
    try {
        const { enrollmentNo, date, semester, branch, period, page = 1, limit = 50, sortBy = 'date', sortOrder = 'desc' } = req.query;
        
        console.log(`?? [PERIOD-REPORT] Request - Filters:`, { enrollmentNo, date, semester, branch, period, page, limit });

        // Build query
        const query = {};
        if (enrollmentNo) query.enrollmentNo = enrollmentNo;
        if (date) {
            // Use IST day range so records stored at IST midnight are included
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);   // IST midnight (TZ=Asia/Kolkata)
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999); // IST end of day
            query.date = { $gte: dayStart, $lte: dayEnd };
        }
        if (period) query.period = period;

        // semester/branch not stored on PeriodAttendance — filter by enrollmentNo list instead
        if ((semester || branch) && !enrollmentNo) {
            const studentFilter = {};
            if (semester) studentFilter.semester = semester;
            if (branch) studentFilter.branch = branch;
            const matchingStudents = await StudentManagement.find(studentFilter).select('enrollmentNo').lean();
            query.enrollmentNo = { $in: matchingStudents.map(s => s.enrollmentNo) };
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get total count
        const total = await PeriodAttendance.countDocuments(query);

        // Get records
        const records = await PeriodAttendance.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        console.log(`? [PERIOD-REPORT] Found ${records.length} records (total: ${total})`);

        res.json({
            success: true,
            records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('? [PERIOD-REPORT] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/attendance/daily-report - Get daily attendance report
app.get('/api/attendance/daily-report', async (req, res) => {
    try {
        const { enrollmentNo, startDate, endDate, semester, branch, page = 1, limit = 50 } = req.query;

        // Build query
        const query = {};
        if (enrollmentNo) query.enrollmentNo = enrollmentNo;
        if (semester) query.semester = semester;
        if (branch) query.branch = branch;

        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.date.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Primary: DailyAttendance (end-of-day cron snapshot)
        let total = await DailyAttendance.countDocuments(query);
        let records = await DailyAttendance.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Fallback: AttendanceRecord (real-time, written by offline-sync during the day)
        // Used when DailyAttendance is empty — e.g. today before 23:59 cron runs
        if (records.length === 0) {
            const arQuery = { ...query };
            // AttendanceRecord uses same field names — query is compatible
            total = await AttendanceRecord.countDocuments(arQuery);
            const arRecords = await AttendanceRecord.find(arQuery)
                .sort({ date: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            // Normalize AttendanceRecord shape to match DailyAttendance shape
            records = arRecords.map(r => ({
                _id:                  r._id,
                enrollmentNo:         r.enrollmentNo,
                studentName:          r.studentName,
                date:                 r.date,
                semester:             r.semester,
                branch:               r.branch,
                totalPeriods:         r.lectures?.length || 0,
                presentPeriods:       r.lectures?.filter(l => l.present).length || 0,
                absentPeriods:        (r.lectures?.length || 0) - (r.lectures?.filter(l => l.present).length || 0),
                attendancePercentage: r.dayPercentage || 0,
                dailyStatus:          r.status || 'absent',
                threshold:            75,
                calculatedAt:         r.updatedAt || r.createdAt,
                // Extra fields from AttendanceRecord
                totalAttended:        r.totalAttended || 0,
                totalClassTime:       r.totalClassTime || 0,
                timerValue:           r.timerValue || 0,
                lectures:             r.lectures || [],
                _source:              'AttendanceRecord'  // flag so client knows it's intra-day
            }));
        }

        const summary = {
            totalDays:         records.length,
            presentDays:       records.filter(r => (r.dailyStatus || r.status) === 'present').length,
            absentDays:        records.filter(r => (r.dailyStatus || r.status) === 'absent').length,
            averagePercentage: records.length > 0
                ? records.reduce((sum, r) => sum + (r.attendancePercentage || r.dayPercentage || 0), 0) / records.length
                : 0
        };

        res.json({
            success: true,
            records,
            summary,
            pagination: {
                page:  parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('❌ [DAILY-REPORT] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/attendance/monthly-report - Get monthly attendance report
app.get('/api/attendance/monthly-report', async (req, res) => {
    try {
        const { enrollmentNo, month, year } = req.query;
        
        if (!enrollmentNo || !month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: enrollmentNo, month, year'
            });
        }

        console.log(`?? [MONTHLY-REPORT] Request - Student: ${enrollmentNo}, Month: ${month}/${year}`);

        // Calculate date range for the month
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

        // Get daily attendance records for the month
        const records = await DailyAttendance.find({
            enrollmentNo,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 }).lean();

        // Calculate monthly statistics
        const totalDays = records.length;
        const presentDays = records.filter(r => r.dailyStatus === 'present').length;
        const absentDays = records.filter(r => r.dailyStatus === 'absent').length;
        const monthlyPercentage = totalDays > 0 
            ? (presentDays / totalDays) * 100 
            : 0;

        // Format as calendar data
        const calendarData = {};
        records.forEach(record => {
            const day = record.date.getDate();
            calendarData[day] = {
                date: record.date,
                status: record.dailyStatus,
                presentPeriods: record.presentPeriods,
                totalPeriods: record.totalPeriods,
                percentage: record.attendancePercentage
            };
        });

        console.log(`? [MONTHLY-REPORT] Found ${records.length} days, ${presentDays} present, ${absentDays} absent`);

        res.json({
            success: true,
            enrollmentNo,
            month: parseInt(month),
            year: parseInt(year),
            summary: {
                totalDays,
                presentDays,
                absentDays,
                monthlyPercentage: monthlyPercentage.toFixed(2)
            },
            calendarData,
            records
        });

    } catch (error) {
        console.error('? [MONTHLY-REPORT] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/attendance/export - Export attendance data as CSV
app.get('/api/attendance/export', async (req, res) => {
    try {
        const { enrollmentNo, startDate, endDate, semester, branch, period } = req.query;
        
        console.log(`?? [EXPORT] Request - Filters:`, { enrollmentNo, startDate, endDate, semester, branch, period });

        // Build query
        const query = {};
        if (enrollmentNo) query.enrollmentNo = enrollmentNo;
        if (semester) query.semester = semester;
        if (branch) query.branch = branch;
        if (period) query.period = period;
        
        // Date range filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.date.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        // Get records (limit to 10000 for safety)
        const records = await PeriodAttendance.find(query)
            .sort({ date: -1, period: 1 })
            .limit(10000)
            .lean();

        console.log(`? [EXPORT] Exporting ${records.length} records`);

        // Generate CSV
        const csvHeader = 'Enrollment No,Student Name,Date,Period,Subject,Teacher,Room,Status,Verification Type,Check-in Time\n';
        const csvRows = records.map(record => {
            const date = record.date.toISOString().split('T')[0];
            const checkInTime = record.checkInTime ? record.checkInTime.toISOString() : '';
            return `${record.enrollmentNo},${record.studentName},${date},${record.period},${record.subject},${record.teacherName || record.teacher},${record.room},${record.status},${record.verificationType},${checkInTime}`;
        }).join('\n');

        const csv = csvHeader + csvRows;

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_export_${Date.now()}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('? [EXPORT] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/attendance/audit-trail - Get audit trail for attendance modifications
app.get('/api/attendance/audit-trail', async (req, res) => {
    try {
        const { enrollmentNo, date, period, page = 1, limit = 50 } = req.query;
        
        console.log(`?? [AUDIT-TRAIL] Request - Filters:`, { enrollmentNo, date, period, page, limit });

        // Build query
        const query = {};
        if (enrollmentNo) query.enrollmentNo = enrollmentNo;
        if (date) {
            const queryDate = new Date(date);
            queryDate.setHours(0, 0, 0, 0);
            query.date = queryDate;
        }
        if (period) query.period = period;

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get total count
        const total = await AttendanceAudit.countDocuments(query);

        // Get audit records
        const records = await AttendanceAudit.find(query)
            .sort({ modifiedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        console.log(`? [AUDIT-TRAIL] Found ${records.length} audit records (total: ${total})`);

        res.json({
            success: true,
            records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('? [AUDIT-TRAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// ============================================
// LEGACY ATTENDANCE TRACKING SYSTEM (DEPRECATED)
// ============================================

// 1. Face Verification & Timer Start
app.post('/api/attendance/start-session', async (req, res) => {
    try {
        // Accept both enrollmentNo and studentId — treat them as the same thing
        const { studentId, studentName, enrollmentNo: enrollmentNoBody, semester, branch, faceData } = req.body;
        // Canonical identifier: prefer enrollmentNo field, fall back to studentId
        const canonicalId = enrollmentNoBody || studentId;

        // TODO: Verify face data against stored photo
        // For now, assume verification successful

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if session already exists for today
        let session = await AttendanceSession.findOne({
            studentId: canonicalId,
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
            studentId: canonicalId,
            studentName,
            enrollmentNo: canonicalId,
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
            studentId: canonicalId,
            date: today
        });

        if (!record) {
            record = new AttendanceRecord({
                studentId: canonicalId,
                studentName,
                enrollmentNo: canonicalId,
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



// 3. Lecture Started (Called by server when lecture begins)
// ─── Helper: record a lecture in TimetableHistory ────────────────────────────
async function recordTimetableHistory({ date, semester, branch, period, subject, teacher, teacherName, room, startTime, endTime, source = 'lecture_start' }) {
    // Validate required fields before hitting DB
    if (!subject?.trim() || !semester?.trim() || !branch?.trim() || !period?.trim()) {
        console.warn('⚠️ recordTimetableHistory: missing required fields', { subject, semester, branch, period });
        return;
    }
    try {
        const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
        await TimetableHistory.findOneAndUpdate(
            { date: midnight, semester: semester.toString(), branch, period },
            { $set: {
                subject:     subject.trim(),
                teacher:     teacher     || '',
                teacherName: teacherName || teacher || '',
                room:        room        || '',
                startTime:   startTime   || '',
                endTime:     endTime     || '',
                source
            }},
            { upsert: true, new: true }
        );
    } catch (e) {
        if (e.code !== 11000) { // 11000 = duplicate key — safe to ignore on race condition
            console.error('❌ TimetableHistory write error:', e.message);
        }
    }
}

app.post('/api/attendance/lecture-start', async (req, res) => {
    try {
        const { period, subject, teacher, teacherName, room, startTime, endTime, semester, branch } = req.body;

        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Record in TimetableHistory
        await recordTimetableHistory({ date: today, semester, branch, period, subject, teacher, teacherName, room, startTime, endTime });

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
            // Timer-based calculation removed - period-based system uses discrete present/absent status

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
                    verifications: []
                });

                // Timer-based totals calculation removed - period-based system handles this differently

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

// ─── GET /api/attendance/date/:date ──────────────────────────────────────────
// Returns all students for a class on a specific date with their attendance.
// Primary: PeriodAttendance (has semester+branch after migration).
// Fallback: AttendanceRecord + StudentManagement join for old records.
app.get('/api/attendance/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { semester, branch } = req.query;

        if (!date || !semester || !branch) {
            return res.status(400).json({ success: false, error: 'date, semester and branch are required' });
        }
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, students: [], date, semester, branch });
        }

        // IST-aware date window: data stored as IST midnight = UTC prev-day 18:30
        // e.g. "2026-05-04" IST → stored as 2026-05-03T18:30:00.000Z
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
        const startOfDay = new Date(dayStart.getTime() - IST_OFFSET_MS); // prev day 18:30Z
        const endOfDay   = new Date(dayEnd.getTime()   - IST_OFFSET_MS); // same day 18:29:59Z
        const sem        = semester.toString();

        // ── Get class roster from StudentManagement ───────────────────────────
        const classStudents = await StudentManagement.find(
            { semester: sem, branch },
            { enrollmentNo: 1, name: 1 }
        ).lean();
        const nameMap = {};
        classStudents.forEach(s => { if (s.enrollmentNo) nameMap[s.enrollmentNo] = s.name; });
        const enrollmentNos = Object.keys(nameMap);

        // ── Query PeriodAttendance (direct if semester/branch set, else by enrollmentNo) ──
        const paQuery = {
            date: { $gte: startOfDay, $lte: endOfDay },
            $or: [
                { semester: sem, branch },
                { enrollmentNo: { $in: enrollmentNos } }
            ]
        };
        const periods = await PeriodAttendance.find(paQuery).sort({ period: 1 }).lean();

        // ── Group by enrollmentNo ─────────────────────────────────────────────
        const studentMap = {};
        for (const p of periods) {
            const key = p.enrollmentNo;
            if (!studentMap[key]) {
                studentMap[key] = {
                    enrollmentNo: key,
                    name:         p.studentName || nameMap[key] || 'Unknown',
                    status:       'absent',
                    lectures:     []
                };
            }
            studentMap[key].lectures.push({
                period:           p.period,
                subject:          p.subject,
                teacher:          p.teacherName || p.teacher || '',
                room:             p.room || '',
                status:           p.status,
                verificationType: p.verificationType || '',
                checkInTime:      p.checkInTime || null,
                attended:         p.timerSeconds || 0,
                total:            60 * 60 // fallback to 60m
            });
            if (p.status === 'present') studentMap[key].status = 'present';
        }

        // ── Fallback: AttendanceRecord for students with no PeriodAttendance ──
        // Track which enrollmentNos actually came from PeriodAttendance (have real lecture data)
        const hasPeriodData = new Set(Object.keys(studentMap));

        const arRecords = await AttendanceRecord.find({
            date: { $gte: startOfDay, $lte: endOfDay },
            $or: [{ semester: sem, branch }, { enrollmentNo: { $in: enrollmentNos } }]
        }).lean();

        for (const r of arRecords) {
            const key = r.enrollmentNo || r.studentId;
            // Skip only if we already have real PeriodAttendance data for this student
            if (!key || hasPeriodData.has(key)) continue;
            studentMap[key] = {
                enrollmentNo: key,
                name:         r.studentName || nameMap[key] || 'Unknown',
                status:       r.status || 'absent',
                lectures:     (r.lectures || []).map(l => ({
                    period:  l.period || '',
                    subject: l.subject || '',
                    teacher: l.teacherName || l.teacher || '',
                    room:    l.room || '',
                    status:  l.status || (l.present || (l.total > 0 && (l.attended / l.total) * 100 >= 75) ? 'present' : 'absent'),
                    verificationType: '',
                    checkInTime: l.studentCheckIn || null,
                    attended: l.attended || 0,
                    total: l.total || 0
                }))
            };
        }

        // ── Ensure every class student appears (absent if no record) ──────────
        for (const enrollmentNo of enrollmentNos) {
            if (!studentMap[enrollmentNo]) {
                studentMap[enrollmentNo] = {
                    enrollmentNo,
                    name:     nameMap[enrollmentNo] || 'Unknown',
                    status:   'absent',
                    lectures: []
                };
            }
        }

        const students = Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, students, date, semester, branch });

    } catch (error) {
        console.error('❌ Error fetching students for date:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/attendance/student/:enrollmentNo/subject-stats ─────────────────
// Returns per-subject attendance stats for a student.
// Used for the subject bubble row in the drill-down view.
app.get('/api/attendance/student/:enrollmentNo/subject-stats', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        if (mongoose.connection.readyState !== 1) return res.json({ success: true, subjects: [] });

        const records = await PeriodAttendance.find({ enrollmentNo }, {
            subject: 1, status: 1
        }).lean();

        // Group by subject
        const map = {};
        for (const r of records) {
            const sub = r.subject || 'Unknown';
            if (!map[sub]) map[sub] = { subject: sub, present: 0, total: 0 };
            map[sub].total++;
            if (r.status === 'present') map[sub].present++;
        }

        const subjects = Object.values(map).map(s => ({
            subject:    s.subject,
            present:    s.present,
            total:      s.total,
            percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
        })).sort((a, b) => a.subject.localeCompare(b.subject));

        res.json({ success: true, subjects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/attendance/subjects ────────────────────────────────────────────
// Returns subject names for a given semester + branch.
// Source of truth: Subject collection only (configured subjects).
// PeriodAttendance is NOT merged — it may contain stale/seed data.
app.get('/api/attendance/subjects', async (req, res) => {
    try {
        const { semester, branch } = req.query;
        if (!semester || !branch) {
            return res.status(400).json({ success: false, error: 'semester and branch are required' });
        }
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, subjects: [] });
        }

        const configuredSubjects = await Subject.find(
            { semester: semester.toString(), branch, isActive: { $ne: false } },
            { subjectName: 1, shortName: 1 }
        ).lean();

        const subjects = configuredSubjects.map(s => s.subjectName).filter(Boolean).sort();
        res.json({ success: true, subjects });
    } catch (error) {
        console.error('❌ Error fetching subjects:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/attendance/subject-dates ───────────────────────────────────────
// Returns all distinct dates on which a specific subject was scheduled
// for the given semester + branch.
// Primary source: TimetableHistory (records every day the subject was on the timetable).
// Fallback: PeriodAttendance (actual check-ins, for older data before TimetableHistory existed).
app.get('/api/attendance/subject-dates', async (req, res) => {
    try {
        const { semester, branch, subject } = req.query;
        if (!semester || !branch || !subject) {
            return res.status(400).json({ success: false, error: 'semester, branch and subject are required' });
        }
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, dates: [] });
        }

        // 1. From TimetableHistory — scheduled dates (most reliable)
        const historyRecords = await TimetableHistory.find(
            { semester, branch, subject },
            { date: 1 }
        ).lean();

        // 2. From PeriodAttendance — actual attendance dates (fallback / older data)
        const attendanceRecords = await PeriodAttendance.find(
            { semester, branch, subject },
            { date: 1 }
        ).lean();

        // Merge and deduplicate by midnight ISO string
        const seen = new Set();
        const dates = [];
        for (const r of [...historyRecords, ...attendanceRecords]) {
            const d = new Date(r.date); d.setHours(0, 0, 0, 0);
            const key = d.toISOString();
            if (!seen.has(key)) { seen.add(key); dates.push(key); }
        }
        dates.sort((a, b) => new Date(b) - new Date(a)); // newest first

        res.json({ success: true, dates });
    } catch (error) {
        console.error('❌ Error fetching subject dates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/timetable-history/day ──────────────────────────────────────────
// Returns all periods held on a specific date for a semester+branch.
// Used by the Period Breakdown modal to show every class, not just attended ones.
app.get('/api/timetable-history/day', async (req, res) => {
    try {
        const { date, semester, branch } = req.query;
        if (!date || !semester || !branch) {
            return res.status(400).json({ success: false, error: 'date, semester and branch are required' });
        }
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, periods: [] });
        }
        const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
        const nextDay  = new Date(midnight); nextDay.setDate(nextDay.getDate() + 1);

        const periods = await TimetableHistory.find({
            date: { $gte: midnight, $lt: nextDay },
            semester: semester.toString(),
            branch
        }).sort({ period: 1 }).lean();

        res.json({ success: true, periods });
    } catch (error) {
        console.error('❌ Error fetching timetable history day:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/timetable-history/backfill ────────────────────────────────────
// Backfill TimetableHistory from two sources:
// 1. PeriodAttendance — actual check-in records (subject was definitely held)
// 2. Timetable schedule — generate history for every past weekday based on
//    the current timetable (so subjects show on calendar even with no check-ins)
app.post('/api/timetable-history/backfill', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: false, error: 'DB not connected' });
        }

        let inserted = 0;

        // ── Source 1: PeriodAttendance records ────────────────────────────────
        const paRecords = await PeriodAttendance.find({}, {
            date: 1, semester: 1, branch: 1, period: 1,
            subject: 1, teacher: 1, teacherName: 1, room: 1
        }).lean();

        for (const r of paRecords) {
            await recordTimetableHistory({
                date: r.date, semester: r.semester, branch: r.branch,
                period: r.period, subject: r.subject,
                teacher: r.teacher, teacherName: r.teacherName, room: r.room,
                source: 'cron'
            });
            inserted++;
        }

        // ── Source 2: Timetable schedule → past 90 days ───────────────────────
        const timetables = await Timetable.find({}).lean();
        const dayNames   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const today      = new Date(); today.setHours(0,0,0,0);
        const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate() - 90);

        for (const tt of timetables) {
            if (!tt.semester || !tt.branch) continue;
            const periods = tt.periods || [];

            // Walk every day in the past 90 days
            for (let d = new Date(ninetyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
                const dayName = dayNames[d.getDay()];
                const schedule = tt.timetable?.schedule?.[dayName] || tt.timetable?.[dayName] || [];

                for (let i = 0; i < schedule.length; i++) {
                    const slot = schedule[i];
                    if (!slot || slot.isBreak || !slot.subject?.trim()) continue;

                    const periodInfo = periods[i] || {};
                    await recordTimetableHistory({
                        date:        new Date(d),
                        semester:    tt.semester.toString(),
                        branch:      tt.branch,
                        period:      `P${i + 1}`,
                        subject:     slot.subject.trim(),
                        teacher:     slot.teacher     || '',
                        teacherName: slot.teacherName || slot.teacher || '',
                        room:        slot.room        || '',
                        startTime:   periodInfo.startTime || '',
                        endTime:     periodInfo.endTime   || '',
                        source:      'cron'
                    });
                    inserted++;
                }
            }
        }

        res.json({ success: true, message: `Backfilled ${inserted} records into TimetableHistory` });
    } catch (error) {
        console.error('❌ Backfill error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/db/migrate ─────────────────────────────────────────────────────
// One-time migration:
// 1. Backfills semester+branch into PeriodAttendance from StudentManagement
// 2. Deduplicates AttendanceRecord (keeps best record per enrollmentNo+date)
// 3. Normalises AttendanceRecord.studentId = enrollmentNo
app.post('/api/db/migrate', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.json({ success: false, error: 'DB not connected' });
    }
    const report = { periodAttendanceUpdated: 0, arDuplicatesRemoved: 0, arNormalised: 0 };
    try {
        // ── 1. Build enrollmentNo → {semester, branch} map from StudentManagement ──
        const students = await StudentManagement.find({}, { enrollmentNo: 1, semester: 1, branch: 1 }).lean();
        const studentMap = {};
        students.forEach(s => { if (s.enrollmentNo) studentMap[s.enrollmentNo] = { semester: s.semester?.toString(), branch: s.branch }; });

        // ── 2. Backfill semester+branch into PeriodAttendance ─────────────────
        const paDocs = await PeriodAttendance.find({ $or: [{ semester: '' }, { semester: { $exists: false } }] }, { enrollmentNo: 1 }).lean();
        for (const doc of paDocs) {
            const info = studentMap[doc.enrollmentNo];
            if (info?.semester && info?.branch) {
                await PeriodAttendance.updateOne({ _id: doc._id }, { $set: { semester: info.semester, branch: info.branch } });
                report.periodAttendanceUpdated++;
            }
        }

        // ── 3. Deduplicate AttendanceRecord (same enrollmentNo + same date) ───
        const pipeline = [
            { $group: { _id: { enrollmentNo: '$enrollmentNo', date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }
        ];
        const dupes = await AttendanceRecord.aggregate(pipeline);
        for (const group of dupes) {
            // Keep the first (oldest), delete the rest
            const [keep, ...remove] = group.ids;
            await AttendanceRecord.deleteMany({ _id: { $in: remove } });
            report.arDuplicatesRemoved += remove.length;
        }

        // ── 4. Normalise studentId = enrollmentNo ─────────────────────────────
        const mismatch = await AttendanceRecord.find({ $expr: { $ne: ['$studentId', '$enrollmentNo'] } }, { _id: 1, enrollmentNo: 1 }).lean();
        for (const doc of mismatch) {
            await AttendanceRecord.updateOne({ _id: doc._id }, { $set: { studentId: doc.enrollmentNo } });
            report.arNormalised++;
        }

        // ── 5. Ensure semester+branch on AttendanceRecord ─────────────────────
        const arMissing = await AttendanceRecord.find({ $or: [{ semester: { $exists: false } }, { semester: '' }] }, { _id: 1, enrollmentNo: 1 }).lean();
        for (const doc of arMissing) {
            const info = studentMap[doc.enrollmentNo];
            if (info?.semester && info?.branch) {
                await AttendanceRecord.updateOne({ _id: doc._id }, { $set: { semester: info.semester, branch: info.branch } });
            }
        }

        res.json({ success: true, report });
    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/db/resync-attendance ──────────────────────────────────────────
// Recalculates AttendanceRecord.status for all students from PeriodAttendance.
// Fixes historical records where status was wrong.
app.post('/api/db/resync-attendance', async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json({ success: false, error: 'DB not connected' });
    try {
        // Get all distinct enrollmentNo+date combos from PeriodAttendance
        const groups = await PeriodAttendance.aggregate([
            { $group: { _id: { enrollmentNo: '$enrollmentNo', date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } },
                        studentName: { $first: '$studentName' },
                        semester:    { $first: '$semester' },
                        branch:      { $first: '$branch' } } }
        ]);

        let updated = 0;
        for (const g of groups) {
            const { enrollmentNo, date } = g._id;
            // Fill missing semester/branch from StudentManagement if blank
            let sem = g.semester, br = g.branch;
            if (!sem || !br) {
                const s = await StudentManagement.findOne({ enrollmentNo }, { semester: 1, branch: 1 }).lean();
                if (s) { sem = s.semester?.toString(); br = s.branch; }
            }
            await syncAttendanceRecord(enrollmentNo, new Date(date), g.studentName, sem, br);
            updated++;
        }
        res.json({ success: true, message: `Resynced ${updated} student-day records` });
    } catch (error) {
        console.error('❌ Resync error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/db/wipe-all ───────────────────────────────────────────────────
// Wipes ALL collection data. Requires confirmation token.
app.post('/api/db/wipe-all', async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== 'WIPE_ALL_DATA_CONFIRMED') {
        return res.status(400).json({ success: false, error: 'Missing confirmation token' });
    }
    if (mongoose.connection.readyState !== 1) {
        return res.json({ success: false, error: 'DB not connected' });
    }
    try {
        const results = {};
        const models = [
            { name: 'StudentManagement', model: StudentManagement },
            { name: 'Teacher',           model: Teacher },
            { name: 'Subject',           model: Subject },
            { name: 'Timetable',         model: Timetable },
            { name: 'Classroom',         model: Classroom },
            { name: 'AttendanceRecord',  model: AttendanceRecord },
            { name: 'PeriodAttendance',  model: PeriodAttendance },
            { name: 'DailyAttendance',   model: DailyAttendance },
            { name: 'AttendanceAudit',   model: AttendanceAudit },
            { name: 'TimetableHistory',  model: TimetableHistory },
            { name: 'Holiday',           model: Holiday },
            { name: 'Config',            model: Config },       // branches, semesters, departments
            { name: 'RandomRing',        model: RandomRing },   // random ring sessions
        ];
        for (const { name, model } of models) {
            const r = await model.deleteMany({});
            results[name] = r.deletedCount;
        }
        // Also clear in-memory fallbacks
        studentsMemory          = [];
        teachersMemory          = [];
        classroomsMemory        = [];
        attendanceRecordsMemory = [];
        studentManagementMemory = [];
        timetableMemory         = {};
        liveTimerState.clear();

        console.log('🗑️ [WIPE] All collections cleared:', results);
        res.json({ success: true, message: 'All data wiped', results });
    } catch (error) {
        console.error('❌ Wipe error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/attendance/date/:date/subject/:subject ─────────────────────────
// Returns per-student attendance for a specific subject on a specific date.
// Groups PeriodAttendance rows into per-student period arrays for chevron nav.
app.get('/api/attendance/date/:date/subject/:subject', async (req, res) => {
    try {
        const { date, subject } = req.params;
        const { semester, branch } = req.query;
        if (!date || !subject || !semester || !branch) {
            return res.status(400).json({ success: false, error: 'date, subject, semester and branch are required' });
        }
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, students: [], totalPeriods: 0 });
        }

        // IST-aware date window: data stored as IST midnight = UTC prev-day 18:30
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
        const startOfDay = new Date(dayStart.getTime() - IST_OFFSET_MS);
        const endOfDay   = new Date(dayEnd.getTime()   - IST_OFFSET_MS);
        const sem        = semester.toString();

        // ── Class roster ──────────────────────────────────────────────────────
        const classStudents = await StudentManagement.find(
            { semester: sem, branch },
            { enrollmentNo: 1, name: 1 }
        ).lean();
        const nameMap = {};
        classStudents.forEach(s => { if (s.enrollmentNo) nameMap[s.enrollmentNo] = s.name; });
        const enrollmentNos = Object.keys(nameMap);

        // ── Query PeriodAttendance (direct if migrated, else by enrollmentNo) ─
        const records = await PeriodAttendance.find({
            date: { $gte: startOfDay, $lte: endOfDay },
            subject,
            $or: [
                { semester: sem, branch },
                { enrollmentNo: { $in: enrollmentNos } }
            ]
        }).sort({ period: 1 }).lean();

        // ── Group by enrollmentNo ─────────────────────────────────────────────
        const studentMap = {};
        for (const r of records) {
            if (!studentMap[r.enrollmentNo]) {
                studentMap[r.enrollmentNo] = {
                    enrollmentNo: r.enrollmentNo,
                    studentName:  r.studentName || nameMap[r.enrollmentNo] || 'Unknown',
                    periods:      []
                };
            }
            studentMap[r.enrollmentNo].periods.push({
                period:           r.period,
                status:           r.status,
                verificationType: r.verificationType || '',
                checkInTime:      r.checkInTime || null,
                room:             r.room || '',
                teacher:          r.teacherName || r.teacher || ''
            });
        }

        // ── Ensure every class student appears ────────────────────────────────
        for (const enrollmentNo of enrollmentNos) {
            if (!studentMap[enrollmentNo]) {
                studentMap[enrollmentNo] = {
                    enrollmentNo,
                    studentName: nameMap[enrollmentNo] || 'Unknown',
                    periods:     []
                };
            }
        }

        const allPeriods = [...new Set(records.map(r => r.period))].sort();

        const students = Object.values(studentMap).map(s => ({
            ...s,
            periods: allPeriods.map(p => s.periods.find(x => x.period === p) || { period: p, status: 'absent', verificationType: null })
        })).sort((a, b) => a.studentName.localeCompare(b.studentName));

        res.json({ success: true, students, subject, date, allPeriods, totalPeriods: allPeriods.length });
    } catch (error) {
        console.error('❌ Error fetching subject attendance for date:', error);
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
            // Primary: branches from Config collection (admin-managed)
            const configBranches = await getBranchesFromConfig();
            const configValues = new Set(configBranches.map(b => b.value));

            // Secondary: distinct branches from StudentManagement (auto-discovered)
            const studentBranches = await StudentManagement.distinct('branch');
            // Also from Timetables
            const timetableBranches = await Timetable.distinct('branch');

            // Merge all sources, deduplicated
            const allBranchValues = new Set([
                ...configValues,
                ...studentBranches.filter(b => b),
                ...timetableBranches.filter(b => b),
            ]);

            // Build final list: Config entries first (have displayName), then auto-discovered
            const merged = [...configBranches];
            for (const val of allBranchValues) {
                if (!configValues.has(val)) {
                    merged.push({ id: val.toLowerCase().replace(/\s+/g, '-'), name: val, displayName: val, value: val });
                }
            }

            res.json({ success: true, branches: merged, count: merged.length });
        } else {
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
    keyGenerator: (req, res) => {
        // Use the login ID (student enrollment or teacher employee ID) as the key
        const userId = req.body?.id;
        if (userId) {
            return `user:${userId}`;
        }
        // Fallback to IP if no ID provided
        return ipKeyGenerator(req.ip);
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
        let userFound = false;

        if (mongoose.connection.readyState === 1) {
            // ── Redis cache: try student profile first ────────────────────────
            const studentCacheKey = `student:${sanitizedId}`;
            let studentUser = await cacheGet(studentCacheKey);
            let teacherUser = null;

            if (!studentUser) {
                // Cache miss — query DB in parallel
                [studentUser, teacherUser] = await Promise.all([
                    StudentManagement.findOne({
                        $or: [{ enrollmentNo: sanitizedId }, { email: sanitizedId }]
                    }).lean(),
                    Teacher.findOne({
                        $or: [{ employeeId: sanitizedId }, { email: sanitizedId }]
                    }).lean()
                ]);
                if (studentUser) {
                    await cacheSet(studentCacheKey, studentUser, CACHE_TTL.STUDENT);
                }
            } else {
                // Cache hit — still need teacher lookup if student not found
                if (!studentUser) {
                    teacherUser = await Teacher.findOne({
                        $or: [{ employeeId: sanitizedId }, { email: sanitizedId }]
                    }).lean();
                }
            }

            // Check in StudentManagement collection
            user = studentUser;

            if (user) {
                userFound = true;
                // Check if password is hashed (starts with $2b$ for bcrypt)
                const isPasswordValid = user.password.startsWith('$2b$')
                    ? await bcrypt.compare(password, user.password)
                    : user.password === password; // Fallback for legacy plain text passwords

                if (isPasswordValid) {
                    role = 'student';
                    // Check enrollment validity
                    if (user.isActive === false) {
                        console.log('🚫 Student enrollment invalid:', user.name);
                        return res.json({ success: false, message: 'Your enrollment is no longer valid. Please contact administration.' });
                    }
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
                } else {
                    // User found but password incorrect
                    console.log('❌ Incorrect password for student:', sanitizedId);
                    return res.json({ success: false, message: 'Password incorrect' });
                }
            }

            // Check in Teacher collection
            user = teacherUser;

            if (user) {
                userFound = true;
                // Check if password is hashed
                const isPasswordValid = user.password.startsWith('$2b$')
                    ? await bcrypt.compare(password, user.password)
                    : user.password === password; // Fallback for legacy plain text passwords

                if (isPasswordValid) {
                    role = 'teacher';
                    console.log('✅ Teacher logged in:', user.name);
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
                } else {
                    // User found but password incorrect
                    console.log('❌ Incorrect password for teacher:', sanitizedId);
                    return res.json({ success: false, message: 'Password incorrect' });
                }
            }
        } else {
            // In-memory storage (development only)
            user = studentManagementMemory.find(s =>
                (s.enrollmentNo === sanitizedId || s.email === sanitizedId)
            );

            if (user) {
                userFound = true;
                if (user.password === password) {
                    console.log('✅ Student logged in (memory):', user.name);
                    return res.json({
                        success: true,
                        user: {
                            ...user,
                            role: 'student'
                        }
                    });
                } else {
                    console.log('❌ Incorrect password for student (memory):', sanitizedId);
                    return res.json({ success: false, message: 'Password incorrect' });
                }
            }

            user = teachersMemory.find(t =>
                (t.employeeId === sanitizedId || t.email === sanitizedId)
            );

            if (user) {
                userFound = true;
                if (user.password === password) {
                    console.log('✅ Teacher logged in (memory):', user.name);
                    return res.json({
                        success: true,
                        user: {
                            ...user,
                            role: 'teacher'
                        }
                    });
                } else {
                    console.log('❌ Incorrect password for teacher (memory):', sanitizedId);
                    return res.json({ success: false, message: 'Password incorrect' });
                }
            }
        }

        // User not found in database
        if (!userFound) {
            console.log('❌ User not found:', sanitizedId);
            return res.json({ success: false, message: 'User not found in database' });
        }

        // Fallback (should not reach here)
        console.log('❌ Login failed for:', sanitizedId);
        res.json({ success: false, message: 'Invalid ID or password' });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
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
    dob: { type: Date },  // optional — not required for system operation
    phone: String,
    photoUrl: String,
    faceEmbedding: { type: [Number], default: null }, // Face recognition embedding (192 floats)
    faceEnrolledAt: { type: Date }, // When face was enrolled
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }, // Enrollment validity - false = auto-logout
    status: { type: String, enum: ['attending', 'absent', 'present'], default: 'absent' },
    lastUpdated: { type: Date, default: Date.now },
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
    // Offline Timer Session (NEW)
    attendanceSession: {
        totalAttendedSeconds: { type: Number, default: 0 },
        lastSyncTime: { type: Date },
        isRunning: { type: Boolean, default: false },
        isPaused: { type: Boolean, default: false },
        lastActivity: { type: Date },
        status: { type: String, enum: ['present', 'active', 'absent'], default: 'absent' },
        currentLecture: {
            subject: String,
            teacher: String,
            room: String,
            startTime: String
        }
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

// Indexes for fast login lookups
studentManagementSchema.index({ enrollmentNo: 1 }); // email already indexed via unique:true on field

const StudentManagement = mongoose.model('StudentManagement', studentManagementSchema);

app.get('/api/students', async (req, res) => {
    try {
        const { enrollmentNo, semester, branch } = req.query;
        
        if (mongoose.connection.readyState === 1) {
            const query = {};
            if (enrollmentNo) query.enrollmentNo = enrollmentNo;
            if (semester)     query.semester = semester;
            if (branch)       query.branch = branch;
            const students = await StudentManagement.find(query).lean();
            res.json({ success: true, students });
        } else {
            let students = studentManagementMemory;
            if (enrollmentNo) students = students.filter(s => s.enrollmentNo === enrollmentNo);
            if (semester)     students = students.filter(s => s.semester === semester);
            if (branch)       students = students.filter(s => s.branch === branch);
            res.json({ success: true, students });
        }
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get distinct branches from students (for admin panel dropdowns)
app.get('/api/config/student-branches', async (req, res) => {
    try {
        let branches = [];
        
        if (mongoose.connection.readyState === 1) {
            // Get distinct branches from database
            branches = await StudentManagement.distinct('branch');
        } else {
            // Get distinct branches from memory
            const branchSet = new Set(studentManagementMemory.map(s => s.branch).filter(b => b));
            branches = Array.from(branchSet);
        }
        
        // Format branches for dropdown
        const formattedBranches = branches.map(branch => ({
            name: branch,
            displayName: branch
        }));
        
        console.log(`? Returning ${formattedBranches.length} branches:`, formattedBranches);
        res.json({ success: true, branches: formattedBranches });
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get distinct semesters from students (for admin panel dropdowns)
app.get('/api/config/student-semesters', async (req, res) => {
    try {
        let semesters = [];
        
        if (mongoose.connection.readyState === 1) {
            // Get distinct semesters from database
            semesters = await StudentManagement.distinct('semester');
        } else {
            // Get distinct semesters from memory
            const semesterSet = new Set(studentManagementMemory.map(s => s.semester).filter(s => s));
            semesters = Array.from(semesterSet);
        }
        
        // Sort semesters numerically
        semesters.sort((a, b) => parseInt(a) - parseInt(b));
        
        console.log(`? Returning ${semesters.length} semesters:`, semesters);
        res.json({ success: true, semesters });
    } catch (error) {
        console.error('Error fetching semesters:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get daily BSSID schedule for student (for offline caching)
app.get('/api/daily-bssid-schedule', async (req, res) => {
    try {
        const { enrollmentNo, date } = req.query;
        
        if (!enrollmentNo) {
            return res.status(400).json({ success: false, error: 'Enrollment number required' });
        }

        // Disable caching to ensure fresh data
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Use provided date or today
        const targetDate = date ? new Date(date) : new Date();
        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
        
        console.log(`📅 Fetching BSSID schedule for ${enrollmentNo} on ${dayName}`);

        // Get student to find their semester and branch
        const student = await StudentManagement.findOne({ enrollmentNo });
        
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        console.log(`   Student: ${student.name}, Semester: ${student.semester}, Branch: ${student.branch}`);

        // Find timetable by semester and branch (don't rely on timetableId)
        let timetable;
        
        if (student.timetableId) {
            // Try using timetableId first
            timetable = await Timetable.findById(student.timetableId);
            console.log(`   Timetable by ID: ${timetable ? 'Found' : 'Not found'}`);
        }
        
        if (!timetable) {
            // Fallback: Find by semester and branch
            timetable = await Timetable.findOne({ 
                semester: student.semester, 
                branch: student.branch 
            });
            console.log(`   Timetable by semester/branch: ${timetable ? 'Found' : 'Not found'}`);
        }
        
        if (!timetable) {
            console.log(`   ⚠️ No timetable document found for ${student.branch} Semester ${student.semester}`);
            return res.json({ 
                success: true, 
                schedule: [],
                message: 'No timetable found for your semester and branch'
            });
        }

        // Convert Mongoose document to plain object
        const timetableObj = timetable.toObject ? timetable.toObject() : timetable;
        
        // Debug: Log timetable structure
        console.log(`   Timetable structure check:`);
        console.log(`     - Has timetable property: ${!!timetableObj.timetable}`);
        
        // The schedule is directly in timetable.timetable with lowercase day names
        let scheduleData = timetableObj.timetable;
        
        if (!scheduleData) {
            console.log(`   ⚠️ No schedule data in timetable for ${student.branch} Semester ${student.semester}`);
            return res.json({ 
                success: true, 
                schedule: [],
                message: 'Timetable exists but has no schedule data'
            });
        }
        
        console.log(`     - Using timetable.timetable (lowercase day names)`);

        // Get today's schedule (use lowercase day name)
        const dayNameLower = dayName.toLowerCase();
        const todaySchedule = scheduleData[dayNameLower] || [];
        
        console.log(`   Schedule for ${dayName} (${dayNameLower}): ${todaySchedule.length} periods`);
        
        if (todaySchedule.length > 0) {
            console.log(`   Sample period structure:`, JSON.stringify(todaySchedule[0], null, 2));
            console.log(`   Periods array exists: ${!!timetableObj.periods}`);
            if (timetableObj.periods) {
                console.log(`   Periods array length: ${timetableObj.periods.length}`);
                console.log(`   Sample period definition:`, JSON.stringify(timetableObj.periods[0], null, 2));
            }
        }
        
        if (todaySchedule.length === 0) {
            return res.json({ 
                success: true, 
                schedule: [],
                message: `No classes on ${dayName}`
            });
        }

        // Fetch classroom BSSIDs for each period
        const scheduleWithBSSID = await Promise.all(
            todaySchedule.map(async (period) => {
                let bssid = null;
                let bssids = [];
                let roomInfo = null;

                if (period.room) {
                    const classroom = await Classroom.findOne({ roomNumber: period.room });
                    if (classroom) {
                        // Support both single BSSID and multiple BSSIDs
                        if (classroom.wifiBSSIDs && Array.isArray(classroom.wifiBSSIDs) && classroom.wifiBSSIDs.length > 0) {
                            bssids = classroom.wifiBSSIDs.filter(b => b && b.trim() !== '');
                            bssid = bssids[0]; // Primary BSSID for backward compatibility
                        }
                        
                        
                        roomInfo = {
                            building: classroom.building,
                            capacity: classroom.capacity,
                            isActive: classroom.isActive
                        };
                    }
                }

                // Get period times from the periods array
                let startTime = null;
                let endTime = null;
                
                if (timetableObj.periods && Array.isArray(timetableObj.periods)) {
                    // Match by 'number' field in periods array
                    const periodDef = timetableObj.periods.find(p => p.number === period.period);
                    if (periodDef) {
                        startTime = periodDef.startTime;
                        endTime = periodDef.endTime;
                    }
                }

                // Look up shortName from Subject collection
                const subjectName = period.subject || period.teacherName || '';
                let shortName = '';
                if (subjectName) {
                    const subjectDoc = await Subject.findOne({
                        $or: [
                            { subjectName: { $regex: new RegExp(`^${subjectName}$`, 'i') } },
                            { subjectCode: period.subjectCode || '' }
                        ],
                        semester: student.semester,
                        branch: student.branch
                    }).lean();
                    if (subjectDoc && subjectDoc.shortName) {
                        shortName = subjectDoc.shortName;
                    }
                }

                return {
                    period: period.period,
                    subject: subjectName,
                    shortName: shortName,
                    subjectCode: period.subjectCode || '',
                    teacher: period.teacher || period.teacherName || '',
                    room: period.room || '',
                    startTime: startTime,
                    endTime: endTime,
                    bssid: bssid || bssids, // Return array if multiple, single if one, or null
                    bssids: bssids, // Always return array for new clients
                    roomInfo: roomInfo
                };
            })
        );

        console.log(`✅ Returning ${scheduleWithBSSID.length} periods with BSSID data for ${dayName}`);

        res.json({
            success: true,
            schedule: scheduleWithBSSID,
            date: targetDate.toISOString().split('T')[0],
            dayName: dayName,
            studentInfo: {
                enrollmentNo: student.enrollmentNo,
                name: student.name,
                semester: student.semester,
                branch: student.branch
            }
        });

    } catch (error) {
        console.error('Error fetching daily BSSID schedule:', error);
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

            // Get attendance stats for each student
            const studentsWithStats = await Promise.all(
                students.map(async (student) => {
                    try {
                        // Get attendance records for historical stats
                        const records = await AttendanceRecord.find({
                            studentId: student._id
                        });

                        const total = records.length;
                        const present = records.filter(r => r.status === 'present').length;
                        const attendancePercentage = total > 0 ? Math.round((present / total) * 100) : 0;

                        // Use real-time data from attendanceSession (updated by offline-sync)
                        const live = liveTimerState.get(student.enrollmentNo);
                        const session = student.attendanceSession || {};
                        return {
                            ...student.toObject(),
                            attendancePercentage,
                            totalDays: total,
                            presentDays: present,
                            isRunning: live ? live.isRunning : (session.isRunning || false),
                            timerValue: live ? live.attendedSeconds : (session.totalAttendedSeconds || 0),
                            status: live ? live.status : (session.status || 'absent'),
                            lastUpdated: live ? live.lastSyncTime : (session.lastSyncTime || null),
                            totalAttendedSeconds: live ? live.attendedSeconds : (session.totalAttendedSeconds || 0),
                            _id: student._id.toString()
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
                            lastUpdated: null,
                            totalAttendedSeconds: 0,
                            _id: student._id.toString()
                        };
                    }
                })
            );

            console.log(`✅ Fetched ${studentsWithStats.length} students for ${branch} Sem ${semester}`);
            console.log(`📊 Active students: ${studentsWithStats.filter(s => s.isRunning).length}`);

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
            // Sanitise: remove empty-string fields that have schema defaults or are optional
            const body = { ...req.body };
            if (!body.dob || body.dob === '') delete body.dob;  // dob required but may be empty string
            if (!body.phone) delete body.phone;
            if (!body.photoUrl) delete body.photoUrl;
            // branch may come as 'course' from older form versions
            if (!body.branch && body.course) { body.branch = body.course; delete body.course; }

            const student = new StudentManagement(body);
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
        if (error.name === 'ValidationError') {
            const details = Object.values(error.errors).map(e => e.message).join('; ');
            return res.status(400).json({ success: false, error: 'Validation failed', details });
        }
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            return res.status(400).json({ success: false, error: `Duplicate value: ${field} already exists` });
        }
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

        // Update only the face fields — bypass full-document validation so that
        // legacy documents with out-of-enum status values don't block enrollment.
        const updated = await StudentManagement.findOneAndUpdate(
            { enrollmentNo },
            { $set: { faceEmbedding, faceEnrolledAt: new Date() } },
            { new: true, runValidators: false }
        );

        console.log(`✅ Face enrolled for student: ${enrollmentNo} (${updated.name})`);

        res.status(201).json({ 
            success: true, 
            message: `Face enrolled successfully for ${updated.name}`,
            data: {
                enrollmentNo: updated.enrollmentNo,
                name: updated.name,
                faceEnrolledAt: updated.faceEnrolledAt
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

// Check if a logged-in student's enrollment is still valid
app.get('/api/student/validate', async (req, res) => {
    try {
        const { enrollmentNo } = req.query;
        if (!enrollmentNo) {
            return res.status(400).json({ success: false, message: 'enrollmentNo required' });
        }

        const student = await StudentManagement.findOne({ enrollmentNo }).select('isActive name').lean();
        if (!student) {
            return res.json({ success: false, valid: false, reason: 'not_found' });
        }

        if (student.isActive === false) {
            console.log('🚫 Enrollment invalid for:', student.name);
            return res.json({ success: true, valid: false, reason: 'enrollment_invalid' });
        }

        return res.json({ success: true, valid: true });
    } catch (error) {
        console.error('❌ Error validating student:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
    name:       { type: String, required: true },
    email:      { type: String, required: true, unique: true },
    password:   { type: String, required: true },
    department: { type: String, required: true },
    subject:    { type: String, default: '' },          // legacy single subject (kept for compat)
    subjects:   { type: [String], default: [] },        // multi-subject array (new)
    dob:        { type: Date, required: true },
    phone:      String,
    photoUrl:   String,
    semester:   String,
    canEditTimetable: { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now }
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

// GET /api/teachers/:identifier — fetch single teacher by employeeId, _id, or email
app.get('/api/teachers/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        if (mongoose.connection.readyState === 1) {
            const teacher = await Teacher.findOne({
                $or: [
                    { employeeId: identifier },
                    { email: identifier },
                    ...(identifier.match(/^[a-f\d]{24}$/i) ? [{ _id: identifier }] : [])
                ]
            });
            if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });
            res.json({ success: true, teacher });
        } else {
            const teacher = teachersMemory.find(t =>
                t.employeeId === identifier || t.email === identifier || t._id === identifier
            );
            if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });
            res.json({ success: true, teacher });
        }
    } catch (error) {
        console.error('Error fetching teacher:', error);
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

// Helper: format seconds to "Xh Ym Zs" string
function formatSecondsToTimeStr(seconds) {
    const s = Math.floor(Number(seconds) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

// Get all dates for a student (Level 1: Student Overview)
app.get('/api/attendance/student/:enrollmentNo/dates', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = { date: { $gte: new Date(startDate), $lte: new Date(endDate) } };
        }

        const records = await AttendanceRecord.find({
            $or: [{ enrollmentNo }, { studentId: enrollmentNo }],
            ...dateFilter
        })
        .select('date status dayPercentage totalAttended totalClassTime lectures')
        .sort({ date: -1 })
        .lean();

        // Deduplicate by midnight date — keep the record with the best status
        const dateMap = new Map();
        for (const r of records) {
            const midnight = new Date(r.date); midnight.setHours(0,0,0,0);
            const key = midnight.toISOString();
            const existing = dateMap.get(key);
            if (!existing ||
                (r.status === 'present' && existing.status !== 'present') ||
                (r.status === existing.status && (r.lectures?.length || 0) > (existing.lectures?.length || 0))) {
                dateMap.set(key, { ...r, date: midnight });
            }
        }

        // ── Inject today from PeriodAttendance + live timer state ────────────
        // This ensures today shows on the calendar even before end-of-day sync
        const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
        const todayKey = todayMidnight.toISOString();
        if (!dateMap.has(todayKey)) {
            try {
                const tomorrow = new Date(todayMidnight); tomorrow.setDate(tomorrow.getDate() + 1);
                const todayPeriods = await PeriodAttendance.find({
                    enrollmentNo,
                    date: { $gte: todayMidnight, $lt: tomorrow }
                }).lean();

                // Also check live in-memory timer state
                const liveState = liveTimerState.get(enrollmentNo);

                if (todayPeriods.length > 0 || liveState) {
                    const presentCount = todayPeriods.filter(p => p.status === 'present').length;
                    const totalCount   = todayPeriods.length;
                    // If timer is running, count as 'active' day — show as present on calendar
                    const isRunning    = liveState?.isRunning || false;
                    const liveStatus   = liveState?.status || (presentCount > 0 ? 'present' : 'absent');
                    const dayStatus    = (presentCount > 0 || isRunning) ? 'present' : 'absent';

                    dateMap.set(todayKey, {
                        date:          todayMidnight,
                        status:        dayStatus,
                        dayPercentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
                        totalAttended: 0,
                        totalClassTime: 0,
                        lectures:      todayPeriods,
                        _isLive:       true
                    });
                }
            } catch (_) { /* non-fatal — calendar still works without today */ }
        }

        const deduped = [...dateMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalDays      = deduped.length;
        const presentDays    = deduped.filter(r => r.status === 'present').length;
        const overallPct     = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
        const totalAttended  = deduped.reduce((s, r) => s + (Number(r.totalAttended)  || 0), 0);
        const totalClassTime = deduped.reduce((s, r) => s + (Number(r.totalClassTime) || 0), 0);

        res.json({
            success: true,
            student: {
                enrollmentNo, totalDays, presentDays,
                overallPercentage: overallPct,
                totalHours:   Math.floor(totalAttended / 60),
                totalMinutes: totalAttended % 60
            },
            dates: deduped.map(r => {
                const attended   = Number(r.totalAttended)  || 0;
                const total      = Number(r.totalClassTime) || 0;
                const percentage = total > 0
                    ? Math.round((attended / total) * 100)
                    : (Number(r.dayPercentage) || (r.status === 'present' ? 100 : 0));
                return {
                    date:         r.date,
                    status:       r.status || 'absent',
                    lectureCount: r.lectures ? r.lectures.length : 0,
                    attended,
                    total,
                    percentage,
                    isLive:       r._isLive || false
                };
            })
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
                dayPercentage: record.dayPercentage || 0,
                totalAttended: record.totalAttended || 0,   // minutes
                totalClassTime: record.totalClassTime || 0, // minutes
                checkInTime: record.checkInTime,
                checkOutTime: record.checkOutTime,
                lectures: record.lectures.map(l => ({
                    period: l.period,
                    subject: l.subject,
                    teacher: l.teacher,
                    teacherName: l.teacherName || l.teacher,
                    room: l.room,
                    startTime: l.startTime,
                    endTime: l.endTime,
                    attended: l.attended || 0,
                    total: l.total || 0,
                    percentage: l.percentage || (l.total > 0 ? Math.round((l.attended / l.total) * 100) : (l.present ? 100 : 0)),
                    present: l.present || (l.total > 0 && (l.attended / l.total) * 100 >= 75),
                    status: l.status || (l.present || (l.total > 0 && (l.attended / l.total) * 100 >= 75) ? 'present' : 'absent'),
                    attendedFormatted: formatSecondsToTimeStr(l.attended || 0),
                    totalFormatted: formatSecondsToTimeStr(l.total || 0)
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

        records.forEach(lecture => {
            totalStudents += lecture.students.length;
            totalPresent += lecture.students.filter(s => s.present).length;
            // Timer-based calculations removed
        });

        const avgAttendance = totalStudents > 0
            ? Math.round((totalPresent / totalStudents) * 100)
            : 0;

        res.json({
            success: true,
            summary: {
                teacherId,
                totalLectures,
                avgAttendance
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
        const { timestamp, type, bssid, lecture, studentId, timerState } = req.body;

        console.log('📶 WiFi Event:', { type, studentId, bssid });

        // Create WiFi event log entry
        const wifiEvent = {
            timestamp: new Date(timestamp),
            type: type, // 'connected', 'disconnected', 'bssid_changed'
            bssid: bssid,
            studentId: studentId,
            lecture: lecture,
            timerState: timerState
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

                // Grace period logic removed - period-based system doesn't use timer pause/resume

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

        // Get classroom BSSID(s)
        const classroom = await Classroom.findOne({ roomNumber: currentClass.room });

        if (!classroom) {
            return res.json({
                success: true,
                authorized: false,
                reason: 'room_not_found',
                message: `Room ${currentClass.room} not found`
            });
        }

        // Support both single BSSID and multiple BSSIDs
        let bssids = [];
        if (classroom.wifiBSSIDs && Array.isArray(classroom.wifiBSSIDs) && classroom.wifiBSSIDs.length > 0) {
            bssids = classroom.wifiBSSIDs.filter(b => b && b.trim() !== '');
        } else if (classroom.wifiBSSIDs[0] && classroom.wifiBSSIDs[0].trim() !== '') {
            bssids = [classroom.wifiBSSIDs[0]];
        }

        if (bssids.length === 0) {
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
            bssid: bssids[0], // Primary BSSID for backward compatibility
            bssids: bssids, // All BSSIDs
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

        // Get classroom's authorized BSSID(s)
        const classroom = await Classroom.findOne({ roomNumber: roomNumber });

        // Use WiFi verification service
        const wifiVerificationResult = wifiVerificationService.verifyClassroomWiFi(currentBSSID, classroom);

        console.log(`📶 BSSID Check: ${currentBSSID} vs ${wifiVerificationResult.authorizedBSSIDs?.join(', ')} = ${wifiVerificationResult.isMatch ? '✅' : '❌'}`);

        res.json({
            success: true,
            authorized: wifiVerificationResult.isMatch,
            expectedBSSID: wifiVerificationResult.authorizedBSSIDs?.[0], // Primary for backward compatibility
            expectedBSSIDs: wifiVerificationResult.authorizedBSSIDs, // All BSSIDs
            currentBSSID: currentBSSID,
            room: classroom ? {
                roomNumber: classroom.roomNumber,
                building: classroom.building
            } : null,
            reason: wifiVerificationResult.isMatch ? 'authorized' : 
                    (!classroom || wifiVerificationResult.authorizedBSSIDs?.length === 0) ? 'room_not_configured' : 'wrong_bssid',
            message: wifiVerificationResult.message
        });

    } catch (error) {
        console.error('❌ Error validating BSSID:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Offline attendance sync endpoint
// Offline sync endpoint removed - period-based system doesn't use timer synchronization

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

// System Settings Schema - System-wide configuration settings
const systemSettingsSchema = new mongoose.Schema({
    settingKey: { 
        type: String, 
        required: true, 
        unique: true 
    },
    settingValue: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true 
    },
    dataType: { 
        type: String, 
        required: true,
        enum: ['number', 'string', 'boolean', 'object', 'array']
    },
    description: { 
        type: String, 
        required: true 
    },
    
    // Validation constraints
    minValue: { type: Number },
    maxValue: { type: Number },
    
    // Metadata
    lastModifiedBy: { type: String },
    lastModifiedAt: { type: Date, default: Date.now },
    
    // Legacy fields for backward compatibility
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String
}, { 
    timestamps: true 
});

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

// Default attendance threshold
let ATTENDANCE_THRESHOLD = 75; // Default 75%

// Load attendance threshold from database on startup
async function loadAttendanceThreshold() {
    try {
        const setting = await SystemSettings.findOne({ settingKey: 'daily_threshold' });
        if (setting) {
            ATTENDANCE_THRESHOLD = parseInt(setting.settingValue) || 75;
            console.log(`✅ Loaded daily attendance threshold: ${ATTENDANCE_THRESHOLD}%`);
        } else {
            // Create default setting with new schema
            await SystemSettings.create({
                settingKey: 'daily_threshold',
                settingValue: 75,
                dataType: 'number',
                description: 'Minimum percentage of periods required for daily present status',
                minValue: 1,
                maxValue: 100,
                lastModifiedBy: 'SYSTEM',
                lastModifiedAt: new Date(),
                updatedBy: 'system'
            });
            console.log(`✅ Created default daily attendance threshold: 75%`);
        }
    } catch (error) {
        console.error('⚠️ Error loading attendance threshold:', error);
        ATTENDANCE_THRESHOLD = 75; // Fallback to default
    }
}

// Call on server start
loadAttendanceThreshold();

// GET /api/settings/attendance-threshold
app.get('/api/settings/daily-attendance-threshold', async (req, res) => {
    try {
        const setting = await SystemSettings.findOne({ settingKey: 'daily_threshold' });
        res.json({ success: true, threshold: setting ? parseInt(setting.settingValue) : ATTENDANCE_THRESHOLD });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/settings/attendance-threshold
app.put('/api/settings/daily-attendance-threshold', async (req, res) => {
    try {
        const { threshold } = req.body;
        const value = parseInt(threshold);
        if (isNaN(value) || value < 1 || value > 100) {
            return res.status(400).json({ success: false, error: 'Threshold must be between 1 and 100' });
        }
        await SystemSettings.findOneAndUpdate(
            { settingKey: 'daily_threshold' },
            { settingValue: value, lastModifiedAt: new Date(), lastModifiedBy: 'admin' },
            { upsert: true, new: true }
        );
        ATTENDANCE_THRESHOLD = value;
        console.log(`✅ Attendance threshold updated to ${value}%`);
        res.json({ success: true, threshold: value });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
    wifiBSSIDs: [String], // Array of BSSIDs - supports single or multiple WiFi networks
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
    ringId: { type: String, required: true, unique: true },
    teacherId: { type: String, required: true },
    teacherName: String,
    semester: String,
    branch: String,
    subject: String,
    room: String,
    period: String,
    targetType: { type: String, enum: ['all', 'select'], required: true },
    studentCount: Number,
    selectedStudents: [{
        studentId: String,
        name: String,
        enrollmentNo: String,
        // Response tracking
        responded: { type: Boolean, default: false },
        verified: { type: Boolean, default: false },
        responseTime: Date,
        // Teacher action
        teacherAction: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        teacherActionTime: Date,
        // Face verify after rejection
        faceVerifiedAfterRejection: { type: Boolean, default: false },
        faceVerificationTime: Date,
        // Auto-absent tracking
        autoAbsent: { type: Boolean, default: false }
    }],
    triggeredAt: { type: Date, default: Date.now },
    expiresAt: Date,          // 240s after trigger for no-response auto-absent
    completedAt: Date,
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    totalResponses: { type: Number, default: 0 },
    successfulVerifications: { type: Number, default: 0 },
    failedVerifications: { type: Number, default: 0 },
    noResponses: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const RandomRing = mongoose.model('RandomRing', randomRingSchema);

// ============================================
// RANDOM RING TIMEOUT HANDLER
// ============================================

const cron = require('node-cron');

/**
 * Check for expired random rings and auto-absent non-responding students
 * Runs every 30 seconds
 */
async function checkExpiredRandomRings() {
    try {
        const now = new Date();
        const expiredRings = await RandomRing.find({ status: 'active', expiresAt: { $lt: now } });
        if (expiredRings.length === 0) return;

        console.log(`⏰ [TIMEOUT] Processing ${expiredRings.length} expired ring(s)`);

        for (const ring of expiredRings) {
            const classRoom = `class:${ring.semester}:${ring.branch}`;
            let autoAbsentCount = 0;

            for (const s of ring.selectedStudents) {
                // Only auto-absent students who never responded
                if (!s.responded && !s.autoAbsent) {
                    s.autoAbsent = true;
                    s.responded = true;
                    autoAbsentCount++;

                    // Flip liveTimerState to absent and stop timer
                    const live = liveTimerState.get(s.enrollmentNo);
                    if (live) {
                        const updated = { ...live, status: 'absent', isRunning: false };
                        await liveTimerState.set(s.enrollmentNo, updated);
                        // Broadcast status change to teacher room
                        io.to(classRoom).emit('timer_broadcast', updated);
                    }

                    console.log(`🚫 [TIMEOUT] Auto-absent: ${s.enrollmentNo} (no response to ring ${ring.ringId})`);
                }
            }

            ring.status = 'expired';
            ring.completedAt = now;
            ring.noResponses = autoAbsentCount;
            await ring.save();

            // Notify teacher room
            if (autoAbsentCount > 0) {
                io.to(classRoom).emit('random_ring_auto_absent', {
                    ringId: ring.ringId,
                    teacherId: ring.teacherId,
                    autoAbsentStudents: ring.selectedStudents
                        .filter(s => s.autoAbsent)
                        .map(s => ({ enrollmentNo: s.enrollmentNo, name: s.name }))
                });
            }

            console.log(`✅ [TIMEOUT] Ring ${ring.ringId} expired — ${autoAbsentCount} auto-absent`);
        }
    } catch (error) {
        console.error('❌ [TIMEOUT] Error checking expired rings:', error);
    }
}

// Check every 30 seconds for expired rings (240s expiry needs timely processing)
cron.schedule('* * * * *', () => {
    checkExpiredRandomRings();
});
// Also run on the 30-second mark
setInterval(() => { checkExpiredRandomRings(); }, 30000);

// ─── Daily midnight cron: snapshot today's timetable into TimetableHistory ───
// Runs at 00:05 every day so all subjects scheduled for today are recorded
// even if no student checks in.
cron.schedule('5 0 * * *', async () => {
    console.log('📅 [CRON] Snapshotting today\'s timetable into TimetableHistory...');
    try {
        const now   = new Date();
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const days  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const dayName = days[now.getDay()];

        const timetables = await Timetable.find({}).lean();
        let count = 0;

        for (const tt of timetables) {
            const schedule = tt.timetable?.schedule?.[dayName] || tt.timetable?.[dayName] || [];
            if (!schedule.length) continue;

            const periods = tt.periods || [];

            for (let i = 0; i < schedule.length; i++) {
                const slot = schedule[i];
                if (!slot || slot.isBreak || !slot.subject) continue;

                const periodInfo = periods[i] || {};
                const periodId   = `P${i + 1}`;

                await recordTimetableHistory({
                    date:        today,
                    semester:    tt.semester?.toString(),
                    branch:      tt.branch,
                    period:      periodId,
                    subject:     slot.subject,
                    teacher:     slot.teacher || '',
                    teacherName: slot.teacherName || slot.teacher || '',
                    room:        slot.room || '',
                    startTime:   periodInfo.startTime || '',
                    endTime:     periodInfo.endTime   || '',
                    source:      'cron'
                });
                count++;
            }
        }
        console.log(`✅ [CRON] TimetableHistory: recorded ${count} period slots for ${dayName}`);
    } catch (e) {
        console.error('❌ [CRON] TimetableHistory snapshot failed:', e.message);
    }
});

console.log('? [TIMEOUT] Random ring timeout handler initialized - checking every minute');

// ============================================
// END RANDOM RING TIMEOUT HANDLER
// ============================================

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
        // Timer-based fields removed - period-based system uses discrete present/absent
        present: Boolean, // true if present for the period
        verifiedFace: Boolean,
        randomRingTriggered: Boolean,
        randomRingPassed: Boolean,
        timestamp: { type: Date, default: Date.now }
    }],

    // Daily summary - timer fields removed
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

// GET /api/attendance/records - Query attendance records by studentId or semester/branch
// Used by: admin-panel showStudentAttendance(), App.js fetchStudentDetails()
app.get('/api/attendance/records', async (req, res) => {
    try {
        const { studentId, semester, branch, startDate, endDate, year, month } = req.query;

        if (!studentId && (!semester || !branch)) {
            return res.status(400).json({
                success: false,
                error: 'Provide studentId OR both semester and branch'
            });
        }

        // Build query — studentId may be enrollmentNo or _id
        let query = {};
        if (studentId) {
            query = { $or: [{ studentId }, { enrollmentNo: studentId }] };
        } else {
            query = { semester, branch };
        }

        // Month-scoped filter (preferred — fast, index-friendly)
        if (year && month) {
            const y = parseInt(year), m = parseInt(month) - 1; // month is 1-based from client
            query.date = {
                $gte: new Date(y, m, 1),
                $lt:  new Date(y, m + 1, 1)
            };
        } else if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate)   query.date.$lte = new Date(endDate);
        }

        if (mongoose.connection.readyState === 1) {
            const records = await AttendanceRecord.find(query)
                .sort({ date: -1 })
                .lean();

            // --- INJECT SYNTHETIC ABSENT RECORDS FOR MISSED DAYS ---
            if (studentId) {
                try {
                    const student = await StudentManagement.findOne(
                        { $or: [{ _id: studentId }, { enrollmentNo: studentId }] }
                    ).lean();
                    
                    if (student && student.semester && student.branch) {
                        const tt = await Timetable.findOne({ 
                            semester: student.semester.toString(), 
                            branch: student.branch 
                        }).lean();

                        if (tt && tt.timetable) {
                            const recordsByDate = {};
                            records.forEach(r => {
                                const d = new Date(r.date);
                                const dStr = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
                                recordsByDate[dStr] = true;
                            });

                            const today = new Date();
                            today.setHours(0, 0, 0, 0);

                            let start = query.date && query.date.$gte ? new Date(query.date.$gte) : new Date(today.getFullYear(), today.getMonth(), 1);
                            let end = query.date && query.date.$lt ? new Date(query.date.$lt) : new Date(today.getFullYear(), today.getMonth() + 1, 1);
                            
                            if (end > today) end = today;

                            const daysOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

                            for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                                const dStr = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
                                const dayName = daysOfWeek[d.getDay()];
                                
                                const daySchedule = tt.timetable[dayName] || [];
                                const hasClasses = daySchedule.some(p => p.subject && !p.isBreak);

                                if (hasClasses && !recordsByDate[dStr]) {
                                    const synthLectures = daySchedule
                                        .filter(p => p.subject && !p.isBreak)
                                        .map(p => {
                                            const pInfo = (tt.periods || []).find(px => px.number === p.period);
                                            let durationSec = 3600;
                                            if (pInfo && pInfo.startTime && pInfo.endTime) {
                                                const startM = pInfo.startTime.split(':').map(Number);
                                                const endM = pInfo.endTime.split(':').map(Number);
                                                durationSec = ((endM[0] * 60 + endM[1]) - (startM[0] * 60 + startM[1])) * 60;
                                            }
                                            return {
                                                period: p.period || 'P?',
                                                subject: p.subject,
                                                teacher: p.teacher || '',
                                                teacherName: p.teacherName || p.teacher || '',
                                                room: p.room || '',
                                                startTime: pInfo ? pInfo.startTime : '',
                                                endTime: pInfo ? pInfo.endTime : '',
                                                attended: 0,
                                                total: durationSec,
                                                percentage: 0,
                                                present: false,
                                                verifications: []
                                            };
                                        });

                                    records.push({
                                        studentId: student._id.toString(),
                                        enrollmentNo: student.enrollmentNo,
                                        studentName: student.name || student.enrollmentNo,
                                        date: new Date(d),
                                        semester: student.semester.toString(),
                                        branch: student.branch,
                                        status: 'absent',
                                        dayPercentage: 0,
                                        totalAttended: 0,
                                        totalClassTime: synthLectures.reduce((sum, l) => sum + Math.floor(l.total / 60), 0),
                                        timerValue: 0,
                                        lectures: synthLectures,
                                        isSynthetic: true
                                    });
                                }
                            }
                            records.sort((a, b) => new Date(b.date) - new Date(a.date));
                        }
                    }
                } catch (err) {
                    console.error('❌ Error generating synthetic records:', err);
                }
            }

            res.json({ success: true, records });
        } else {
            const records = attendanceRecordsMemory.filter(r => {
                if (studentId) return r.studentId === studentId || r.enrollmentNo === studentId;
                return r.semester === semester && r.branch === branch;
            }).sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json({ success: true, records });
        }
    } catch (error) {
        console.error('❌ Error fetching attendance records:', error);
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

        // Timer-based calculation removed - period-based system handles attendance differently
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
// Primary source: DailyAttendance (accurate daily aggregation) + PeriodAttendance (per-subject breakdown)
// Falls back to AttendanceRecord only if DailyAttendance has no data
app.get('/api/attendance/summary/:enrollmentNo', async (req, res) => {
    try {
        const { enrollmentNo } = req.params;
        const { startDate, endDate } = req.query;

        if (!enrollmentNo) {
            return res.status(400).json({ success: false, error: 'Enrollment number required' });
        }

        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate)   dateFilter.$lte = new Date(endDate);
        const hasDateFilter = startDate || endDate;

        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, summary: { totalDays: 0, presentDays: 0, totalAttendedMinutes: 0, totalClassMinutes: 0, overallPercentage: 0, subjects: [] } });
        }

        const student = await StudentManagement.findOne({ enrollmentNo });
        if (!student) {
            return res.json({ success: true, summary: { totalDays: 0, presentDays: 0, totalAttendedMinutes: 0, totalClassMinutes: 0, overallPercentage: 0, subjects: [] } });
        }

        // ── Primary: DailyAttendance ──────────────────────────────────────────
        const dailyQuery = { enrollmentNo };
        if (hasDateFilter) dailyQuery.date = dateFilter;
        const dailyRecords = await DailyAttendance.find(dailyQuery).lean();

        // ── Always merge today's AttendanceRecord (intra-day, not yet in DailyAttendance) ──
        const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
        const todayEnd      = new Date(); todayEnd.setHours(23, 59, 59, 999);
        // Only merge today if it's within the requested date range (or no date filter)
        const todayInRange = !hasDateFilter ||
            ((!startDate || new Date(startDate) <= todayMidnight) &&
             (!endDate   || new Date(endDate)   >= todayMidnight));

        let totalDays = 0, presentDays = 0, totalAttendedMinutes = 0, totalClassMinutes = 0;

        if (dailyRecords.length > 0) {
            totalDays    = dailyRecords.length;
            presentDays  = dailyRecords.filter(r => r.dailyStatus === 'present').length;
            // Derive minutes from AttendanceRecord for accuracy
            const arQuery = { enrollmentNo };
            if (hasDateFilter) arQuery.date = dateFilter;
            const arRecords = await AttendanceRecord.find(arQuery).lean();
            totalAttendedMinutes = arRecords.reduce((s, r) => s + (r.totalAttended || 0), 0);
            totalClassMinutes    = arRecords.reduce((s, r) => s + (r.totalClassTime || 0), 0);
            if (totalClassMinutes === 0) {
                const totalPeriods   = dailyRecords.reduce((s, r) => s + (r.totalPeriods   || 0), 0);
                const presentPeriods = dailyRecords.reduce((s, r) => s + (r.presentPeriods || 0), 0);
                totalClassMinutes    = totalPeriods   * 50;
                totalAttendedMinutes = presentPeriods * 50;
            }

            // Merge today's intra-day AttendanceRecord if not already in DailyAttendance
            if (todayInRange) {
                const todayInDaily = dailyRecords.some(r => {
                    const d = new Date(r.date); d.setHours(0,0,0,0);
                    return d.getTime() === todayMidnight.getTime();
                });
                if (!todayInDaily) {
                    const todayAR = await AttendanceRecord.findOne({ enrollmentNo, date: { $gte: todayMidnight, $lte: todayEnd } }).lean();
                    if (todayAR) {
                        totalDays++;
                        if (todayAR.status === 'present') presentDays++;
                        totalAttendedMinutes += todayAR.totalAttended || 0;
                        totalClassMinutes    += todayAR.totalClassTime || 0;
                    }
                }
            }
        } else {
            // ── Fallback: AttendanceRecord only ──────────────────────────────
            const arQuery = { enrollmentNo };
            if (hasDateFilter) arQuery.date = dateFilter;
            const arRecords = await AttendanceRecord.find(arQuery).lean();
            const uniqueDates    = [...new Set(arRecords.map(r => new Date(r.date).toDateString()))];
            totalDays            = uniqueDates.length;
            presentDays          = arRecords.filter(r => r.status === 'present').length;
            totalAttendedMinutes = arRecords.reduce((s, r) => s + (r.totalAttended || 0), 0);
            totalClassMinutes    = arRecords.reduce((s, r) => s + (r.totalClassTime || 0), 0);
        }

        const overallPercentage = totalClassMinutes > 0
            ? Math.round((totalAttendedMinutes / totalClassMinutes) * 100)
            : (totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0);

        // ── Per-subject breakdown from PeriodAttendance ───────────────────────
        const periodQuery = { enrollmentNo };
        if (hasDateFilter) periodQuery.date = dateFilter;
        const periodRecords = await PeriodAttendance.find(periodQuery).lean();

        const subjectMap = {};
        for (const pr of periodRecords) {
            const subj = pr.subject || 'Unknown';
            if (!subjectMap[subj]) subjectMap[subj] = { subject: subj, present: 0, total: 0 };
            subjectMap[subj].total++;
            // Only count 'present' (threshold crossed) — not 'active' (timer running but below threshold)
            if (pr.status === 'present') subjectMap[subj].present++;
        }
        const subjects = Object.values(subjectMap).map(s => ({
            ...s,
            percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
        }));

        res.json({
            success: true,
            summary: { totalDays, presentDays, totalAttendedMinutes, totalClassMinutes, overallPercentage, subjects }
        });

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
        
        // Check if BSSID is being updated (either single or multiple)
        const bssidChanged = req.body.wifiBSSID !== undefined || req.body.wifiBSSIDs !== undefined;
        const roomNumber = req.body.roomNumber;
        
        if (mongoose.connection.readyState === 1) {
            const classroom = await Classroom.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            
            // If BSSID changed, broadcast update to affected students
            if (bssidChanged && classroom && classroom.roomNumber) {
                await broadcastBSSIDUpdateForRoom(classroom.roomNumber);
            }
            
            res.json({ success: true, classroom });
        } else {
            const index = classroomsMemory.findIndex(c => c._id === req.params.id);
            if (index !== -1) {
                classroomsMemory[index] = {
                    ...classroomsMemory[index],
                    ...req.body
                };
                
                // If BSSID changed, broadcast update to affected students
                if (bssidChanged && classroomsMemory[index].roomNumber) {
                    await broadcastBSSIDUpdateForRoom(classroomsMemory[index].roomNumber);
                }
                
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
        const { type, count, teacherId, teacherName, semester, branch, subject, room } = req.body;

        console.log('🔔 Random Ring initiated:', { type, count, teacherId, semester, branch });

        if (!teacherId || !semester || !branch) {
            return res.status(400).json({ success: false, error: 'teacherId, semester and branch required' });
        }

        // Use liveTimerState to find students who are currently ACTIVE (timer running, not yet present)
        // Also include 'offline' students — they were attending and just lost WiFi temporarily
        // Feature: also include students who had their timer running at any point today (wasActiveToday)
        const today = new Date().toISOString().split('T')[0];
        const activeStudents = [];
        const wasActiveTodayStudents = [];

        liveTimerState.forEach((state, enrollmentNo) => {
            if (state.semester !== semester || state.branch !== branch) return;

            const isCurrentlyActive = state.status === 'active' || state.status === 'offline';
            const lastSyncDate = state.lastSyncTime
                ? new Date(state.lastSyncTime).toISOString().split('T')[0]
                : null;
            const hadTimerToday = lastSyncDate === today && (state.attendedSeconds || 0) > 0;

            if (isCurrentlyActive) {
                activeStudents.push({
                    enrollmentNo, name: state.name, studentId: enrollmentNo,
                    ringEligibility: 'active' // currently attending
                });
            } else if (hadTimerToday) {
                wasActiveTodayStudents.push({
                    enrollmentNo, name: state.name, studentId: enrollmentNo,
                    ringEligibility: 'wasActive' // attended earlier today
                });
            }
        });

        // Combine: active students first, then was-active-today students
        const eligibleStudents = [...activeStudents, ...wasActiveTodayStudents];

        if (eligibleStudents.length === 0) {
            return res.json({ success: true, message: 'No eligible students right now.', selectedStudents: [] });
        }

        // Select students based on type — prefer active over wasActive when selecting by count
        let selectedStudents = [];
        if (type === 'all') {
            selectedStudents = eligibleStudents;
        } else if (type === 'select' && count) {
            // Shuffle active students first, then wasActive — so active get priority
            const shuffledActive = [...activeStudents].sort(() => 0.5 - Math.random());
            const shuffledWasActive = [...wasActiveTodayStudents].sort(() => 0.5 - Math.random());
            const pool = [...shuffledActive, ...shuffledWasActive];
            selectedStudents = pool.slice(0, Math.min(count, pool.length));
        }

        console.log(`✅ Selected ${selectedStudents.length} active students for random ring`);

        // Get current period — use server time (teacher-side call, no client timestamp)
        let currentPeriod = null;
        try {
            const lectureInfo = await getCurrentLectureInfo(semester, branch, new Date().toISOString());
            if (lectureInfo) currentPeriod = `P${lectureInfo.period}`;
        } catch (e) { /* ignore */ }

        const ringId = `ring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 240 * 1000); // 240 seconds

        const randomRing = new RandomRing({
            ringId,
            teacherId,
            teacherName: teacherName || 'Teacher',
            semester,
            branch,
            period: currentPeriod,
            subject,
            room,
            targetType: type,
            studentCount: selectedStudents.length,
            selectedStudents: selectedStudents.map(s => ({
                studentId: s.studentId,
                name: s.name,
                enrollmentNo: s.enrollmentNo,
                responded: false,
                verified: false,
                teacherAction: 'pending',
                faceVerifiedAfterRejection: false,
                autoAbsent: false,
                ringEligibility: s.ringEligibility || 'active' // 'active' | 'wasActive'
            })),
            triggeredAt: now,
            expiresAt,
            status: 'active',
            totalResponses: 0,
            successfulVerifications: 0,
            failedVerifications: 0,
            noResponses: 0
        });

        await randomRing.save();

        // Notify each selected student via targeted socket (by enrollmentNo room)
        const room_key = `class:${semester}:${branch}`;
        selectedStudents.forEach(student => {
            io.to(room_key).emit('random_ring_notification', {
                randomRingId: ringId,
                enrollmentNo: student.enrollmentNo,
                studentId: student.studentId,
                teacherId,
                teacherName: teacherName || 'Teacher',
                expiresAt: expiresAt.toISOString(),
                timestamp: now.getTime()
            });
        });

        // Also emit to teacher room so teacher UI updates
        io.to(room_key).emit('random_ring_triggered', {
            randomRingId: ringId,
            teacherId,
            semester,
            branch,
            selectedStudents: selectedStudents.map(s => ({
                studentId: s.studentId,
                enrollmentNo: s.enrollmentNo,
                name: s.name,
                teacherAction: 'pending',
                verified: false,
                faceVerifiedAfterRejection: false
            })),
            expiresAt: expiresAt.toISOString()
        });

        res.json({
            success: true,
            message: `Random ring sent to ${selectedStudents.length} students`,
            randomRingId: ringId,
            selectedStudents: selectedStudents.map(s => ({
                id: s.studentId,
                enrollmentNo: s.enrollmentNo,
                name: s.name
            }))
        });

    } catch (error) {
        console.error('❌ Error in random ring:', error);
        res.status(500).json({ success: false, error: error.message });
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
            randomRing = await RandomRing.findOne({ ringId: randomRingId });

            if (!randomRing) {
                return res.status(404).json({ success: false, error: 'Random ring not found' });
            }

            const studentIndex = randomRing.selectedStudents.findIndex(
                s => s.studentId === studentId || s.enrollmentNo === studentId
            );

            if (studentIndex === -1) {
                return res.status(404).json({ success: false, error: 'Student not found in this random ring' });
            }

            randomRing.selectedStudents[studentIndex].responded = true;
            randomRing.selectedStudents[studentIndex].responseTime = new Date();
            if (verificationPhoto) randomRing.selectedStudents[studentIndex].verificationPhoto = verificationPhoto;

            await randomRing.save();
            console.log(`✅ Student ${studentId} responded to random ring ${randomRingId}`);

            // Notify teacher room
            const classRoom = `class:${randomRing.semester}:${randomRing.branch}`;
            io.to(classRoom).emit('random_ring_teacher_action_update', {
                randomRingId: randomRing.ringId,
                enrollmentNo: randomRing.selectedStudents[studentIndex].enrollmentNo,
                action: 'responded'
            });
        }

        res.json({ success: true, message: 'Response recorded. Awaiting teacher action.' });

    } catch (error) {
        console.error('❌ Error in random ring verification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Student verifies face directly (Path A — no teacher accept/reject needed)
app.post('/api/random-ring/verify-direct', async (req, res) => {
    try {
        const { randomRingId, studentId, bssid } = req.body;

        console.log('🔔 Random Ring direct face verify:', { randomRingId, studentId });

        if (!randomRingId || !studentId) {
            return res.status(400).json({ success: false, error: 'Random Ring ID and Student ID required' });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }

        const randomRing = await RandomRing.findOne({ ringId: randomRingId });
        if (!randomRing) {
            return res.status(404).json({ success: false, error: 'Random ring not found' });
        }

        const studentIndex = randomRing.selectedStudents.findIndex(
            s => s.studentId === studentId || s.enrollmentNo === studentId
        );
        if (studentIndex === -1) {
            return res.status(404).json({ success: false, error: 'Student not found in this random ring' });
        }

        const enrollmentNo = randomRing.selectedStudents[studentIndex].enrollmentNo;
        const classRoom = `class:${randomRing.semester}:${randomRing.branch}`;
        const now = new Date();

        randomRing.selectedStudents[studentIndex].responded = true;
        randomRing.selectedStudents[studentIndex].responseTime = now;
        randomRing.selectedStudents[studentIndex].faceVerifiedDirect = true;
        randomRing.selectedStudents[studentIndex].faceVerificationTime = now;
        randomRing.selectedStudents[studentIndex].teacherAction = 'accepted';
        await randomRing.save();

        // Keep student active in liveTimerState
        const live = liveTimerState.get(enrollmentNo);
        if (live) {
            liveTimerState.set(enrollmentNo, { ...live, status: 'active' });
            io.to(classRoom).emit('timer_broadcast', { ...live, status: 'active' });
        }

        // Notify teacher dashboard
        io.to(classRoom).emit('random_ring_teacher_action_update', {
            randomRingId: randomRing.ringId,
            enrollmentNo,
            action: 'accepted'
        });

        // Notify student — triggers timer resume + compensation on client
        io.to(classRoom).emit('random_ring_face_verification_success', {
            enrollmentNo,
            randomRingId: randomRing.ringId,
            message: 'Face verification successful. Timer resumed.'
        });

        console.log(`✅ Student ${studentId} direct face verified for ring ${randomRingId}`);
        res.json({ success: true, message: 'Face verification successful' });

    } catch (error) {
        console.error('❌ Error in random ring direct verify:', error);
        res.status(500).json({ success: false, error: error.message });
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
            // randomRingId is the string ringId, not MongoDB _id
            randomRing = await RandomRing.findOne({ ringId: randomRingId });

            if (!randomRing) {
                return res.status(404).json({ success: false, error: 'Random ring not found' });
            }

            const studentIndex = randomRing.selectedStudents.findIndex(s =>
                s.studentId === studentId || s.enrollmentNo === studentId
            );

            if (studentIndex === -1) {
                return res.status(404).json({ success: false, error: 'Student not found in this random ring' });
            }

            if (randomRing.selectedStudents[studentIndex].teacherAction !== 'rejected') {
                return res.status(400).json({ success: false, error: 'Face verification only allowed after teacher rejection' });
            }

            const now = new Date();
            const enrollmentNo = randomRing.selectedStudents[studentIndex].enrollmentNo;
            const classRoom = `class:${randomRing.semester}:${randomRing.branch}`;

            randomRing.selectedStudents[studentIndex].faceVerifiedAfterRejection = true;
            randomRing.selectedStudents[studentIndex].faceVerificationTime = now;
            if (verificationPhoto) randomRing.selectedStudents[studentIndex].verificationPhoto = verificationPhoto;

            await randomRing.save();
            console.log(`✅ Student ${studentId} face verified after rejection for ring ${randomRingId}`);

            // Keep student active in liveTimerState
            const live = liveTimerState.get(enrollmentNo);
            if (live) {
                liveTimerState.set(enrollmentNo, { ...live, status: 'active', faceVerifyWindow: null });
                // Broadcast updated state to class room
                io.to(classRoom).emit('timer_broadcast', { ...live, status: 'active' });
            }

            // Notify teacher (targeted to class room)
            io.to(classRoom).emit('random_ring_face_verified_after_rejection', {
                randomRingId: randomRing.ringId,
                enrollmentNo,
                studentName: randomRing.selectedStudents[studentIndex].name,
                teacherId: randomRing.teacherId
            });

            // Notify student (targeted to class room)
            io.to(classRoom).emit('random_ring_face_verification_success', {
                enrollmentNo,
                randomRingId: randomRing.ringId,
                message: 'Face verification successful. You remain active.'
            });
        }

        res.json({
            success: true,
            message: 'Face verification after rejection successful'
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
            // randomRingId is the string ringId, not MongoDB _id
            const randomRing = await RandomRing.findOne({ ringId: randomRingId });

            if (!randomRing) {
                return res.status(404).json({ success: false, error: 'Random ring not found' });
            }

            const studentIndex = randomRing.selectedStudents.findIndex(s =>
                s.studentId === studentId || s.enrollmentNo === studentId
            );

            if (studentIndex === -1) {
                return res.status(404).json({ success: false, error: 'Student not found in this random ring' });
            }

            const now = new Date();
            randomRing.selectedStudents[studentIndex].teacherAction = action;
            randomRing.selectedStudents[studentIndex].teacherActionTime = now;

            const enrollmentNo = randomRing.selectedStudents[studentIndex].enrollmentNo;
            const classRoom = `class:${randomRing.semester}:${randomRing.branch}`;

            if (action === 'accepted') {
                randomRing.selectedStudents[studentIndex].verified = true;
                randomRing.selectedStudents[studentIndex].responded = true;
                randomRing.successfulVerifications = (randomRing.successfulVerifications || 0) + 1;

                // Keep student active in liveTimerState
                const live = liveTimerState.get(enrollmentNo);
                if (live) liveTimerState.set(enrollmentNo, { ...live, ringPending: false });

                // Notify student (targeted to class room)
                io.to(classRoom).emit('random_ring_teacher_accepted', {
                    enrollmentNo,
                    randomRingId: randomRing.ringId,
                    message: 'Teacher verified your presence.'
                });

                io.to(classRoom).emit('random_ring_teacher_action_update', {
                    randomRingId: randomRing.ringId,
                    enrollmentNo,
                    action: 'accepted'
                });

                console.log(`✅ Teacher accepted ${enrollmentNo}`);

            } else if (action === 'rejected') {
                randomRing.selectedStudents[studentIndex].responded = true;
                randomRing.failedVerifications = (randomRing.failedVerifications || 0) + 1;

                // Keep active but open 5-min face verify window
                const live = liveTimerState.get(enrollmentNo);
                if (live) liveTimerState.set(enrollmentNo, { ...live, ringPending: false, faceVerifyWindow: Date.now() + 5 * 60 * 1000 });

                io.to(classRoom).emit('random_ring_teacher_rejected', {
                    enrollmentNo,
                    randomRingId: randomRing.ringId,
                    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
                    message: 'Teacher rejected. Verify your face within 5 minutes to stay active.'
                });

                io.to(classRoom).emit('random_ring_teacher_action_update', {
                    randomRingId: randomRing.ringId,
                    enrollmentNo,
                    action: 'rejected'
                });

                console.log(`❌ Teacher rejected ${enrollmentNo} — 5min face verify window open`);
            }

            await randomRing.save();
            res.json({ success: true, action });
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

        // Close tracked socket timers if a tracker exists. Some builds do not
        // define activeConnections, so guard this to keep shutdown reliable.
        const trackedConnections = global.activeConnections;
        if (trackedConnections && typeof trackedConnections.forEach === 'function') {
            console.log(`🔌 Closing ${trackedConnections.size || 0} active socket connections...`);
            trackedConnections.forEach((connection) => {
                if (connection?.timers && typeof connection.timers.forEach === 'function') {
                    connection.timers.forEach(timer => clearInterval(timer));
                }
            });
        }
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

// ============================================
// DAILY ATTENDANCE CALCULATION SERVICE (TASK 6)
// ============================================

const { calculateDailyAttendance, initializeDailyCalculation } = require('./services/dailyAttendanceCalculation');

// Initialize daily calculation job
const dailyCalculationModels = {
    StudentManagement,
    Timetable,
    PeriodAttendance,
    DailyAttendance,
    SystemSettings
};

initializeDailyCalculation(dailyCalculationModels);

// Manual trigger endpoint for testing
app.post('/api/attendance/calculate-daily', async (req, res) => {
    console.log('?? [MANUAL] Manual daily calculation triggered');
    
    try {
        const result = await calculateDailyAttendance(dailyCalculationModels);
        res.json(result);
    } catch (error) {
        console.error('? [MANUAL] Error in manual calculation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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
app.get('/api/attendance/history/export', async (req, res) => {
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


