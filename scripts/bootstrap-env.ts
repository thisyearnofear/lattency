import { config } from "dotenv";

// Loads .env.local / .env so scripts (seed-base44, demo tooling) pick up the
// same environment as the app. Runs as a side-effect import before anything
// below it in the importing file.
config({ path: ".env.local" });
config({ path: ".env" });
