require("dotenv").config();
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");
  const total = await col.countDocuments();
  const byBranch = await col.aggregate([
    { $group: { _id: "$branch", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  const bySem = await col.aggregate([
    { $group: { _id: "$semester", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log("Total students in DB:", total);
  console.log("\nBy branch:");
  byBranch.forEach(b => console.log("  " + b._id + " : " + b.count));
  console.log("\nBy semester:");
  bySem.forEach(b => console.log("  Sem " + b._id + " : " + b.count));
  await mongoose.disconnect();
}).catch(e => console.error(e.message));
