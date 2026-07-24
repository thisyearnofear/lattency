# Base44 Migration Plan — Lattency

**Deadline:** July 28 (6 days)
**Prize:** $10,000
**Strategy:** Backend-only Base44 — keep Next.js frontend on Vercel (static export), replace all backend layers with Base44.

---

## Architecture

```
Current:                         Target:
                               ┌─────────────────┐
Browser ─► Vercel (Next.js)   │  Vercel (Next.js)│ (static export)
            │                  │  ─ lib/base44.ts │
            ▼                  │  ─ lib/cafes.ts  │
       pg Pool                 │  ─ lib/auth.ts   │
            │                  └────────┬─────────┘
            ▼                           │ SDK
   Aurora RDS (DEAD)                    ▼
                               ┌─────────────────┐
                               │  Base44 Backend  │
                               │  ─ Cafe entity   │
                               │  ─ Measurement   │
                               │  ─ Backend fn    │
                               │    (geo filter)  │
                               │  ─ Auth          │
                               └─────────────────┘
```

---

## Day 1: Scaffold + Entities (July 22)

1. **Sign up / log in to Base44** at base44.com — enroll in the contest (name + email).

2. **Scaffold the backend project:**

```bash
npx base44 create
```

Select a "backend only" template. This creates the project structure.

3. **Define entities** in `base44/entities/`:

**Cafe.json**
```json
{
  "name": "Cafe",
  "type": "object",
  "title": "Cafe",
  "properties": {
    "name":          { "type": "string", "minLength": 1 },
    "neighbourhood": { "type": "string" },
    "latitude":      { "type": "number" },
    "longitude":     { "type": "number" },
    "vibe":          { "type": "string" },
    "city":          { "type": "string", "default": "nairobi" },
    "price_tier":    { "type": "string", "enum": ["budget","mid","premium"] },
    "milk_options":  { "type": "array", "items": { "type": "string" } },
    "power_outlets": { "type": "boolean", "default": false },
    "seating":       { "type": "string", "enum": ["indoor","outdoor","both"] },
    "wifi_network":  { "type": "string" },
    "photo_url":     { "type": "string" },
    "created_by_ip_hash": { "type": "string" }
  },
  "required": ["name", "latitude", "longitude"],
  "rls": {
    "create": true,
    "read": true,
    "update": { "created_by": "{{user.email}}" },
    "delete": { "created_by": "{{user.email}}" }
  }
}
```

**Measurement.json**
```json
{
  "name": "Measurement",
  "type": "object",
  "title": "Measurement",
  "properties": {
    "cafe_id":              { "type": "string" },
    "down_mbps":            { "type": "number" },
    "up_mbps":              { "type": "number" },
    "latency_ms":           { "type": "number" },
    "jitter_ms":            { "type": "number" },
    "loss_pct":             { "type": "number" },
    "measured_at":          { "type": "string", "format": "date-time" },
    "time_bucket":          { "type": "string", "enum": ["morning","afternoon","evening"] },
    "photo_url":            { "type": "string" },
    "test_method":          { "type": "string", "enum": ["latency","download","both"] },
    "target_server":        { "type": "string" },
    "device_type":          { "type": "string" },
    "contributor_ip_hash":  { "type": "string" },
    "is_outlier":           { "type": "boolean", "default": false },
    "contributor_user_id":  { "type": "string" }
  },
  "required": ["cafe_id", "down_mbps", "up_mbps", "latency_ms", "measured_at"],
  "rls": {
    "create": true,
    "read": true
  }
}
```

**Sponsorship.json / Bounty.json** — same as current schema, migrate if needed.

4. **Deploy entities:**

```bash
base44 entities push
```

5. **Generate TypeScript types:**

```bash
base44 types generate
```

---

## Day 2: Base44 SDK Client + Auth (July 23)

1. **Install Base44 SDK in the Next.js project:**

```bash
npm install @base44/sdk
```

2. **Create `lib/base44.ts`** — the new data access layer replacing `lib/db.ts`:

```typescript
import { createClient } from "@base44/sdk";

const base44 = createClient({
  appId: process.env.NEXT_PUBLIC_BASE44_APP_ID!,
});

export default base44;
```

3. **Replace `auth.ts`** — swap Auth.js + pg-adapter for Base44 auth:

- Remove `next-auth`, `@auth/pg-adapter`, `resend` from deps.
- Create `lib/base44-auth.ts` wrapping `base44.auth` methods.
- Use Base44's built-in auth UI or SDK methods for login/register.
- Maintain the same session shape (`user.id`, `user.email`) for compatibility.

4. **Remove `app/api/warm/route.ts`** — no Aurora to warm.

5. **Update `.env.local`** — replace `DATABASE_URL` / `AUTH_SECRET` / `AUTH_RESEND_KEY` with:

```
NEXT_PUBLIC_BASE44_APP_ID=...
```

---

## Day 3: Backend Function — Geospatial Cafe Query (July 24)

This is the hardest piece. Base44 has no PostGIS, so we write a Deno backend function that approximates `ST_DWithin` with a bounding box + Haversine filter.

1. **Create `functions/get-cafes-near.ts`:**

```typescript
import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { lat, lng, radiusM, city } = await req.json();

  // Approximate degree bounds (1° lat ≈ 111km)
  const latDelta = radiusM / 111_000;
  const lngDelta = radiusM / (111_000 * Math.cos(lat * Math.PI / 180));

  // Filter by bounding box in SDK (MongoDB $gte/$lte)
  const filter: any = {
    latitude: { $gte: lat - latDelta, $lte: lat + latDelta },
    longitude: { $gte: lng - lngDelta, $lte: lng + lngDelta },
  };
  if (city) filter.city = city;

  const cafes = await base44.asServiceRole.entities.Cafe.list('-created_date', 5000, 0);
  // Can't use MongoDB filter directly with filter() because geo ops aren't standard,
  // so we pull all and compute Haversine in the function
  const results = cafes
    .map((c: any) => ({
      ...c,
      distance: haversine(lat, lng, c.latitude, c.longitude),
    }))
    .filter((c: any) => c.distance <= radiusM)
    .sort((a: any, b: any) => a.distance - b.distance)
    .slice(0, 50);

  return Response.json({ cafes: results });
});

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

2. **Deploy the function:**

```bash
base44 functions deploy
```

3. **Alternative (if Base44's `filter()` supports MongoDB `$geoWithin`):** Check and use native geo operators — the above is the worst-case fallback.

**For `getCafeById()`** — no geospatial needed:
- `base44.entities.Cafe.get(id)` — one-liner.
- Distribution: `base44.entities.Measurement.filter({ cafe_id: id })` — compute median and time-bucket grouping in the backend function.
- Recent readings: `base44.entities.Measurement.filter({ cafe_id: id }, '-measured_at', 5)`.

---

## Day 4: Refactor Data Layer (July 25)

1. **Rewrite `lib/cafes.ts`:**
   - `getCafes()` → call the backend function `get-cafes-near` via `base44.functions.invoke('get-cafes-near', params)`.
   - `getCafeById()` → `base44.entities.Cafe.get(id)` + backend function for distribution/recent.
   - `getCafeBySlug()` → slugify + `filter({ slug })` or name match.
   - Keep the mock-data fallback for when Base44 is unreachable (same pattern as before).

2. **Rewrite `lib/measurements.ts`:**
   - `insertMeasurement()` → `base44.entities.Measurement.create(data)`.
   - `deriveTimeBucket()` — already JS, no change needed.
   - `refreshStatsView()` — replace MATERIALIZED VIEW with an in-memory aggregation in the cafe-detail endpoint, OR a scheduled backend function that pre-computes stats into a CafeStats entity.
   - `isOutlierReading()` — compute median from filtered measurements in-memory or in a backend function.

3. **Rewrite `lib/rate-limit.ts`:**
   - Replace SQL timestamp checks with `Measurement.filter({ contributor_ip_hash, cafe_id, measured_at: { $gte: someTime } })`.
   - Use `filter()` with `$gte` on `created_date` (built-in field).

4. **Rewrite API routes:**
   - `POST /api/cafes` → `base44.entities.Cafe.create(cafeData)` + `base44.entities.Measurement.create(measurementData)`.
   - `POST /api/measurements` → `base44.entities.Measurement.create(data)`.
   - `GET /api/cafes/near` → `base44.functions.invoke('get-cafes-near', { lat, lng, radius, city })`.
   - `GET /api/cafes/[id]` → `base44.entities.Cafe.get(id)` + backend function for stats.

**No transaction support** in Base44 for the atomic cafe+measurement creation. Use a two-phase approach: create cafe first, then measurement. If measurement fails, delete the cafe. Or write a backend function that does both server-side.

---

## Day 5-6: Frontend Integration + Polish (July 26-27)

1. **Update `next.config.js`** — set `output: 'export'` for SPA static export (required for Base44 hosting, or keep on Vercel with `output: 'export'`).

2. **Test all flows:**
   - Submit a speed test → creates Measurement
   - Create a cafe → creates Cafe + Measurement
   - Browse map → calls `get-cafes-near` backend function
   - Cafe detail → shows stats, distribution, recent readings
   - Auth login/register → Base44 auth

3. **Seed data:** Write a script using `base44 exec` or a backend function to bulk-import the 48 existing measurements and 12 cafes from `seeds/nairobi.sql` (convert SQL INSERTs to entity creates).

4. **Enroll in contest submissions page** — fill out the feedback form, check backend features used.

---

## Day 7: Submit (July 28)

1. **Final deploy:** `base44 deploy`
2. **Submit the build** — answer the questions, check the features used, fill feedback form.
3. **Post in contest comments** explaining what was built and the migration from Aurora RDS.

---

## Files to Delete

| File | Reason |
|------|--------|
| `lib/db.ts` | pg Pool → Base44 SDK client |
| `scripts/provision-aurora.sh` | No more RDS |
| `scripts/migrate.ts` | No more SQL migrations |
| `scripts/seed.ts` | Replaced by Base44 script |
| `scripts/db-check.ts` | Replaced by `base44 dev` |
| `migrations/*` | No more SQL |
| `seeds/*` | Replaced by Base44 entity creates |
| `app/api/warm/route.ts` | No Aurora to warm |

## Files to Create

| File | Purpose |
|------|---------|
| `lib/base44.ts` | Base44 SDK client singleton |
| `lib/base44-auth.ts` | Auth wrapper (replaces Auth.js) |
| `functions/get-cafes-near.ts` | Geo-filtering backend function |
| `functions/get-cafe-stats.ts` | Cafe stats aggregation |
| `scripts/seed-base44.ts` | Import seed data to Base44 |
| `base44/entities/Cafe.json` | Cafe entity schema |
| `base44/entities/Measurement.json` | Measurement entity schema |
| `base44/entities/Sponsorship.json` | (if needed) |
| `base44/entities/Bounty.json` | (if needed) |

## Files to Modify

| File | Change |
|------|--------|
| `lib/cafes.ts` | Replace SQL with Base44 SDK + function calls |
| `lib/measurements.ts` | Replace SQL INSERT with entity create |
| `lib/rate-limit.ts` | Replace SQL queries with entity filter() |
| `auth.ts` | Replace Auth.js config with Base44 auth |
| `app/api/cafes/route.ts` | Replace withTransaction with sequential creates |
| `app/api/cafes/near/route.ts` | Replace getCafes() call with function invoke |
| `app/api/cafes/[id]/route.ts` | Replace getCafeById() with entity get + fn call |
| `app/api/measurements/route.ts` | Replace insertMeasurement() with entity create |
| `package.json` | Remove pg, @auth/pg-adapter, next-auth, resend |
| `.env.local` | Replace DB vars with Base44 app ID |
| `next.config.js` | Set `output: 'export'` |

---

## Verification

1. `pnpm build` — must succeed (static export)
2. `base44 deploy` — pushes entities, functions, config
3. Open the live site — confirm map loads cafes from Base44
4. Submit a speed test — confirm Measurement appears in Base44 dashboard
5. Create a cafe — confirm Cafe + Measurement created
6. Navigate to cafe detail — confirm stats load
7. `base44 logs` — check for backend function errors

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Base44 geo-filtering too slow for large datasets | Keep mock-data fallback; paginate at 50 results |
| No Base44 transaction support | Two-phase create + cleanup on failure; or backend function handles both |
| Base44 beta instability | Keep existing mock-data fallback in `lib/cafes.ts` |
| Contest timeline too tight | Core geospatial + measurement features by Day 4; leave sponsorships/bounties for stretch goal |
| SPA export breaks something | `output: 'export'` disables SSR/API routes — but all API routes are replaced by Base44 calls, so this is fine |
