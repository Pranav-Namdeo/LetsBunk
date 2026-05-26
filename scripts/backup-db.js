require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,"-");
const FILE = path.join(__dirname, "..", "backups", "backup-" + timestamp + ".json");
fs.mkdirSync(path.dirname(FILE), { recursive: true });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const backup = {};

  for (const col of collections) {
    backup[col.name] = await db.collection(col.name).find({}).toArray();
    console.log("  " + col.name + ": " + backup[col.name].length + " docs");
  }

  fs.writeFileSync(FILE, JSON.stringify(backup, null, 2), "utf8");
  const sizeMB = (fs.statSync(FILE).size / 1024 / 1024).toFixed(2);
  console.log("\nSaved: " + FILE);
  console.log("Size : " + sizeMB + " MB");
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
