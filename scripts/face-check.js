require("dotenv").config();
const mongoose = require("mongoose");

const TARGETS = [
  "0246CC241008","0246CC241014","0246CC241017","0246CC241018","0246CC241019",
  "0246CC241021","0246CC241023","0246CC241024","0246CC241026","0246CC241032",
  "0246CC1008","0246CS241388","0246Cs231021","pranav","0246CC241006"
];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection("studentmanagements");
  const docs = await col.find(
    { enrollmentNo: { $in: TARGETS } },
    { projection: { enrollmentNo:1, name:1, faceEmbedding:1, faceEnrolledAt:1, photoUrl:1, _id:0 } }
  ).toArray();

  let withFace = 0, withoutFace = 0;
  console.log("Enrollment          | Name                    | Face Data");
  console.log("--------------------+-------------------------+----------");
  for (const d of docs) {
    const hasFace = Array.isArray(d.faceEmbedding) && d.faceEmbedding.length > 0;
    const hasPhoto = !!d.photoUrl;
    const status = hasFace ? "YES (embedding " + d.faceEmbedding.length + " floats)" + (d.faceEnrolledAt ? " enrolled "+d.faceEnrolledAt.toISOString().slice(0,10) : "") : (hasPhoto ? "photo only" : "NO");
    if (hasFace) withFace++; else withoutFace++;
    console.log(d.enrollmentNo.padEnd(20) + "| " + (d.name||"").padEnd(24) + "| " + status);
  }
  console.log("\nWith face embedding : " + withFace);
  console.log("Without            : " + withoutFace);
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
