import "./bootstrap-env";
import { pool } from "../lib/db";

async function main(): Promise<void> {
  const { rows } = await pool.query<{
    pg: string;
    postgis: string;
  }>(`
    SELECT
      version() AS pg,
      postgis_full_version() AS postgis
  `);
  console.log("postgres :", rows[0].pg.split(" on ")[0]);
  console.log("postgis  :", rows[0].postgis);
  console.log("\nconnection OK");
}

main()
  .catch((err) => {
    console.error("db-check failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
