import { readFile, readdir } from "node:fs/promises";
import { db } from "../src/lib/db";
const c = await db.connect();
try {
  await c.query("SELECT pg_advisory_lock(193764201)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
        .rowCount
    )
      continue;
    await c.query("BEGIN");
    try {
      await c.query(await readFile(`migrations/${name}`, "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await c.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await c.query("SELECT pg_advisory_unlock(193764201)");
  c.release();
  await db.end();
}
