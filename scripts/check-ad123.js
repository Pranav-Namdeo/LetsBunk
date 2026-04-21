require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const PA = mongoose.model('PA', new mongoose.Schema({}, {strict:false}), 'periodattendances');
    const AR = mongoose.model('AR', new mongoose.Schema({}, {strict:false}), 'attendancerecords');
    const DA = mongoose.model('DA', new mongoose.Schema({}, {strict:false}), 'dailyattendances');

    const d1 = new Date('2026-04-22T00:00:00.000Z');
    const d2 = new Date('2026-04-23T00:00:00.000Z');

    const pa = await PA.find({ enrollmentNo: 'ad123', date: { $gte: d1, $lt: d2 } }).lean();
    const ar = await AR.find({ enrollmentNo: 'ad123', date: { $gte: d1, $lt: d2 } }).lean();
    const da = await DA.find({ enrollmentNo: 'ad123', date: { $gte: d1, $lt: d2 } }).lean();

    console.log('\n=== PeriodAttendance ===');
    pa.forEach(r => console.log(r.period, r.status, 'timerSec:', r.timerSeconds, 'date:', r.date));

    console.log('\n=== AttendanceRecord ===');
    ar.forEach(r => console.log('status:', r.status, 'pct:', r.dayPercentage, 'attended:', r.totalAttended, 'date:', r.date));

    console.log('\n=== DailyAttendance ===');
    da.forEach(r => console.log('status:', r.status, 'pct:', r.dayPercentage, 'date:', r.date));

    if (!pa.length && !ar.length && !da.length) console.log('NO DATA found for ad123 on 2026-04-22');

    await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
