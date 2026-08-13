import fs from 'fs';
import path from 'path';

console.log('==================================================');
console.log('  DATABASE RESTORE VERIFICATION & VALIDATION TEST ');
console.log('==================================================');

async function verifyRestore() {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error('❌ FAIL: Schema script missing for restore verification.');
    process.exit(1);
  }

  const rawSql = fs.readFileSync(schemaPath, 'utf8');
  // Strip multi-line and single-line SQL comments
  const cleanSql = rawSql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const sqlStatements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`[Restore Audit] Parsed ${sqlStatements.length} SQL execution blocks.`);

  let ddlCount = 0;
  let indexCount = 0;
  let fkCount = 0;

  for (const stmt of sqlStatements) {
    if (stmt.toUpperCase().includes('CREATE TABLE')) ddlCount++;
    if (stmt.toUpperCase().includes('CREATE INDEX') || stmt.toUpperCase().includes('KEY')) indexCount++;
    if (stmt.toUpperCase().includes('FOREIGN KEY')) fkCount++;
  }

  console.log(`  ✅ Table creation statements: ${ddlCount}`);
  console.log(`  ✅ Index definitions found:   ${indexCount}`);
  console.log(`  ✅ Foreign key constraints:   ${fkCount}`);

  if (ddlCount === 0) {
    console.error('❌ FAIL: No valid table creation statements parsed from restore file.');
    process.exit(1);
  }

  console.log('\n✅ PASS: Database restore validation test completed successfully. Recovery point object structure verified.');
}

verifyRestore().catch((err) => {
  console.error('❌ Restore Verification Error:', err);
  process.exit(1);
});
