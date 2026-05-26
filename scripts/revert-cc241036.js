require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");

  // Revert 0246CC241036 back to 0246CS241036 (student_check.txt is authoritative)
  const doc = await col.findOne({ enrollmentNo: "0246CC241036" });
  if (!doc) { console.log("NOT FOUND: 0246CC241036"); await mongoose.disconnect(); return; }

  console.log("Found:", doc.enrollmentNo, doc.name);

  const newEnr   = "0246CS241036";
  const firstName = doc.name.split(" ")[0].toLowerCase();
  const newEmail  = firstName + ".cs241036@global.org.in";

  await col.updateOne(
    { enrollmentNo: "0246CC241036" },
    { $set: { enrollmentNo: newEnr, email: newEmail, password: newEnr, lastUpdated: new Date() } }
  );
  console.log("Reverted -> " + newEnr + " | email: " + newEmail);

  // Update attendance records
  const atCols = ["attendancerecords","periodattendances","dailyattendances","attendanceaudits","timetablehistories"];
  for (const c of atCols) {
    const r = await mongoose.connection.db.collection(c).updateMany(
      { enrollmentNo: "0246CC241036" }, { $set: { enrollmentNo: newEnr } }
    );
    if (r.modifiedCount > 0) console.log("  " + c + ": " + r.modifiedCount + " docs updated");
  }

  console.log("Done.");
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
