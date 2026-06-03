import fs from 'fs';
import path from 'path';
import db from './connection';

async function runMigration() {
  console.log('Starting database migration...');
  
  try {
    const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split the SQL file into separate statements
    const statements = sql.split(/;\s*$/m).filter(stmt => stmt.trim());
    
    for (let statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await db.query(statement);
      }
    }
    
    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

runMigration();
