import { runMigrations, getMigrationStatus } from './migrate.js';
import { getDatabase, closeDatabase } from './connection.js';

async function main() {
  const command = process.argv[2] || 'migrate';
  const db = getDatabase();

  try {
    if (command === 'migrate') {
      console.log('📦 Starting LBSC database migrations...');
      const result = await runMigrations(db);
      console.log(`✅ Migrations completed: ${result.applied.length} applied, ${result.skipped.length} already up-to-date.`);
    } else if (command === 'status') {
      console.log('📊 Migration status:');
      const status = await getMigrationStatus(db);
      console.table(status);
    } else {
      console.error(`Unknown command: ${command}. Use "migrate" or "status".`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration command failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
