import pg from 'pg';
const { Client } = pg;

async function listTables() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_j98YRbUQOemE@ep-young-glade-a1z8ceap-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    await client.connect();
    console.log("Connected to DB");
    
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Existing tables:", res.rows.map(r => r.table_name));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

listTables();
