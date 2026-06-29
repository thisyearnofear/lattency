import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

// Single shared Pool per process. On Vercel, each warm function reuses this
// across invocations; on Node dev, HMR keeps it cached on globalThis. The
// connection style is identical to what we'll point at Aurora in prod —
// only the DATABASE_URL changes.

declare global {
  var __lattency_pg_pool: Pool | undefined;
}

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  const sslDisabled = process.env.DATABASE_SSL === "false";

  const config: PoolConfig = {
    connectionString,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    // Aurora Serverless v2 with MinCapacity=0 auto-pauses; first connection
    // can take 15-30s to wake the instance.
    connectionTimeoutMillis: 45_000,
  };

  return new Pool(config);
}

export const pool: Pool = globalThis.__lattency_pg_pool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__lattency_pg_pool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] | undefined);
}

/** A `query`-compatible function bound to a single transactional client.
 *  Passed into `withTransaction(fn)` so multiple inserts share one BEGIN/COMMIT. */
export type Executor = typeof query;

/**
 * Runs the callback inside a database transaction. The callback receives an
 * `Executor` whose calls go through the same connection as the surrounding
 * BEGIN/COMMIT, so partial work rolls back if anything throws.
 *
 * Note: `REFRESH MATERIALIZED VIEW CONCURRENTLY` cannot run inside a
 * transaction — call `refreshStatsView()` AFTER the transaction returns.
 */
export async function withTransaction<T>(
  fn: (exec: Executor) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exec: Executor = (text, params) =>
      client.query(text, params as unknown[] | undefined);
    const result = await fn(exec);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* if rollback fails the client is dead anyway — release will dispose it */
    }
    throw err;
  } finally {
    client.release();
  }
}
