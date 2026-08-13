import fs from 'fs';
import path from 'path';

console.log('==================================================');
console.log('   DATABASE BACKUP VERIFICATION & INTEGRITY CHECK ');
console.log('==================================================');

async function verifyBackup() {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ FAIL: Database schema backup file missing at:', schemaPath);
    process.exit(1);
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const sizeKb = (schemaContent.length / 1024).toFixed(2);

  console.log(`[Backup Audit] Schema file found: ${schemaPath}`);
  console.log(`[Backup Audit] Schema file size: ${sizeKb} KB`);

  // Verify critical tables exist in backup DDL
  const requiredTables = [
    'companies',
    'users',
    'clients',
    'bookings',
    'email_templates',
    'sent_emails',
    'activity_logs',
    'airports'
  ];

  let missingCount = 0;
  for (const table of requiredTables) {
    if (schemaContent.includes(`CREATE TABLE IF NOT EXISTS \`${table}\``) || schemaContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      console.log(`  ✅ Verified Table DDL: ${table}`);
    } else {
      console.error(`  ❌ MISSING Table DDL: ${table}`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    console.error(`\n❌ FAIL: ${missingCount} required table definition(s) missing from database backup schema.`);
    process.exit(1);
  }

  console.log('\n✅ PASS: Database backup integrity check completed successfully.');
}

verifyBackup().catch((err) => {
  console.error('❌ Backup Verification Error:', err);
  process.exit(1);
});
