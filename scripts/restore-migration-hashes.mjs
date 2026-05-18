import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
const { Client } = pg;

const migrationsFolder = path.join(process.cwd(), 'src/lib/db/migrations/pg');
const journalPath = path.join(migrationsFolder, 'meta/_journal.json');

async function fixMigrations() {
  const _journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_j98YRbUQOemE@ep-young-glade-a1z8ceap-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    await client.connect();
    console.log("Connected to DB. Clearing old migration table...");
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `).catch(() => {});
    
    await client.query(`DELETE FROM "__drizzle_migrations"`).catch(() => {});
    
    // We will dynamically import Drizzle's own migrator reader so we get the 100% exact hash 
    // without guessing the crypto format.
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    const migrations = readMigrationFiles({ migrationsFolder });
    
    console.log(`Found ${migrations.length} migrations to insert.`);
    
    for (const m of migrations) {
      await client.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [m.hash, m.folderMillis]
      );
      console.log(`Inserted migration from ${m.folderMillis} with hash ${m.hash}...`);
    }

    console.log("✅ Drizzle auto-migration history restored accurately.");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}
fixMigrations();
