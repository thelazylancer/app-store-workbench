import { readFileSync } from "node:fs";
import { Pool } from "pg";

export function resolveTestDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equals = trimmed.indexOf("=");
      if (equals < 0 || trimmed.slice(0, equals).trim() !== "DATABASE_URL") continue;
      return trimmed.slice(equals + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // No .env in CI; tests skip below.
  }
  return undefined;
}

/** Returns a connected pool, or null when PostgreSQL is not available. */
export async function openTestPool(): Promise<Pool | null> {
  const url = resolveTestDatabaseUrl();
  if (!url) {
    console.warn("DATABASE_URL unavailable; skipping PostgreSQL-backed tests");
    return null;
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("SELECT 1");
    return pool;
  } catch (error) {
    console.warn(`PostgreSQL unavailable (${(error as Error).message}); skipping PostgreSQL-backed tests`);
    await pool.end().catch(() => {});
    return null;
  }
}
