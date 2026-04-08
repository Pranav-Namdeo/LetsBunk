/**
 * Seed Script — Attendance History Demo Data
 * Uses exact branch/semester values from the Config collection.
 * Run: node scripts/seed-attendance.js
 * Safe: upsert — won't duplicate on re-run.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';
const THRESHOLD = 75;

// ── Use EXACT values from Config collection ───────────────────────────────────
// Branch value from Config: 'DS', Semesters: '1'–'5'
const BRANCH   = 'DS';
const SEMESTERS = ['1', '2', '3'];   // seed 3 semesters

const StudentManagement = mongoose.model('StudentManagement', new mongoose.Schema({}, { strict: false }));
const PeriodAttendance  = mongoose.model('PeriodAttendance',  new mongoose.Schema({}, { strict: false }));
const DailyAttendance   = mongoose.model('DailyAttendance',   new mongoose.Schema({}, { strict: false }));
const AttendanceRecord  = mongoose.model('AttendanceRecord',  new mongoose.Schema({}, { strict: false }));

const SUBJECTS_BY_SEM = {
    '1': ['Maths-I', 'Physics', 'Chemistry', 'English', 'Programming', 'Workshop'],
    '2': ['Maths-II', 'Electronics', 'Mechanics', 'English-II', 'Data Struct', 'Lab'],
    '3': ['DBMS', 'OS', 'ML', 'Stats', 'Python', 'English'],
};
const TEACHERS      = ['T001','T002','T003','T004','T005','T006'];
const TEACHER_NAMES = ['Dr. Sharma','Prof. Verma','Dr. Gupta','Prof. Singh','Dr. Patel','Prof. Rao'];
const ROOMS         = ['A101','A102','B201','B202','C301','C302'];
const PERIODS       = ['P1','P2','P3','P4','P5','P6'];

// 4 students per semester
const NAMES_BY_SEM = {
    '1': ['Aditya Singh','Priya Sharma','Rahul Verma','Sneha Patel'],
    '2': ['Arjun Mehta','Kavya Nair','Rohan Das','Ananya Joshi'],
    '3': ['Vikram Rao','Pooja Iyer','Karan Malhotra','Divya Reddy'],
};

function midnight(d) { const dt = new Date(d); dt.setHours(0,0,0,0); return dt; }

function getLast30Weekdays() {
    const days = [], today = new Date();
    for (let i = 1; i <= 60 && days.length < 30; i++) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const day = d.getDay();
        if (day >= 1 && day <= 6) days.push(midnight(d));
    }
    return days;
}

function shouldAttend(enrollmentNo, dateStr, period) {
    const hash = [...(enrollmentNo + dateStr + period)].reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
    const rate = (Math.abs(hash) % 40) + 60; // 60–99%
    return (Math.abs(hash * 7919) % 100) < rate;
}

async function seed() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const days = getLast30Weekdays();
    console.log(`📅 Seeding ${days.length} weekdays | Branch: ${BRANCH} | Semesters: ${SEMESTERS.join(', ')}\n`);

    let studentCount = 0, periodCount = 0, dailyCount = 0, recordCount = 0;

    for (const semester of SEMESTERS) {
        const subjects = SUBJECTS_BY_SEM[semester];
        const names    = NAMES_BY_SEM[semester];
        console.log(`📚 Semester ${semester}`);

        for (let si = 0; si < names.length; si++) {
            const name         = names[si];
            const enrollmentNo = `DS${semester}${String(si+1).padStart(3,'0')}`;

            // Upsert student with exact branch/semester values
            await StudentManagement.findOneAndUpdate(
                { enrollmentNo },
                { $setOnInsert: {
                    enrollmentNo, name,
                    semester,          // '1', '2', '3' — matches Config
                    branch: BRANCH,    // 'DS' — matches Config
                    password: 'demo123', role: 'student', faceEmbedding: []
                }},
                { upsert: true }
            );
            studentCount++;

            const periodOps = [], dailyOps = [], recordOps = [];

            for (const day of days) {
                const dateStr = day.toISOString().split('T')[0];
                let presentPeriods = 0;
                const lectures = [];

                for (let pi = 0; pi < PERIODS.length; pi++) {
                    const period      = PERIODS[pi];
                    const subject     = subjects[pi];
                    const teacher     = TEACHERS[pi];
                    const teacherName = TEACHER_NAMES[pi];
                    const room        = ROOMS[pi];
                    const present     = shouldAttend(enrollmentNo, dateStr, period);
                    const timerSecs   = present ? 2700 + pi * 120 : 0;

                    periodOps.push({ updateOne: {
                        filter: { enrollmentNo, date: day, period },
                        update: { $set: {
                            enrollmentNo, studentName: name,
                            semester, branch: BRANCH,
                            date: day, period, subject, teacher, teacherName, room,
                            status: present ? 'present' : 'absent',
                            checkInTime: present ? new Date(day.getTime() + (8+pi)*3600000) : null,
                            verificationType: 'initial',
                            wifiVerified: present, faceVerified: present,
                            timerSeconds: timerSecs
                        }},
                        upsert: true
                    }});
                    periodCount++;

                    if (present) {
                        presentPeriods++;
                        lectures.push({
                            period, subject, teacher, teacherName, room,
                            startTime: `${8+pi}:00`, endTime: `${9+pi}:00`,
                            attended: Math.floor(timerSecs/60), total: 60,
                            percentage: Math.round((timerSecs/3600)*100), present: true
                        });
                    }
                }

                const totalPeriods  = PERIODS.length;
                const pct           = Math.round((presentPeriods / totalPeriods) * 100);
                const dailyStatus   = pct >= THRESHOLD ? 'present' : 'absent';
                const totalClassMin = totalPeriods * 60;
                const attendedMin   = presentPeriods * 50;

                dailyOps.push({ updateOne: {
                    filter: { enrollmentNo, date: day },
                    update: { $set: {
                        enrollmentNo, studentName: name, date: day,
                        totalPeriods, presentPeriods, absentPeriods: totalPeriods - presentPeriods,
                        attendancePercentage: pct, dailyStatus, threshold: THRESHOLD,
                        semester, branch: BRANCH, calculatedAt: new Date()
                    }},
                    upsert: true
                }});
                dailyCount++;

                recordOps.push({ updateOne: {
                    filter: { enrollmentNo, date: day },
                    update: { $set: {
                        studentId: enrollmentNo, enrollmentNo, studentName: name,
                        semester, branch: BRANCH, date: day, status: dailyStatus,
                        timerValue: presentPeriods * 3000,
                        totalAttended: attendedMin, totalClassTime: totalClassMin,
                        dayPercentage: pct, lectures
                    }},
                    upsert: true
                }});
                recordCount++;
            }

            await PeriodAttendance.bulkWrite(periodOps, { ordered: false });
            await DailyAttendance.bulkWrite(dailyOps,   { ordered: false });
            await AttendanceRecord.bulkWrite(recordOps,  { ordered: false });
            console.log(`   ✅ ${name} (${enrollmentNo})`);
        }
        console.log('');
    }

    console.log('─'.repeat(50));
    console.log(`✅ Seed complete:`);
    console.log(`   👥 Students:         ${studentCount}`);
    console.log(`   📋 PeriodAttendance: ${periodCount} ops`);
    console.log(`   📅 DailyAttendance:  ${dailyCount} ops`);
    console.log(`   📊 AttendanceRecord: ${recordCount} ops`);
    console.log(`   Branch: ${BRANCH} | Semesters: ${SEMESTERS.join(', ')} | last 30 weekdays`);

    await mongoose.disconnect();
    console.log('\n🔌 Done.');
}

seed().catch(err => { console.error('❌', err.message); process.exit(1); });
