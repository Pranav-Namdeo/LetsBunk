const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://adityarajsir162_db_user:fkfWRAFNcVNoVFWW@letsbunk.cdxihb7.mongodb.net/attendance_app?retryWrites=true&w=majority&appName=letsbunk';
const targets = ['studentmanagements','logs','schedules','classes','attendancesessions','verifications','students'];
async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('attendance_app');
  for (const col of targets) {
    const r = await db.collection(col).deleteMany({});
    console.log('Deleted', r.deletedCount, 'from', col);
  }
  await client.close();
  console.log('Done.');
}
main().catch(console.error);
