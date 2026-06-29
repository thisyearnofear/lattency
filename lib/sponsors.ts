// Sponsor data now flows through the materialized view (one sponsorship
// per café via the unique partial index added in migration 0007). The
// Sponsor type itself is re-exported from lib/types.ts so call sites have
// a single import path.

export type { Sponsor } from "./types";
