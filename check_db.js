require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  
  const PeriodAttendance = db.collection('periodattendances');
   const records = await PeriodAttendance.find({
    $or: [
      { enrollmentNo: "0246Cs231021" },
      { studentName: "0246Cs231021" }
    ]
  }).sort({ updatedAt: -1 }).limit(10).toArray();
  console.log(JSON.stringify(records, null, 2));
  
  process.exit(0);
}
check().catch(console.error);
