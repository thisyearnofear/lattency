# Lattency

> A metro map of the best places to get coffee and get online.
> Starting with Shoreditch, London.

Built for the [Nimiq Pay Mini Apps Competition](https://miniappscompetition.com).

---

## The idea

Lattency is a crowdsourced metro map of **workable coffee spots** — cafés, coworking spaces, hotel lobbies, and anywhere else you can sit down with a coffee and a laptop. Venues are stations. The three lines are speed tiers: **Express** (≥50 Mbps), **Local** (10–49 Mbps), and **Suspended** (<10 Mbps).

We’re starting in **Shoreditch, London**, because that’s where the builder is. The engine works everywhere, but London is the first board.

---

## The stack

| Layer        | Choice                                                              | Why                                                                      |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Backend      | **Base44** (entities, auth, Deno functions)                         | Free backend with built-in auth, DB, and hosting — no infra to manage    |
| Frontend     | **Next.js 16.3** on **Vercel** (static export, App Router)          | Cinematic scroll-driven SVG map (GSAP) over a static shell               |
| Network      | Base44 SDK via `@base44/sdk`                                        | Serverless-safe — the SDK client is shared across invocations            |
| Payments     | **Nimiq Pay** via `@nimiq/mini-app-sdk`                             | Contributors earn NIM for verified speed tests; sponsors fund bounties    |

---

## What we’re building for the Nimiq Mini Apps Competition

A finished Mini App inside Nimiq Pay where anyone in Shoreditch can:

1. Open the map of nearby coffee spots.
2. Tap a venue to see live wifi speed + stability.
3. Run an in-browser speed test.
4. Earn NIM when their verified reading completes a sponsor-funded bounty.

The speed test is the trust mechanism. The NIM reward is the growth mechanism. The map is the product.

---

## Vision: workspace-quality ground truth

We believe the best data about a workspace comes from someone who is physically there. Lattency turns that private experience into a public good:

- **Verified speed tests** (download, upload, ping, jitter, loss) replace hearsay.
- **Objective workspace metadata** — power outlets, seating, noise level, table space — replace subjective reviews.
- **NIM bounties** align incentives between contributors, venues, and sponsors.

We started with cafés. The engine supports cafés, coworking spaces, hotel lobbies, libraries, and hybrid venues. We call them all **stations**.

### The agentic opportunity

AI agents cannot walk into a café and run a speed test. They need a trusted, verified, real-time source of physical-world infrastructure data to make decisions for their human users.

Lattency is a **physical-world oracle** for the agentic era. We don't build the agent — we build the ground-truth layer that agents consume.

---

## Product principles

1. **Objective, not subjective** — no "coffee quality" ratings. Only verifiable facts.
2. **Hyper-local first** — own one neighbourhood, then expand.
3. **Crypto-native incentives** — bounties are funded and paid in NIM/USDT.
4. **Contributor-first UX** — run a test, earn NIM, repeat.

---

## Project layout

```
app/
├── page.tsx                  # Shoreditch home: hero + MapShell + StationDirectory
├── sf/                       # Legacy San Francisco demo route
├── tour/                     # Cinematic scroll experience
├── cafes/[slug]/             # Per-venue standalone page
├── partners/                 # Sponsorship / business model pitch
├── me/                       # Logged-in contributor dashboard
├── api/cafes/                # POST /api/cafes (create venue + first measurement)
├── api/cafes/near            # GET nearby venues (Haversine filter)
├── api/cafes/[id]            # GET venue detail + stats
└── api/measurements          # POST /api/measurements

base44/                       # Base44 backend config
├── entities/
│   ├── Cafe.json             # Venue entity schema
│   ├── Measurement.json      # Speed measurement schema
│   ├── Sponsorship.json      # Sponsor schema
│   └── Bounty.json           # Bounty schema
└── functions/
    ├── get-cafes-near.ts     # Haversine geo-filter
    └── get-cafe-stats.ts     # Median + distribution computation

components/
├── top-nav.tsx               # Sticky nav
├── map-shell.tsx             # SVG schematic ↔ Leaflet geographic map
├── station-directory.tsx     # List + filter + geolocation
├── cafe-detail.tsx           # Venue detail drawer
├── cafe-page.tsx             # Per-venue page
├── cafe-contribution-form.tsx # Add a new venue flow
├── measurement-form.tsx      # In-browser speed test
├── bounties-board.tsx        # Sponsor-funded bounties
└── cafe-metadata-display.tsx # Workspace metadata chips/rows

lib/
├── base44.ts                 # Base44 SDK client
├── cafes.ts                  # Read path + mock fallback
├── cities.ts                 # City registry (now includes London/Shoreditch)
├── cafe-metadata.ts          # Workspace metadata vocabulary
├── measurements.ts           # Shared insert path
├── rate-limit.ts             # Rate-limiting + outlier logic
├── speedtest.ts              # In-browser speed test
├── mock-cafes.ts             # Shoreditch seed data + legacy fallback
└── types.ts                  # Shared types
```

---

## Key data model

### Venue (`Cafe` entity)

| Field             | Type      | Notes                                  |
| ----------------- | --------- | -------------------------------------- |
| `name`            | string    | Required                               |
| `neighbourhood`   | string    | e.g. "Shoreditch"                      |
| `latitude`        | number    | Required                               |
| `longitude`       | number    | Required                               |
| `venue_type`      | string    | `cafe`, `coworking`, `hotel-lobby`, `library`, `hybrid` |
| `vibe`            | string    | Short editorial descriptor             |
| `city`            | string    | Default `"london"`                     |
| `price_tier`      | string    | `budget`, `mid`, `premium`             |
| `milk_options`    | array     | e.g. `["oat", "soy"]`                  |
| `power_outlets`   | boolean   | Are outlets available?                 |
| `seating`         | string    | `bar`, `tables`, `lounge`, `mixed`     |
| `noise_level`     | string    | `quiet`, `moderate`, `loud`            |
| `table_space`     | string    | `small`, `standard`, `large`           |
| `wifi_network`    | string    | SSID or password hint                  |
| `photo_url`       | string    | Base64 data URL                        |

### Measurement

| Field                  | Type      | Notes                                  |
| ---------------------- | --------- | -------------------------------------- |
| `cafe_id`              | string    | Required — Venue entity ID             |
| `down_mbps`            | number    | Required                               |
| `up_mbps`              | number    | Required                               |
| `latency_ms`           | number    | Required                               |
| `jitter_ms`            | number    |                                        |
| `loss_pct`             | number    |                                        |
| `measured_at`          | datetime  |                                        |
| `time_bucket`          | string    | `morning`, `afternoon`, `evening`      |
| `photo_url`            | string    |                                        |
| `test_method`          | string    | `manual`, `browser-auto`               |
| `target_server`        | string    | Edge region id                         |
| `device_type`          | string    | Derived from User-Agent                |
| `contributor_ip_hash`  | string    | Hashed for rate-limiting only          |
| `is_outlier`           | boolean   | Flagged by stats function              |
| `contributor_user_id`  | string    | Base44 User ID                         |

---

## Nimiq integration

Contributors earn NIM for verified speed tests that complete sponsor-funded bounties. The flow:

1. Sponsor funds a bounty in NIM (e.g., "3 verified tests at oat-milk cafés in Shoreditch").
2. Contributor opens the Mini App, finds a venue matching the bounty.
3. Contributor runs the in-browser speed test.
4. On a verified, non-outlier reading, the bounty pays NIM directly to the contributor’s Nimiq Pay wallet.

NIM is the default reward token. USDT on supported EVM chains can be added later.

---

## Quick start

```bash
pnpm install
npx base44 create           # scaffold or link the Base44 backend
npx base44 entities push    # deploy entity schemas
npx base44 functions deploy # deploy geo-filter + stats functions
pnpm dev                    # random high port (see AGENTS.md)
```

---

## Development

**Type-check the whole project:**

```bash
pnpm exec tsc --noEmit
```

**Run the smoke suite:**

```bash
pnpm test
```

---

## Deploy

### Frontend

```bash
pnpm build
vercel --prod
```

### Backend

```bash
npx base44 deploy
```

---

## License

MIT
