# Hackathon submission package

Everything the submission form asks for, in one place. Copy-paste-ready.

---

## Quick facts

- **Live app:** https://lattency.vercel.app/
- **Repo:** https://github.com/thisyearnofear/lattency
- **AWS Database used:** Amazon Aurora PostgreSQL Serverless v2 (engine 16.6, region eu-north-1)
- **Track recommendation:** Open Innovation (also fits Monetizable B2C as a longer-term play)

---

## Where to find your Vercel Team ID

Vercel dashboard → click your team/account name (top-left) → **Settings** → **General** → "Team ID" appears in the "Team Info" section. It's a `team_…` string. Copy and paste into the submission form.

If the project is on a personal account rather than a team, use **Account ID** from the same Settings page.

---

## AWS Console screenshot (submission requirement)

Three screenshots are already in the repo at `public/screenshots/`:

| File | Shows | When to use it |
|---|---|---|
| `RDS1.png` | Databases list with `lattency-dev` cluster + `lattency-dev-writer` instance, region indicator "Europe (Stockholm)", engine `Aurora PostgreSQL` | The primary submission upload — proves AWS Database usage end-to-end |
| `RDS2.png` | `lattency-dev` cluster detail, Connectivity & security tab | Backup if the form asks for cluster configuration |
| `RDS3.png` | Connection-step command + endpoint string | Optional — shows the actual `psql` connection invocation if the form asks for "how you connect" |

`RDS1.png` is the canonical one. URL bar visible, region indicator visible, two-row database table confirming the cluster + writer instance both in `eu-north-1`.

---

## Submission description (form text)

If the form has one long-form field, use this:

> **Lattency** is a crowdsourced metro map of café wifi speeds in Nairobi. Cafés are stations; the three lines are speed tiers — Express (≥50 Mbps), Local (10–49 Mbps), and Suspended (<10 Mbps). The whole experience is one scroll: a cinematic camera flies down each line in turn, then the map zooms out to a real Natural Earth world map to make the "one engine, every city" promise visual. Click any café to open a detail drawer with the speed distribution across morning / afternoon / evening; submit a measurement from the same drawer and the form previews which line your reading will land on **as you type**, then writes to Aurora and the next reader sees the new tier within seconds.
>
> The data spine runs on **Amazon Aurora PostgreSQL Serverless v2** with PostGIS — PostGIS rules out DynamoDB and Aurora DSQL because the "cafés near me" API uses `ST_DWithin` for radius queries. Serverless v2 scales to 0 ACUs when idle, costing near-zero between visits, and wakes in ~15-30s on the first read. A `cafe_speed_stats` materialized view pre-computes per-café medians and tier classification; `REFRESH MATERIALIZED VIEW CONCURRENTLY` runs after every measurement insert so reads stay close to live without locking the view.
>
> The frontend is **Next.js 16.3 on Vercel** with a pinned 800vh scroll-driven cinematic SVG map built on GSAP (MotionPath + DrawSVG + ScrollTrigger + quickTo camera tracking). A schematic ↔ geographic view toggle morphs stations from their abstract grid positions to their real lat/lng coordinates on a stylized Nairobi neighbourhood map. The home page server-component reads from Aurora and is pre-rendered statically with a 60-second revalidate, so the page is fast at the edge and reads are batched. When Aurora is mid-cold-start or unreachable, the read path degrades gracefully to a bundled snapshot — the demo never white-screens.
>
> The same engine would map any city. Nairobi was the first board. The next twelve thousand are next.

If the form has separate "what does it do" / "why" / "how" fields:

**What does it do:**
> Lattency turns crowdsourced café wifi measurements into a metro-map-style network for Nairobi. Cafés are stations, lines are speed tiers, and anyone can submit a reading — the form previews which line their measurement will land on as they type, then the materialized view refreshes and the next visitor sees the new tier.

**Why did you build it:**
> Finding a café with usable wifi in Nairobi is a guessing game that wastes hours every week. The metro-map metaphor turns scattered, anecdotal speed data into a recognizable transit network at a glance — and the schematic ↔ geographic view toggle plus the world-map finale show the same engine could ship to any city the same day.

**Which AWS Database did you use and why:**
> Amazon Aurora PostgreSQL Serverless v2 (engine 16.6, region eu-north-1). PostGIS is the deciding factor — `ST_DWithin` powers the "cafés near me" API endpoint, and that geospatial requirement ruled out Aurora DSQL and DynamoDB. Serverless v2 auto-pauses at 0 ACUs when idle (near-zero idle cost) and warms in ~15-30s, which suits a hackathon demo and would suit a real product launching city-by-city. A materialized view `cafe_speed_stats` pre-computes medians and tiers; `REFRESH MATERIALIZED VIEW CONCURRENTLY` keeps reads close to live without lock contention.

**How is it built (technical):**
> Next.js 16.3 (App Router, RSC) on Vercel; pg.Pool singleton cached on globalThis for serverless-safe connection reuse; Aurora PG Serverless v2 in eu-north-1; TLS-required connection; GSAP 3.15 with MotionPathPlugin + DrawSVGPlugin + ScrollTrigger for the cinematic; CSS-only micro-interactions for the rest. The home page is pre-rendered static with a 60-second revalidate so reads are batched and the edge serves the cached page to most visitors. Read path includes a bundled-snapshot fallback (`lib/mock-cafes.ts`) so the page never white-screens during Aurora cold-starts or planned outages.

---

## Bonus content (LinkedIn / blog / etc. for the optional bonus points)

A short post you can adapt for LinkedIn or dev.to to claim the "publish a piece of content" bonus:

> Built **Lattency** for the Vercel × AWS Databases hackathon — a crowdsourced metro map of café wifi speeds in Nairobi. Cafés become stations, the colored lines are speed tiers, not geography.
>
> The data spine runs on Aurora PostgreSQL Serverless v2 with PostGIS. The "cafés near me" API uses ST_DWithin for spatial queries. A materialized view tiers each café by median speed; REFRESH CONCURRENTLY keeps reads live without locking the view. Aurora scales to 0 ACUs when idle, so a hackathon demo costs near-nothing to run.
>
> The differentiator is the experience. Pinned 800vh scroll, six phases, GSAP driving a "camera" along Bezier tier paths. The finale zooms out to a real Natural Earth world map and lights up cities from Lagos to Tokyo. Click any café to open a detail with the speed distribution across morning/afternoon/evening and a form that previews which tier your reading will land on **as you type** — submit it, watch the tier flip in real time.
>
> Repo: https://github.com/thisyearnofear/lattency
> Live: https://lattency.vercel.app/
>
> #H0Hackathon

Add `#H0Hackathon` per the official rules so it counts.

---

## Pre-flight checklist before you hit submit

- [x] Lattency loads at https://lattency.vercel.app/ without errors
- [x] `/api/cafes/near` returns 12 cafés, tier mix 4 express / 6 local / 2 suspended
- [x] `POST /api/measurements` round-trips against prod (verified — Brew Bistro flipped suspended → express on five POSTs, then reseeded back to suspended)
- [x] AWS Console screenshots saved at `public/screenshots/RDS{1,2,3}.png`
- [x] OG image renders at https://lattency.vercel.app/opengraph-image (1200×630 PNG, masthead aesthetic)
- [ ] Architecture diagram either rendered as PNG (mermaid.live → paste the block from README) or screenshot of the README rendered on GitHub
- [ ] Vercel Team ID copied from Vercel Settings → General
- [ ] Demo video recorded against `docs/demo-video.md` (in-browser contribute flow, not curl), edited under 3 minutes, uploaded to YouTube unlisted
- [ ] Aurora warmed before recording (visit https://lattency.vercel.app once 30s before pressing record)
- [ ] Brew Bistro Kilimani still shows **suspended** in the directory before recording (if not, `pnpm seed` locally and wait 60s)
- [ ] Bonus content posted (LinkedIn / dev.to / blog) with #H0Hackathon, if going for the bonus

---

## Architecture journey + production roadmap

The demo runs on Aurora PG Serverless v2 reached over TLS from Vercel functions, with port 5432 open to `0.0.0.0/0` to allow Vercel's dynamic egress IPs. This is the hackathon-pragmatic choice; below is the honest path to a production-grade network and what was attempted on the way.

**Attempted: RDS Proxy in front of Aurora.** Built the full stack — dedicated proxy SG, Secrets Manager secret for the master credentials, IAM role with secret-read policy, RDS Proxy targeting the cluster. Discovered RDS Proxy is **VPC-internal by design** — the proxy endpoint resolves to private VPC IPs (172.31.x.x) and is unreachable from outside the VPC without VPC peering, PrivateLink, or a load balancer bridging public traffic in. RDS Proxy is built for in-VPC consumers (Lambda in the same VPC, EC2, ECS) — not for serverless platforms like Vercel that don't share the VPC. Resources have been torn down.

**Production path forward (in order of investment):**
1. **Vercel × AWS Marketplace Aurora integration.** The flagship integration this hackathon promotes — provisions Aurora through the Vercel dashboard with PrivateLink-backed networking. Vercel functions reach Aurora over private link; Aurora is never internet-listening. This is the right answer for a production launch.
2. **Self-managed AWS PrivateLink.** Same architecture, more work — create a VPC endpoint service, expose RDS Proxy through it, set up the consumer endpoint on Vercel's side via partner setup.
3. **NLB + RDS Proxy.** A public-facing Network Load Balancer fronts the proxy. Bridges the VPC-internal proxy to public traffic. Adds ~$16/mo NLB cost and TLS-termination considerations, but doable without re-provisioning.

For this hackathon's scope, Path 1 would have meant re-provisioning Aurora through the Vercel dashboard hours before submission — too risky against a deadline. The open-SG path was the pragmatic choice, with the explicit plan to graduate to Marketplace integration when this becomes a real product.

## Post-submission: revoke the open SG

For the hackathon demo, port 5432 is open to `0.0.0.0/0` so Vercel can reach Aurora. After submission:

```bash
aws ec2 revoke-security-group-ingress \
  --region eu-north-1 \
  --group-id sg-037dded504e25e922 \
  --security-group-rule-ids sgr-01cae09a4cf6ce3c1
```

This removes the open rule. Lattency will stop working from Vercel — which is fine, since the submission is what matters. To keep the demo alive long-term, follow Path 1 above (Vercel × AWS Marketplace Aurora integration).

## Post-submission: extra IAM permissions to revoke

During the RDS Proxy attempt we added `SecretsManagerReadWrite` and `IAMFullAccess` to the `lattency-provisioning` IAM group. Neither is needed any longer:

- AWS Console → IAM → User groups → `lattency-provisioning` → Permissions → detach both policies.

`AmazonRDSFullAccess` and `AmazonEC2FullAccess` can stay (they're what `scripts/provision-aurora.sh` relies on if you ever re-run it) or be detached if you're cleaning up entirely.

## Post-submission product work (v6–v9)

After the hackathon deadline, five phases of work transformed lattency from "type three numbers from another tool" into a self-contained measurement platform with trust, integrity, and open contribution.

### Phase 1: In-browser speed test (v6)

**Problem:** Contributors had to run a separate speed test tool (Fast.com, Speedtest.net) and manually type the results — friction that suppressed contributions and invited transcription errors.

**Architecture (Vercel-native hybrid):**
- **Download:** 10 MB random blob served from `public/speedtest/download.bin` via Vercel's edge CDN. Generated by `scripts/gen-speedtest-blobs.ts` (chained into `dev` + `build`, gitignored). Client uses streaming `fetch` with `cache: 'no-store'` and measures wall-clock time.
- **Upload:** `POST /api/speedtest/upload` endpoint that consumes and discards the body. Client POSTs 3×1 MB payloads sequentially and measures wall-clock time. `force-dynamic` so each POST runs as a function.
- **Latency/Jitter/Loss:** 10 HEAD requests to the download blob. RTT distribution gives latency (median), jitter (max − min), and loss (failed/total × 100).

**Schema (migration 0004):** Added `jitter_ms`, `loss_pct`, `test_method`, `target_server`, `device_type`, `download_bytes`, `download_duration_ms` to `measurements`. Recreated `cafe_speed_stats` MV with `median_jitter_ms` and `median_loss_pct` (COALESCE to 0 when no auto-test data).

**Trust model:** `test_method` is derived server-side from the presence of `downloadBytes` + `downloadDurationMs` — the client's claim is advisory, not authoritative. `device_type` is derived from the User-Agent. A manual entry can't fake auto-test provenance.

**UI:** One-click "Run speed test" button in `MeasurementForm` with live progress gauge (ping → download → upload). Fields auto-fill on completion. Manual entry fully preserved as fallback — editing an auto-filled field invalidates the auto-test tag.

### Phase 2: Signal quality indicator (v6)

**Problem:** Tiers based solely on bandwidth miss a critical axis — a café can be "express" on throughput and still hostile to video calls due to high jitter or packet loss.

**Solution:** `lib/stability.ts` derives a stability rating from jitter + loss:
- **Stable:** jitter < 10 ms AND loss < 1% → fine for calls, gaming, SSH
- **Variable:** jitter 10–30 ms OR loss 1–3% → okay for browsing, risky for calls
- **Unstable:** jitter > 30 ms OR loss > 3% → buffering, dropped calls

`components/signal-quality.tsx` renders a shared three-bar indicator (●●● / ●●○ / ●○○ / ○○○) with the stability label and jitter/loss numbers. Surfaced on station cards (compact), detail modal (full), and café page (full). The "no data" state (jitter=0 AND loss=0) is explicitly handled — it means no auto-test readings exist, not "perfect stability."

### Phase 3: Trust + integrity (v7)

**Rate-limiting (migration 0005):** One measurement per IP+café per 10-minute window. The client IP is SHA-256 hashed (`lib/rate-limit.ts`) — never stored raw, never returned by any endpoint. The hash exists solely for the rate-limit comparison. Returns `429` with a user-friendly message; the form shows a specific "try again in a few minutes" note.

**Outlier detection:** Readings >5× or <0.2× the café's existing median (when ≥3 measurements exist) are flagged `is_outlier = true` but still accepted. Never rejects — a genuine speed change (café upgraded their fibre) would be a false positive. The flag is stored for future analysis; the MV does not yet exclude outliers (that's a product decision needing real traffic data to calibrate).

**Edge transparency:** `GET /api/speedtest/whereami` returns the Vercel edge region from the `x-vercel-id` header. The speed test result state displays "Measured against: iad1" so users know which edge they tested against — important context for interpreting the numbers.

### Phase 4: Growth + map visibility (v8)

**Per-café OG images:** Each `/cafes/[slug]` page now generates its own 1200×630 OG image at `/cafes/[slug]/opengraph-image` — tier badge, café name, median speed numbers, signal quality. Shareable on Twitter / LinkedIn / Slack with a thumbnail that reads at a glance.

**Stability rings on map markers:** The schematic SVG, Leaflet geographic, and cinematic transit map all gained a stability ring around each station (green / amber / red), letting the bandwidth + stability dimensions live on the same glyph. Leaflet popovers also surface the signal-quality bars in the tooltip.

### Phase 5: Open contribution platform (v9)

**The shift:** From "12 seeded Nairobi cafés + 12 reputation-tier SF cafés" to "anyone can map a café anywhere." Migration 0006 adds `city`, coffee metadata (price tier, milk options, power outlets, seating, wifi network), `photo_url`, and `created_by_ip_hash` to the `cafes` table. Existing rows backfilled with `city='nairobi'`.

**`POST /api/cafes`** creates a café + its first measurement inside a single Postgres transaction — `withTransaction(exec => ...)` in `lib/db.ts` returns an `Executor` bound to one connection so both inserts share a `BEGIN/COMMIT`. If the measurement fails, the café row rolls back too. `REFRESH MATERIALIZED VIEW CONCURRENTLY` runs after commit (it can't live inside a transaction).

**The trust mechanism** is the mandatory speed test, not the photo. Anyone can claim a café exists, but a real round-trip to a Vercel edge can't be faked from a fake IP. The photo gives the new café page a face; the speed test makes the listing trustworthy. (This framing was clarified in the form copy during the v9 polish pass.)

**`CafeContributionForm`** is a 5-step modal: location → café details → coffee metadata → speed test → photo → submit. The `city` field pre-fills from the page context (Nairobi from `/`, SF from `/sf`) and lowercases server-side so `"Nairobi"` and `"nairobi"` collapse to one bucket.

**Demo affordance** — a "Try with sample data →" button at step 1 fills name, neighbourhood, city, vibe, all metadata, jittered coordinates around a real neighbourhood centre, and a generated SVG photo card in the site's poster aesthetic. The user still runs a real speed test from their browser, then submits. Lets a judge see the end-to-end submission flow in two clicks instead of having to sit in a real café.

**Coffee identity polish** (shipped alongside the contribution platform):
- **Vibe chips** — a compact mono chip row (`outlets++`, `oat-milk`, `pour-over`, `fibre`, `garden`, `quiet`, …) under every station card and detail page. DB-backed Nairobi cafés enrich via a name lookup so chips appear whether Aurora is hot or cold.
- **"Last brewed here" ticker** — the last 5 measurements per café, newest-first, with relative timestamps ("4m ago", "3h ago"). DB query + deterministic mock synth. `useSyncExternalStore` ticks every 30s for a live feel without cascading-render warnings.
- **Brand mark** — a coffee-cup + wifi-arcs glyph used in top-nav, the masthead Edition stamp, and the favicon. Single React component (`brand-mark.tsx`) whose paths match `app/icon.svg`.

**Payload trim:** The `cafe_speed_stats` list query now uses a thinned `LIST_COLUMNS` that drops `cs.photo_url` (which can hold a ~50 KB base64 data URL). Detail queries still SELECT it. A 24-café homepage no longer ships ~1.2 MB of base64 for thumbnails the card view never displays — the contributor photo only loads on the per-café page where it actually shines.

### Phase 6: Business model preview (v9.2)

**The two-sided marketplace.** A transit map of café wifi is genuinely useful to consumers but the revenue question is "who pays?" Three answers, all live in the UI today:

1. **ISPs sponsor speed badges in the neighbourhoods they serve.** Every visitor to the city's map sees that the ISP's network is what makes those cafés express-tier. Concrete demo: *Connect Coffee Roasters* (Westlands, express) carries a *Powered by Safaricom Fibre* badge; *Mazarine Coffee* (FiDi, express) carries a *Powered by Sonic.net* badge. Both link to `/partners` for the model.
2. **Café owners stake bounties for the Nth verified speed test at their café** — the contributor gets the coffee, the café gets the visit, the wifi gets the proof. Free verified badge on the tier they earn through measurements.
3. **Contributors earn coffee by running tests.** Every verified reading is a small data point an ISP or a café owner is willing to pay for. Today the payout is a coffee on the house at the café; the M-Pesa / Stripe payout rail ships with the first ISP partner.

**Coffee Bounties board.** Visible on `/`, `/sf`, and `/partners`. Six representative bounties spanning ISP-funded ("3 oat-milk cafés in Kilimani" by Safaricom), café-funded ("be the 10th verified speed test at Savanna Coffee Lounge"), and community-funded ("first verified café in Lavington" by `@workmunyao`). Each card carries the sponsor type, the goal, the bounty value in coffees (☕), and a progress bar against the target.

**Why this isn't vapourware.** The trust layer is already shipped: speed test rounds-trip through a Vercel edge region the server records and returns; outlier readings are flagged in Aurora the moment they land; rate-limiting is scoped per IP per café per 10 minutes. The first sponsored bounty payout would gate on a clean outlier flag plus a second corroborating reading — both mechanics already exist in `lib/rate-limit.ts` and `lib/measurements.ts`.

**`/partners` page** is the pitch: three audience blocks (ISP / café owner / contributor), each with its own value prop, pricing teaser, and contact email, plus an in-page anchor down to the live bounty board. Built in the same East African transit poster aesthetic as the rest of the site so the monetization narrative reads as continuous with the product.

**Files added:** `app/partners/page.tsx`, `components/bounties-board.tsx`, `components/sponsor-badge.tsx`, `lib/bounties.ts`, `lib/sponsors.ts`. Single source of truth for the demo data; lookups are keyed by café name so they work against both Aurora-backed rows and the mock fallback without touching the schema.
