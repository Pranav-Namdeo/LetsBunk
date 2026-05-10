/**
 * One-time script: purge PeriodAttendance, TimetableHistory, AttendanceRecord
 * records whose subject name is NOT in the Subject collection.
 *
 * Run: node scripts/purge-ghost-subjects.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

const Subject          = mongoose.model('Subject',          new mongoose.Schema({}, { strict: false }));
const PeriodAttendance = mongoose.model('PeriodAttendance', new mongoose.Schema({}, { strict: false }));
const TimetableHistory = mongoose.model('TimetableHistory', new mongoose.Schema({}, { strict: false }));
const AttendanceRecord = mongoose.model('AttendanceRecord', new mongoose.Schema({}, { strict: false }));

async function purge() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // 1. Get all valid subject names from Subject collection
    const allSubjects = await Subject.find({}, { subjectName: 1, semester: 1, branch: 1 }).lean();
    const validMap = {};   // "semester||branch" → Set<subjectName>
    allSubjects.forEach(s => {
        const key = `${s.semester}||${s.branch}`;
        if (!validMap[key]) validMap[key] = new Set();
        if (s.subjectName) validMap[key].add(s.subjectName);
    });

    console.log('📚 Valid subjects per semester/branch:');
    Object.entries(validMap).forEach(([k, v]) => console.log(`  ${k}: [${[...v].join(', ')}]`));
    console.log();

    let totalPA = 0, totalTH = 0, totalAR = 0;

    for (const [key, validSubjects] of Object.entries(validMap)) {
        const [semester, branch] = key.split('||');

        // --- PeriodAttendance ---
        const paSubjects = await PeriodAttendance.distinct('subject', { semester, branch });
        const orphanPA   = paSubjects.filter(s => s && !validSubjects.has(s));
        if (orphanPA.length > 0) {
            const r = await PeriodAttendance.deleteMany({ semester, branch, subject: { $in: orphanPA } });
            totalPA += r.deletedCount;
            console.log(`🗑️  PeriodAttendance [${semester}/${branch}]: deleted ${r.deletedCount} records for [${orphanPA.join(', ')}]`);
        }

        // --- TimetableHistory ---
        const thSubjects = await TimetableHistory.distinct('subject', { semester, branch });
        const orphanTH   = thSubjects.filter(s => s && !validSubjects.has(s));
        if (orphanTH.length > 0) {
            const r = await TimetableHistory.deleteMany({ semester, branch, subject: { $in: orphanTH } });
            totalTH += r.deletedCount;
            console.log(`🗑️  TimetableHistory [${semester}/${branch}]: deleted ${r.deletedCount} records for [${orphanTH.join(', ')}]`);
        }
    }

    // --- AttendanceRecord: clean lectures array entries with orphan subjects ---
    // Pull all valid subject names (flat set across all sem/branch)
    const allValidSubjects = new Set(allSubjects.map(s => s.subjectName).filter(Boolean));

    const arCursor = AttendanceRecord.find({}).lean().cursor();
    for await (const rec of arCursor) {
        if (!Array.isArray(rec.lectures) || rec.lectures.length === 0) continue;
        const cleaned = rec.lectures.filter(l => !l.subject || allValidSubjects.has(l.subject));
        if (cleaned.length !== rec.lectures.length) {
            await AttendanceRecord.updateOne({ _id: rec._id }, { $set: { lectures: cleaned } });
            totalAR++;
        }
    }
    if (totalAR > 0) console.log(`🗑️  AttendanceRecord: cleaned lectures in ${totalAR} records`);

    console.log(`\n✅ Done — PA: ${totalPA}, TH: ${totalTH}, AR: ${totalAR} records cleaned`);
    await mongoose.disconnect();
}

purge().catch(e => { console.error('❌', e); process.exit(1); });
