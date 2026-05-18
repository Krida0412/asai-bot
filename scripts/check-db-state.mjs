import pg from 'pg';
const { Client } = pg;

async function checkTable() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_j98YRbUQOemE@ep-young-glade-a1z8ceap-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    await client.connect();
    console.log("Connected to DB");
    
    const res = await client.query('SELECT count(*) FROM "user_memory"');
    console.log(`Table "user_memory" count: ${res.rows[0].count}`);
    
    const migrations = await client.query('SELECT * FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 5').catch(() => ({ rows: [] }));
    console.log("Latest migrations:", migrations.rows);

  } catch (err) {
    console.error("Error connecting or querying:", err.message);
  } finally {
    await client.end();
  }
}

checkTable();
