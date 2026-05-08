/**
 * format-database.js
 * Drops ALL collections in attendance_app — documents, indexes, metadata.
 * Mongoose will recreate collections + indexes on next server start.
 */
const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://adityarajsir162_db_user:fkfWRAFNcVNoVFWW@letsbunk.cdxihb7.mongodb.net/attendance_app?retryWrites=true&w=majority&appName=letsbunk';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('attendance_app');

  const collections = await db.listCollections().toArray();
  console.log(`\nDropping ${collections.length} collections...\n`);

  for (const col of collections) {
    await db.collection(col.name).drop();
    console.log(`  ✅ Dropped: ${col.name}`);
  }

  // Verify
  const remaining = await db.listCollections().toArray();
  console.log(`\nCollections remaining: ${remaining.length}`);
  console.log('\n✅ Database formatted. All collections, documents and indexes removed.');
  console.log('   Mongoose will recreate schemas + indexes on next server start.\n');

  await client.close();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
