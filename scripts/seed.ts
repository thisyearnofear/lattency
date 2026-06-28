import "./bootstrap-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "../lib/db";

const SEED_FILE = process.argv[2] ?? "seeds/nairobi.sql";

async function main(): Promise<void> {
  const path = resolve(process.cwd(), SEED_FILE);
  const sql = readFileSync(path, "utf8");
  console.log(`seeding from ${SEED_FILE}`);
  await pool.query(sql);

  const { rows } = await pool.query<{ tier: string; n: string }>(
    `SELECT tier, COUNT(*)::text AS n
       FROM cafe_speed_stats
       GROUP BY tier
       ORDER BY tier`,
  );
  console.log("\ncafe_speed_stats by tier:");
  for (const r of rows) console.log(`  ${r.tier.padEnd(10)} ${r.n}`);
}

main()
  .catch((err) => {
    console.error("seed failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
