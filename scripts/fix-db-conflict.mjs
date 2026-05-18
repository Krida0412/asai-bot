import pg from 'pg';
const { Client } = pg;

async function dropTable() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_j98YRbUQOemE@ep-young-glade-a1z8ceap-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    await client.connect();
    console.log("Connected to DB");
    
    console.log('Dropping table "user_memory"...');
    await client.query('DROP TABLE IF EXISTS "user_memory" CASCADE');
    console.log('Table "user_memory" dropped.');
    
    console.log('Dropping table "__drizzle_migrations" to reset history...');
    await client.query('DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE');
    console.log('Table "__drizzle_migrations" dropped.');

  } catch (err) {
    console.error("Error connecting or querying:", err.message);
  } finally {
    await client.end();
  }
}

dropTable();
