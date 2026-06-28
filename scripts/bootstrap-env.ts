import { config } from "dotenv";

// Side-effect import: runs in source order before any other imports below it,
// so DATABASE_URL is in process.env by the time lib/db evaluates buildPool().
config({ path: ".env.local" });
config({ path: ".env" });
