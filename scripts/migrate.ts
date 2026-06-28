import "./bootstrap-env";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pool } from "../lib/db";

const MIGRATIONS_DIR = resolve(process.cwd(), "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedNames(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  return new Set(rows.map((r) => r.name));
}

function pendingMigrations(applied: Set<string>): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !applied.has(f));
}

async function applyMigration(file: string): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      file,
    ]);
    await client.query("COMMIT");
    console.log(`  applied ${file}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(`failed ${file}: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log("migrating against", redactUrl(process.env.DATABASE_URL ?? ""));
  await ensureMigrationsTable();
  const applied = await appliedNames();
  const pending = pendingMigrations(applied);
  if (pending.length === 0) {
    console.log("no pending migrations");
    return;
  }
  console.log(`${pending.length} pending migration(s)`);
  for (const file of pending) {
    await applyMigration(file);
  }
  console.log("done");
}

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
