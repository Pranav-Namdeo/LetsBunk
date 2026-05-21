require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('studentmanagements');
  const cs  = await col.findOne({ enrollmentNo: '0246CS241095' });
  const old = await col.findOne({ enrollmentNo: '0246CS253D01' });
  [cs, old].filter(Boolean).forEach(s => console.log(JSON.stringify({
    e: s.enrollmentNo, b: s.branch, sem: s.semester, email: s.email, pass: s.password
  })));
  await mongoose.disconnect();
}).catch(e => console.error(e.message));
