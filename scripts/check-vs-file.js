require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");

// Parse student_check.txt - extract ALL enrollment numbers from both sections
const raw = fs.readFileSync("student_check.txt", "utf8");
const lines = raw.split(/\r?\n/);
const official = new Set();

for (const line of lines) {
  const parts = line.split(/\t/);
  // Named list format: S.N. \t Enrollment \t Name
  if (parts.length >= 3 && /^\d+$/.test(parts[0].trim()) && parts[1].trim().startsWith("0246")) {
    official.add(parts[1].trim());
  }
  // Plain enrollment list: just an enrollment number on its own line
  const trimmed = line.trim();
  if (/^0246[A-Z0-9]+$/i.test(trimmed)) {
    official.add(trimmed);
  }
}

console.log("Total official enrollments parsed:", official.size);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");
  const docs = await col.find({}, { projection: { enrollmentNo:1, name:1, branch:1, _id:0 } }).toArray();

  const extras = docs.filter(d => !official.has(d.enrollmentNo));

  console.log("Total in DB          :", docs.length);
  console.log("Not in official list :", extras.length);
  console.log("\nEnrollments in DB but NOT in student_check.txt:");
  extras.forEach(d => console.log("  " + d.enrollmentNo + " | " + d.name + " | " + d.branch));

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
