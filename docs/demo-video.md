# Demo video script

A 3-minute storyboard. Read it once, then record. Each block lists what's on screen, what you say, and the camera/mouse moves that have to happen.

The video must:
- Stay under 3 minutes (hard requirement)
- Show the problem, the working app, and the AWS database in use
- End with a clear "we used Aurora PostgreSQL because…" beat for the judges

Recommended tools:
- **OBS Studio** for screen capture (free, can do scene transitions for the chyron + the live tier flip)
- A second monitor or window for the script
- Browser at **1440×900**, dev tools closed, address bar showing the production Vercel URL

**Pre-flight (5 minutes before you press record):**
- Visit https://lattency.vercel.app once to wake Aurora Serverless v2 from auto-pause (first cold connection is 15-30s; you don't want a hang on tape)
- Confirm the directory shows Brew Bistro Kilimani as **suspended** — if it shows express, someone already POSTed (run `pnpm seed` locally to reset, then wait 60s for the home page revalidate)
- Close any browser extension overlays (wallet popups, password-manager prompts)
- Hide the bookmarks bar so the masthead has more vertical room

---

## 0:00 — 0:15 · The hook

**On screen:** Black hold for 1s → fade up on the masthead (LATTENCY).
Cursor parked top-left, page at scroll 0.

**Say:**
> "In Nairobi, finding a café with workable wifi is a guessing game. Lattency turns it into a metro map. Cafés are stations. The three lines are speed tiers."

Stay still. The masthead does the work. The cream + Big Shoulders + steam wisps + tagline ("a metro map of the city's wifi · brewed in nairobi") need 4 seconds of breathing room before you move.

---

## 0:15 — 0:55 · Ride the lines (the cinematic does the talking)

**On screen:** Scroll slowly through the cinematic — opening → express → local → suspended. The scroll-driven camera, line drawing, station roundels popping, the chyron updating per phase, the route card calling out active stops.

**Say:** (pacing matches the scroll)
> "Scroll, and the camera takes you down each line. Express stations — fifty megabits or more. About Thyme, Connect Coffee, Savanna, Karen Blixen — four stops, end to end."

(scroll to local)
> "Local line — the everyday backbone. Six stops, mostly between twenty and forty megabits."

(scroll to suspended)
> "And the suspended line. Brew Bistro Kilimani, Dormans Standard Street — under ten megabits. Service intermittent."

This is your strongest 40 seconds. Don't rush. Let the route card show the active stop's vibe — "fibre + filter", "loud at lunch", "the speed dealers". Those are the editorial details that make judges remember the submission.

---

## 0:55 — 1:00 · The finale, the global ambition

**On screen:** Continue scrolling. The map zooms out to a real Natural Earth world map. Nairobi pulses green over East Africa. Arcs draw out to Lagos, Cape Town, Accra, Kampala, Kigali, then Berlin, Tokyo, NYC, São Paulo, Mumbai, Singapore — each city sitting on its real geography.

**Say:**
> "The schematic isn't Nairobi-specific. The same engine could map any city's wifi the same way. Lagos. Cape Town. Yours."

Let the constellation finish lighting up before you cut. This is your "world map" moment — short but memorable.

---

## 1:00 — 1:45 · Contribute a measurement, watch the tier flip live

**No terminal.** The contribute flow is now fully in-browser. Don't show curl — it's slower and less impressive.

**On screen:** Scroll past the cinematic into the **"Find your line"** station directory. Click **Brew Bistro Kilimani** (the suspended station — currently red, dashed).

**Say:**
> "Anyone with a connection can contribute a measurement. Brew Bistro Kilimani is on the suspended line — under ten megabits."

**On screen:** Detail panel opens. Pause on the time-of-day chart (morning / afternoon / evening bars, all under 10 Mbps with the dashed Express threshold reference line above).

> "Here's the speed distribution across the day. The dashed line at fifty megabits is the express threshold."

**On screen:** Click into the **"Contribute a reading"** form. Type `100` in Down, `25` in Up, `10` in Ping — slowly enough that the camera catches the live tier-preview badge flipping from nothing to **"→ EXPRESS line"** in green.

> "As I type, the form tells me which line my reading lands on. A hundred megabits would put Brew Bistro on the Express line."

**On screen:** Click **"Log this reading"**. The success state appears ("Reading logged · your measurement is now part of Brew Bistro's line").

> "That POST goes to Aurora. The materialized view refreshes concurrently. The next read sees the new tier."

**On screen:** Close the detail. The directory card for Brew Bistro now reads **EXPRESS** in green (the modal refetches on the way out; if not, scroll, then scroll back, the card is now express).

> "The same data, one second later, on a different line."

---

## 1:45 — 2:30 · Schematic ↔ Geographic (the engine reveal)

**On screen:** Scroll back up into the cinematic. Click the **Geographic** toggle in the bottom-left of the map.

**Say:**
> "The same twelve cafés, plotted on their real lat-long coordinates. This is what the engine actually knows about them — geography, served by PostGIS."

**On screen:** Let the morph play out. Stations slide from their schematic grid positions into their real Westlands / Kilimani / CBD / Karen clusters. The four neighbourhood polygons fade in beneath.

> "Cafés near me? That's a `ST_DWithin` call. Two hundred metres of Postgres geography against an Aurora cluster that scales to zero ACUs when idle."

Toggle back to Schematic so the next section's transition is clean.

---

## 2:30 — 3:00 · The stack (this is the AWS judge slot)

**On screen:** Cut to the AWS Console showing the Aurora cluster (this is the submission requirement — `public/screenshots/RDS1.png` is the reference). Then cut briefly to the Vercel project dashboard.

**Say:**
> "Amazon Aurora PostgreSQL Serverless v2 in eu-north-1. We picked Aurora over Aurora DSQL and DynamoDB because we needed PostGIS — `ST_DWithin` for spatial queries. A materialized view tiers each café by median measurement; CONCURRENTLY refreshes mean reads stay live. Aurora scales to zero ACUs when nobody's watching, so a hackathon demo costs almost nothing to run."

> "Frontend is Next.js sixteen on Vercel. The home page pre-renders static with a sixty-second revalidate — most visitors are served from Vercel's edge cache, and Aurora gets hit at most once per minute."

> "Twelve stations today. The next twelve thousand are next."

End on the LATTENCY masthead held for a beat. Cut.

---

## Production tips

- **Practice the scroll pacing.** The cinematic is 800vh — at a normal scroll speed you'll cover it in ~25 seconds. Practice landing each chyron beat (express / local / suspended / finale) on the corresponding voice-over line.
- **Practice the form interaction once.** The tier-preview badge needs to be visible long enough for the camera to catch it — type the three numbers deliberately, not at full speed.
- **Mute mouse-click sounds.** OBS → Settings → Audio → suppress.
- **Hide bookmarks bar and dev tools.** Maximise the address bar's visibility so the `lattency.vercel.app` URL is on screen during key moments.
- **Don't show .env files, your AWS credentials, your IAM console, or anything with secrets.** Sanitise everything visible.
- **Record at 1080p, upload to YouTube as unlisted.** Submission asks for a YouTube link — unlisted is fine.
- **Reseed after recording** if you POSTed during the demo: `pnpm seed` locally restores Brew Bistro to its suspended baseline.

## What you DON'T need to show

- The seed file. The seed is a developer convenience; judges care about the live product.
- The pre-commit hook. Engineering hygiene matters, but it's not a Best Design or Most Original argument.
- Code beyond the architecture frame in the closing 30 seconds. Code-on-screen for >5s loses general-audience judges.
- Terminal windows. The old curl-loop POST has been replaced by the in-browser contribute flow — no terminal needs to appear in this video.

## If you have extra time (sub-3-min variants)

**90-second cut** for social media or LinkedIn:
- 0:00–0:10 hook (masthead)
- 0:10–0:35 scroll the cinematic (skim faster)
- 0:35–0:55 contribute + tier flip
- 0:55–1:10 finale (world map)
- 1:10–1:30 stack ("Aurora PG Serverless v2 + PostGIS + Vercel · one engine, every city")

**Tightening to 2:30** if you want margin under the 3-min cap:
- Cut the schematic/geographic toggle reveal (1:45–2:30) and roll its message into the stack beat
- Or trim the contribute section by skipping the time-of-day chart pause

---

## Post-submission re-record variant (v9 + v9.1 + v9.2)

The original storyboard pre-dates the open-contribution platform, the demo prefill, and the business-model preview. If you re-record after submission, this variant swaps the curl-era contribute beat for a 90-second sequence that lands all three:

**Pre-flight delta:**
- Wake Aurora once via https://lattency.vercel.app/ (same as before)
- Hover the **+ Map a café** button in the map toolbar so it's primed when you cut to it
- Have `https://lattency.vercel.app/partners` ready in a second tab

### 0:55 — 1:55 · The open contribution flow (replaces the old contribute beat)

**On screen:** Scroll past the cinematic to the map. Hover the **+ Map a café** button in the map toolbar so the cursor is visible. Click.

**Say:**
> "Lattency isn't just a map of twelve cafés. Anyone can add a new one."

**On screen:** The 5-step contribution modal opens on the location step. Skip "Share my location" and click **"Try with sample data →"**.

> "I'll skip the geolocation for the recording — same flow, deterministic data — and jump straight to the bit that actually matters: the speed test."

**On screen:** The modal jumps to step 4 (Speed test). Click **"Run speed test"**. The live ping → download → upload gauge plays for ~12 seconds. Don't rush this — the live numbers are the most legible proof in the entire video that this is a real working product.

> "This isn't a form field. The browser is actually running a download against a Vercel edge, an upload against an API route, and HEAD requests for jitter and loss. The server records which edge served the test. You can't fake the round-trip from a fake IP — that's why the speed test is the trust mechanism, not the photo."

**On screen:** Speed test completes. Click **Continue**. The photo step shows a pre-generated SVG card. Click **Submit**.

> "Sample data fills the name, the metadata, the neighbourhood, and a generated photo card. In production the contributor adds their own. The submission runs as a single Postgres transaction — café row plus the first measurement — and the materialized view refreshes the moment it commits."

**On screen:** Brief loading state, then the modal closes and the router pushes to `/cafes/<slug>`. The new café's detail page renders: tier badge, vibe chips, "Last brewed here" ticker showing your reading at the top, the distribution chart populated.

> "And we're now on the new café's page. The reading I just ran is at the top of the ticker. The tier was computed by the materialized view between the submit and the redirect."

### 1:55 — 2:25 · The monetization model

**On screen:** Hit the back button to return to the homepage. Scroll past the directory to the **Coffee bounties** section.

**Say:**
> "The product makes money two ways."

**On screen:** Pan slowly across the bounty cards. Linger on the Safaricom Fibre bounty for "3 oat-milk cafés in Kilimani" and the Savanna Coffee Lounge bounty for "be the 10th verified speed test."

> "ISPs sponsor speed badges in the neighbourhoods they serve — Safaricom Fibre showing up wherever their fibre is what's making cafés express-tier. Café owners stake bounties for the Nth verified speed test at their place — contributor gets the coffee, café gets the visit, the wifi gets the proof. Each card on the homepage is a real demonstration of one of those flows."

**On screen:** Scroll up to one of the cards that shows a sponsored badge — Connect Coffee Roasters (Westlands, express). Click into it.

> "Here's the badge in context — Connect Coffee Roasters, Westlands, express tier, *Powered by Safaricom Fibre*. The detail page links the badge to the partners page where the model is priced."

**On screen:** Click the sponsored badge. The `/partners` page loads.

> "Three audiences, three pitches, one trust layer. The outlier flagging and the rate-limiting that gate bounty payouts are the same mechanics that already shipped for measurement integrity."

### 2:25 — 3:00 · The stack

Same as the original storyboard — Aurora console screenshot, "PostGIS + materialized view + scales-to-zero," Vercel project dashboard, close on the LATTENCY masthead.

**Updated stack copy:**
> "Amazon Aurora PostgreSQL Serverless v2 in eu-north-1. PostGIS for the cafés-near-me queries, materialized view for the per-café medians and tier classification, `REFRESH CONCURRENTLY` so reads stay live without locking, and a transactional café creation that rolls back on partial failure. Six migrations from `0001_extensions.sql` to `0006_cafe_metadata.sql` — the schema evolved with the product, not before it."

> "Frontend is Next.js 16.3 on Vercel. The home page pre-renders static with a sixty-second revalidate. Contribution endpoint runs as a function. Aurora scales to zero ACUs between visits."

> "Twelve seeded stations. Anyone in the world can map the thirteenth. The next twelve thousand are next."

---

## Bonus content (optional `#H0Hackathon` post)

If you want to claim the publish-a-piece-of-content bonus, here's a tighter LinkedIn / dev.to draft tuned for the v9 polish:

> Built **Lattency** for the Vercel × AWS Databases hackathon — a crowdsourced metro map of café wifi that turned into a two-sided marketplace.
>
> The data spine runs on Aurora PostgreSQL Serverless v2 + PostGIS. `ST_DWithin` powers the cafés-near-me query; a materialized view tiers each café by median measurement and refreshes concurrently after every contribution. Aurora scales to zero ACUs when idle, so a hackathon demo costs near-zero between visits.
>
> The trust mechanic is a real in-browser speed test that round-trips through a Vercel edge the server records and returns. Adding a new café is a single transaction: café row + first measurement + MV refresh. Contribution rate-limited per IP per hour; outlier readings flagged in Aurora the moment they land. Same mechanics gate the bounty payouts.
>
> The shipping surprise: the same map can be sold three ways. ISPs sponsor verified speed badges in the neighbourhoods they serve. Café owners stake bounties for the Nth verified speed test at their place. Contributors earn coffee for filling the map. `/partners` lays out the model end-to-end.
>
> Repo: https://github.com/thisyearnofear/lattency
> Live: https://lattency.vercel.app/
>
> I built this for the H0 hackathon. #H0Hackathon
