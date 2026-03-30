import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../apps/server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260331000000_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('🚀 Running migration on Supabase...');

  // Note: Standard Supabase client doesn't support running raw SQL strings with multiple commands easily
  // via the RPC or public API without a specific Postgres function.
  // Instead, we will split by ';' and execute basic commands if possible, or advise using SQL Editor
  // if the schema is too complex for simple RPC execution.
  
  // Actually, for a full schema with triggers and RLS, the SQL Editor is the SAFEST way.
  // However, I can try to use a temporary RPC function to execute the whole block.
  
  console.log('---------------------------------------------------------');
  console.log('The schema contains triggers, extensions, and complex RLS.');
  console.log('The most reliable way to apply this is the SQL Editor.');
  console.log('---------------------------------------------------------');
  
  // Attempting execution via RPC (requires 'exec_sql' function to exist on DB)
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.log('Note: RPC "exec_sql" not found (normal for new projects).');
    console.log('Please copy the content of the migration file to the Supabase SQL Editor.');
    console.log('Path: supabase/migrations/20260331000000_initial_schema.sql');
  } else {
    console.log('✅ Migration successful!');
  }
}

runMigration();
