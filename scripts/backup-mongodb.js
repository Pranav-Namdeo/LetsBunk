#!/usr/bin/env node
/**
 * backup-mongodb.js
 * Downloads a full backup of the attendance_app MongoDB database.
 * Exports every collection to JSON files in ./backup/YYYY-MM-DD/
 *
 * Usage: node scripts/backup-mongodb.js
 */

const { MongoClient } = require('mongodb');
const fs   = require('fs');
const path = require('path');

const URI = 'mongodb+srv://adityarajsir162_db_user:fkfWRAFNcVNoVFWW@letsbunk.cdxihb7.mongodb.net/attendance_app?retryWrites=true&w=majority&appName=letsbunk';
const DB_NAME = 'attendance_app';

// Backup directory: ./backup/2026-05-07/
const today   = new Date().toISOString().split('T')[0];
const backupDir = path.join(__dirname, '..', 'backup', today);

async function main() {
  console.log(`\n📦 MongoDB Backup — ${today}`);
  console.log(`   Target: ${backupDir}\n`);

  // Create backup directory
  fs.mkdirSync(backupDir, { recursive: true });

  const client = new MongoClient(URI);
  await client.connect();
  console.log('✅ Connected to MongoDB Atlas\n');

  const db = client.db(DB_NAME);

  // List all collections
  const collections = await db.listCollections().toArray();
  console.log(`📋 Collections found: ${collections.length}`);
  collections.forEach(c => console.log(`   - ${c.name}`));
  console.log();

  let totalDocs = 0;

  for (const col of collections) {
    const name = col.name;
    process.stdout.write(`   Exporting ${name.padEnd(30)} `);

    try {
      const docs = await db.collection(name).find({}).toArray();
      const outFile = path.join(backupDir, `${name}.json`);
      fs.writeFileSync(outFile, JSON.stringify(docs, null, 2), 'utf8');
      totalDocs += docs.length;
      console.log(`${docs.length} docs → ${name}.json`);
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
    }
  }

  // Write a manifest
  const manifest = {
    backupDate: today,
    database: DB_NAME,
    collections: collections.map(c => c.name),
    totalDocuments: totalDocs,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2));

  await client.close();

  console.log(`\n✅ Backup complete!`);
  console.log(`   Location : ${backupDir}`);
  console.log(`   Collections: ${collections.length}`);
  console.log(`   Total docs : ${totalDocs}`);

  // Show file sizes
  console.log('\n📁 Files:');
  const files = fs.readdirSync(backupDir).sort();
  files.forEach(f => {
    const size = fs.statSync(path.join(backupDir, f)).size;
    const kb = (size / 1024).toFixed(1);
    console.log(`   ${f.padEnd(45)} ${kb} KB`);
  });
}

main().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
});
