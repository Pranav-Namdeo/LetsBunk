require('dotenv').config();
const mongoose = require('mongoose');

// CS -> CC renames (same student, branch code changed)
// CS241013 and CS241030 are NOT in student_check.txt — skip them, don't rename
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
  const col = mongoose.connection.collection('studentmanagements');
  let ok = 0, notFound = 0, err = 0;

  for (const { from, to } of RENAMES) {
    const doc = await col.findOne({ enrollmentNo: from });
    if (!doc) { console.log('NOT FOUND: ' + from); notFound++; continue; }

    // Rebuild email with new CC suffix: firstname.cc241006@global.org.in
    const firstName = doc.name.split(' ')[0].toLowerCase();
    const suffix    = to.replace(/^0246/i, '').toLowerCase(); // e.g. cc241006
    const newEmail  = firstName + '.' + suffix + '@global.org.in';

    try {
      await col.updateOne(
        { enrollmentNo: from },
        { $set: {
            enrollmentNo: to,
            email:        newEmail,
            password:     to,        // password = new enrollmentNo, matching convention
            branch:       'Computer Science', // keep same branch value
            lastUpdated:  new Date()
        }}
      );
      console.log('  RENAMED: ' + from + ' -> ' + to + '  (' + doc.name + ')  email: ' + newEmail);
      ok++;
    } catch (ex) {
      console.error('  ERR: ' + from + ' -> ' + to + ' : ' + ex.message);
      err++;
    }
  }

  console.log('\n--- DONE ---');
  console.log('Renamed  : ' + ok);
  console.log('Not found: ' + notFound);
  console.log('Errors   : ' + err);
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
