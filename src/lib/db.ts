import { Pool, PoolClient } from "pg";
const globalDb = globalThis as unknown as { db?: Pool };
export const db =
  globalDb.db ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  });
if (process.env.NODE_ENV !== "production") globalDb.db = db;
export type SQL = Pick<PoolClient, "query">;
export async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  c: SQL,
  actor: string | null,
  action: string,
  id: string | null,
  detail: unknown = {},
) {
  await c.query(
    "INSERT INTO audit_events(actor_id,action,object_id,detail) VALUES($1,$2,$3,$4)",
    [actor, action, id, JSON.stringify(detail)],
  );
}
export async function notify(
  c: SQL,
  user: string,
  title: string,
  message: string,
) {
  await c.query(
    "INSERT INTO notifications(user_id,title,message) VALUES($1,$2,$3)",
    [user, title, message],
  );
}
export async function journal(
  c: SQL,
  key: string,
  user: string,
  kind: string,
  ref: string,
  lines: Record<string, number>,
) {
  if (Object.values(lines).reduce((a, b) => a + b, 0) !== 0)
    throw Error("Unbalanced journal");
  const j = await c.query(
    "INSERT INTO journal_entries(event_key,user_id,kind,reference_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
    [key, user, kind, ref],
  );
  if (!j.rowCount) return false;
  for (const [bucket, delta] of Object.entries(lines))
    await c.query(
      "INSERT INTO journal_lines(entry_id,bucket,delta) VALUES($1,$2,$3)",
      [j.rows[0].id, bucket, delta],
    );
  return true;
}
