import { runMigrations, getMigrationStatus } from './migrate.js';
import { getDatabase, closeDatabase } from './connection.js';
import { AuthService } from '../auth/authService.js';

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
    } else if (command === 'reset-admin') {
      const newPassword = process.argv[3];
      if (!newPassword || newPassword.trim().length < 8) {
        console.error('❌ Error: Password must be at least 8 characters long.');
        console.error('Usage: tsx src/server/db/cli.ts reset-admin <new-password>');
        process.exit(1);
      }
      await AuthService.resetAdminPassword(newPassword.trim(), db);
      console.log('✅ Super Admin password reset successfully.');
    } else if (command === 'ensure-admin') {
      await AuthService.ensureSuperAdmin(db);
      console.log('✅ Super Admin account ensured.');
    } else {
      console.error(`Unknown command: ${command}. Use "migrate", "status", "reset-admin <new-password>", or "ensure-admin".`);
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
