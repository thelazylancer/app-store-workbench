import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

/**
 * Applies every `.sql` file in `migrationsDir` in filename order, exactly once,
 * each inside its own transaction. Re-running with no new files is a no-op.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir = path.resolve("server/migrations"),
): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)",
  );

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) continue;

    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, now())", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
