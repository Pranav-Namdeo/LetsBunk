require('dotenv').config();
const mongoose = require('mongoose');

// student_check.txt names for these sequence numbers
const OFFICIAL = {
  '0246CS241006': 'AARYAN CHAKRAWARTI',
  '0246CS241013': null, // not in student_check (skipped)
  '0246CS241014': 'ADAMYA MISHRA',
  '0246CS241018': 'ADITI CHOUKSEY',
  '0246CS241021': 'ADITI SARAF',
  '0246CS241023': 'ADITYA CHOUDHARI',
  '0246CS241024': 'ADITYA KHARE',
  '0246CS241026': 'ADITYA NAMDEO',
  '0246CS241030': null, // not in student_check (skipped)
  '0246CS241032': 'AJAY GOUND',
  '0246CS241036': 'AKSH RAGHUWANSHI'
};

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('studentmanagements');

  console.log('SEQ# | student_check.txt name | DB name (CS) | MATCH?');
  console.log('-----+------------------------+--------------+-------');

  for (const [csEnr, officialName] of Object.entries(OFFICIAL)) {
    const doc = await col.findOne({ enrollmentNo: csEnr }, { projection: { name:1, _id:0 } });
    const dbName = doc ? doc.name : 'NOT IN DB';
    const match = officialName
      ? dbName.toUpperCase().includes(officialName.split(' ')[0]) ? 'SAME' : 'DIFFERENT'
      : '(not in check list)';
    const ccEnr = csEnr.replace('0246CS', '0246CC');
    console.log(`${ccEnr} | official: ${officialName || 'N/A'} | db: ${dbName} | ${match}`);
  }

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
