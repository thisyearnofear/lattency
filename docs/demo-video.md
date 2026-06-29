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
