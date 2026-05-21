require('dotenv').config();
const mongoose = require('mongoose');

const RENAMES = [
  { from: '0246CS241006', to: '0246CC241006' },
  { from: '0246CS241014', to: '0246CC241014' },
  { from: '0246CS241018', to: '0246CC241018' },
  { from: '0246CS241021', to: '0246CC241021' },
  { from: '0246CS241023', to: '0246CC241023' },
  { from: '0246CS241024', to: '0246CC241024' },
  { from: '0246CS241026', to: '0246CC241026' },
  { from: '0246CS241032', to: '0246CC241032' },
  { from: '0246CS241036', to: '0246CC241036' },
];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const collections = ['attendancerecords','periodattendances','dailyattendances','attendanceaudits','timetablehistories'];

  for (const { from, to } of RENAMES) {
    for (const colName of collections) {
      const col = db.collection(colName);
      const r = await col.updateMany({ enrollmentNo: from }, { $set: { enrollmentNo: to } });
      if (r.modifiedCount > 0)
        console.log(`  ${colName}: ${from} -> ${to}  (${r.modifiedCount} docs)`);
    }
    // attendancerecords also has studentId field (legacy)
    const ar = db.collection('attendancerecords');
    const r2 = await ar.updateMany({ studentId: from }, { $set: { studentId: to } });
    if (r2.modifiedCount > 0)
      console.log(`  attendancerecords.studentId: ${from} -> ${to}  (${r2.modifiedCount} docs)`);
  }

  console.log('\nDone — all attendance references updated.');
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
