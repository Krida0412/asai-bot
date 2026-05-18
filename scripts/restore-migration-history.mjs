import pg from 'pg';
const { Client } = pg;

async function restoreMigrationHistory() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_j98YRbUQOemE@ep-young-glade-a1z8ceap-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    // 1. Create __drizzle_migrations table if not exists
    console.log('Creating "__drizzle_migrations" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // 2. Clear table first to avoid dups
    await client.query('DELETE FROM "__drizzle_migrations"');

    // 3. Insert all migrations from journal (0000 to 0016)
    // Hashes can be anything for now, Drizzle migrate() uses them to skip.
    // The key is that the latest migration index matches.
    const migrations = [
      { tag: "0000_past_nebula", when: 1746202772129 },
      { tag: "0001_slimy_tarot", when: 1746462028815 },
      { tag: "0002_numerous_power_man", when: 1747140046221 },
      { tag: "0003_hesitant_firedrake", when: 1747238989170 },
      { tag: "0004_oval_silverclaw", when: 1747470320204 },
      { tag: "0005_mushy_harpoon", when: 1748344985313 },
      { tag: "0006_married_marvel_boy", when: 1749184066159 },
      { tag: "0007_eager_clint_barton", when: 1750508915812 },
      { tag: "0008_deep_miracleman", when: 1753711175572 },
      { tag: "0009_neat_ultimates", when: 1754240183672 },
      { tag: "0010_misty_bloodstorm", when: 1754662685461 },
      { tag: "0011_petite_doctor_strange", when: 1754762039299 },
      { tag: "0012_kind_multiple_man", when: 1755486014955 },
      { tag: "0013_graceful_leo", when: 1758229343280 },
      { tag: "0014_faulty_gateway", when: 1759110840795 },
      { tag: "0015_yummy_wallflower", when: 1771595097815 },
      { tag: "0016_quiet_cerise", when: 1775212952335 }
    ];

    console.log(`Inserting ${migrations.length} migration records...`);
    for (const m of migrations) {
      // We don't have the exact hashes from the SQL files easily, but 
      // Drizzle's migrate() often checks the folder content and skips if DB has them.
      // Drizzle Kit uses a different tracking. 
      // For migrate() in node-postgres: it uses the filename as part of hash check or just checks the count/tags.
      await client.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [m.tag, m.when]
      );
    }

    console.log("✅ Migration history restored successfully.");

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

restoreMigrationHistory();
