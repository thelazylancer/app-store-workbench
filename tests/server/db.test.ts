import { afterAll, describe, expect, it } from "vitest";
import { openTestPool } from "./dbTestUtils";
import { runMigrations } from "../../server/lib/db";

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

describeDb("database migrations", () => {
  afterAll(async () => {
    await pool?.end();
  });

  it("creates every competitor table and re-runs without applying anything twice", async () => {
    await runMigrations(pool!);

    const tables = await pool!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'competitor_%'`,
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "competitor_assets",
      "competitor_batches",
      "competitor_country_hits",
      "competitor_packages",
      "competitor_snapshots",
      "competitor_versions",
    ]);

    const first = await pool!.query<{ count: number }>("SELECT count(*)::int AS count FROM schema_migrations");
    await runMigrations(pool!);
    const second = await pool!.query<{ count: number }>("SELECT count(*)::int AS count FROM schema_migrations");
    expect(second.rows[0]!.count).toBe(first.rows[0]!.count);
  });
});
