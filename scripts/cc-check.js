require('dotenv').config();
const mongoose = require('mongoose');

const CC_MISSING = [
  '0246CC241006','0246CC241013','0246CC241014','0246CC241018',
  '0246CC241021','0246CC241023','0246CC241024','0246CC241026',
  '0246CC241030','0246CC241032','0246CC241036'
];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('studentmanagements');

  for (const cc of CC_MISSING) {
    const seq = cc.replace('0246CC', '0246CS'); // e.g. 0246CC241006 -> 0246CS241006
    const csDoc = await col.findOne({ enrollmentNo: seq }, { projection: { enrollmentNo:1, name:1, branch:1, semester:1, _id:0 } });
    const ccDoc = await col.findOne({ enrollmentNo: cc }, { projection: { enrollmentNo:1, name:1, _id:0 } });
    console.log(`CC: ${cc} | CS equivalent: ${seq}`);
    console.log(`  CS in DB : ${csDoc ? JSON.stringify(csDoc) : 'NOT FOUND'}`);
    console.log(`  CC in DB : ${ccDoc ? JSON.stringify(ccDoc) : 'NOT FOUND'}`);
  }

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
