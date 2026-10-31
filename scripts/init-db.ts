import { connectToDatabase } from '../lib/db/mongodb';
import { UserModel } from '../lib/db/models/user.model';

async function init() {
  console.log('--- CIT Nexus MongoDB Schema Initialization ---');
  const db = await connectToDatabase();
  if (!db) {
    console.error('Failed to connect to any MongoDB server.');
    process.exit(1);
  }

  console.log('Ensuring User collection and schema indexes exist in MongoDB...');
  await UserModel.createCollection();
  await UserModel.init();

  const collections = await db.connection.db?.listCollections().toArray();
  console.log('\nActive Collections in current database:');
  collections?.forEach(c => console.log(`  - ${c.name}`));

  const userCount = await UserModel.countDocuments();
  console.log(`\nTotal users currently registered: ${userCount}`);
  console.log('\n>>> SUCCESS: MongoDB schema and collections are verified and active! <<<\n');
  process.exit(0);
}

init().catch(err => {
  console.error('Error during DB init:', err);
  process.exit(1);
});

