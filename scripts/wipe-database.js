/**
 * wipe-database.js
 *
 * Wipes ALL attendance/operational data from the database while preserving
 * configuration, users, teachers, timetables, subjects, and settings.
 *
 * ⚠️  IRREVERSIBLE. Run mongoexport backups BEFORE executing this script.
 *
 * Usage:
 *   node scripts/wipe-database.js
 *
 * The script will prompt for confirmation before proceeding.
 */

'use strict';

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';

// ── Collections to WIPE (operational / attendance data) ──────────────────────
const WIPE_COLLECTIONS = [
  'attendancerecords',
  'attendances',
  'dailyattendances',
  'periodattendances',
  'attendanceaudits',
  'timetablehistories',
  'randomrings',
  'attendancehistories',
];

// ── Collections to PRESERVE (configuration / master data) ────────────────────
const PRESERVE_COLLECTIONS = [
  'configs',          // branches, semesters, departments
  'users',            // login accounts
  'teachers',
  'timetables',
  'subjects',
  'classrooms',
  'settings',
  'systemsettings',
  'holidays',
];

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // --confirm flag: skip interactive prompt (used by MIGRATE_ENDPOINTS.bat)
  const autoConfirm = process.argv.includes('--confirm');

  console.log('\n' + '='.repeat(60));
  console.log('  DATABASE WIPE UTILITY');
  console.log('='.repeat(60));
  console.log(`\n  Target: ${MONGO_URI}`);
  console.log('\n  Collections that will be WIPED:');
  WIPE_COLLECTIONS.forEach(c => console.log(`    🗑️  ${c}`));
  console.log('\n  Collections that will be PRESERVED:');
  PRESERVE_COLLECTIONS.forEach(c => console.log(`    ✅  ${c}`));
  console.log('\n' + '='.repeat(60));

  if (!autoConfirm) {
    const answer = await prompt('\n  Type  WIPE  to confirm, or anything else to cancel: ');
    if (answer.trim() !== 'WIPE') {
      console.log('\n  ❌ Cancelled. No data was deleted.\n');
      process.exit(0);
    }
  } else {
    console.log('\n  ✅ Auto-confirmed via --confirm flag (called from MIGRATE_ENDPOINTS.bat)');
  }

  console.log('\n  Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Discover all collections in the database
  const allCollections = (await db.listCollections().toArray()).map(c => c.name);
  console.log(`\n  Found ${allCollections.length} collections in database.\n`);

  const results = {};

  for (const colName of allCollections) {
    if (WIPE_COLLECTIONS.includes(colName)) {
      const result = await db.collection(colName).deleteMany({});
      results[colName] = { action: 'wiped', deleted: result.deletedCount };
      console.log(`  🗑️  ${colName}: ${result.deletedCount} documents deleted`);
    } else if (PRESERVE_COLLECTIONS.includes(colName)) {
      const count = await db.collection(colName).countDocuments();
      results[colName] = { action: 'preserved', count };
      console.log(`  ✅  ${colName}: preserved (${count} documents)`);
    } else {
      // Unknown collection — report but don't touch
      const count = await db.collection(colName).countDocuments();
      results[colName] = { action: 'untouched', count };
      console.log(`  ⚠️  ${colName}: untouched — not in either list (${count} documents)`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ✅ Wipe complete. Clean slate ready.');
  console.log('='.repeat(60));
  console.log('\n  Next steps:');
  console.log('  1. Re-import preserved collections if needed (mongoimport)');
  console.log('  2. Re-seed students from scratch with real data only');
  console.log('  3. Verify app login and attendance flow\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\n  ❌ Error:', err.message);
  process.exit(1);
});
