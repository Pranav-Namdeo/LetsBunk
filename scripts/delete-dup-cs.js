require("dotenv").config();
const mongoose = require("mongoose");

// These CS entries have a CC equivalent for the same student - delete the CS ones
const DELETE_CS = [
  "0246CS241006",  // Aaryan Chakrawarti  -> CC241006 exists
  "0246CS241014",  // Adamya Mishra       -> CC241014 exists
  "0246CS241018",  // Aditi Chouksey      -> CC241018 exists
  "0246CS241021",  // Aditi Saraf         -> CC241021 exists
  "0246CS241023",  // Aditya Choudhari    -> CC241023 exists
  "0246CS241024",  // Aditya Khare        -> CC241024 exists
  "0246CS241026",  // Aditya Namdeo       -> CC241026 exists
  "0246CS241032",  // Ajay Gound          -> CC241032 exists
];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");

  // Confirm each before deleting
  for (const enr of DELETE_CS) {
    const doc = await col.findOne({ enrollmentNo: enr });
    const ccEnr = enr.replace("0246CS", "0246CC");
    const ccDoc = await col.findOne({ enrollmentNo: ccEnr });
    console.log("DELETE CS: " + enr + " | " + (doc ? doc.name : "NOT FOUND") + " | CC exists: " + (ccDoc ? ccDoc.enrollmentNo : "NO"));
  }

  const result = await col.deleteMany({ enrollmentNo: { $in: DELETE_CS } });
  console.log("\nDeleted:", result.deletedCount, "CS entries");

  const total = await col.countDocuments();
  console.log("DB total now:", total);

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
