require("dotenv").config();
const mongoose = require("mongoose");

// CC enrollment numbers that were renamed from CS but still have branch="Computer Science"
// They belong to the CC/cloud batch - update branch accordingly
const CC_WRONG_BRANCH = [
  "0246CC241006","0246CC241014","0246CC241018","0246CC241021",
  "0246CC241023","0246CC241024","0246CC241026","0246CC241032"
];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");

  // First show current state
  const docs = await col.find({ enrollmentNo: { $in: CC_WRONG_BRANCH } },
    { projection: { enrollmentNo:1, name:1, branch:1, _id:0 } }).toArray();
  console.log("Current state:");
  docs.forEach(d => console.log("  " + d.enrollmentNo + " | " + d.name + " | branch: " + d.branch));

  const result = await col.updateMany(
    { enrollmentNo: { $in: CC_WRONG_BRANCH } },
    { $set: { branch: "cloud", lastUpdated: new Date() } }
  );
  console.log("\nUpdated branch to 'cloud':", result.modifiedCount, "docs");

  // Final count by branch
  const byBranch = await col.aggregate([
    { $group: { _id: "$branch", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log("\nFinal DB breakdown:");
  let total = 0;
  byBranch.forEach(b => { console.log("  " + b._id + ": " + b.count); total += b.count; });
  console.log("  TOTAL: " + total);

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
