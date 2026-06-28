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
