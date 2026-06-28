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

## 0:55 — 1:35 · Contribute a measurement, watch the tier flip

**On screen:** Open a terminal beside the browser. Run the curl POST. Browser refreshes. The same café — pick **Brew Bistro Kilimani** — flips from suspended (red, dashed) to express (green, solid).

**Say:**
> "Anyone can contribute a measurement. Here, I'm POSTing five fast measurements to Brew Bistro Kilimani — a café that's currently in the suspended tier."

(run the curl loop)

**On screen:** The five 201s land. Refresh the page.

> "The next read pulls from a materialized view that just refreshed. Brew Bistro is now on the express line."

(scroll to Brew Bistro's card in the stations index — the tier chip is now green)

**Commands to have ready in the terminal:**
```bash
ID=$(curl -s https://<your-vercel-url>/api/cafes/near | jq -r '.cafes[] | select(.name=="Brew Bistro Kilimani") | .id')
for i in 1 2 3 4 5; do
  curl -X POST https://<your-vercel-url>/api/measurements \
    -H "Content-Type: application/json" \
    -d "{\"cafeId\":\"$ID\",\"downMbps\":100,\"upMbps\":25,\"latencyMs\":10}"
  echo
done
```

(Pre-stage these in a shell script so you can run it with one keystroke.)

---

## 1:35 — 2:15 · The finale, the global ambition

**On screen:** Continue scrolling. The map zooms out. Nairobi pulses green. Arcs draw out to Lagos, Cape Town, Accra, Kampala, Kigali, then Berlin, Tokyo, NYC, São Paulo, Mumbai, Singapore. The chyron reads "ONE ENGINE, EVERY CITY".

**Say:**
> "The schematic isn't Nairobi-specific. The same engine — Aurora PostgreSQL, PostGIS for the geography, a materialized view that tiers cafés as measurements arrive — could map any city's wifi the same way. Lagos. Cape Town. Yours."

Let the constellation finish lighting up before you cut.

---

## 2:15 — 3:00 · The stack (this is the AWS judge slot)

**On screen:** Switch to the README on GitHub OR a clean architecture diagram (extract the Mermaid block as a PNG — see `docs/architecture-diagram.md`).

**Say:**
> "Under the hood: Next.js sixteen on Vercel, GSAP for the scroll-driven SVG, and Aurora PostgreSQL Serverless v2 in eu-north-1. We picked Aurora over Aurora DSQL and DynamoDB because we needed PostGIS — `ST_DWithin` powers the 'cafés near me' API."

**On screen:** Cut briefly to AWS Console showing the Aurora cluster (this is the submission requirement). Then cut to the Vercel project dashboard.

> "Serverless v2 scales to zero ACUs when idle — the demo costs almost nothing to run. The materialized view refreshes concurrently on every measurement, so reads are always close to live."

> "Twelve stations today. The next twelve thousand are next. Lattency."

End on the masthead held for a beat.

---

## Production tips

- **Practice the scroll pacing.** The cinematic is 800vh — at a normal scroll speed you'll cover it in ~25 seconds. Practice landing each chyron beat (express/local/suspended/finale) on the corresponding voice-over line.
- **Mute mouse-click sounds.** OBS → Settings → Audio → suppress.
- **Make the terminal big enough to read on mobile.** Increase font size, dark background.
- **Pre-stage the `.sh` script for the POST loop.** Pasting commands live looks amateur and eats seconds.
- **Don't show dev tools, .env files, or your AWS credentials at any point.** Sanitise everything visible.
- **Record at 1080p, upload to YouTube as unlisted.** Submission asks for a YouTube link — unlisted is fine.

## What you DON'T need to show

- The seed file. The seed is a developer convenience; judges care about the live product.
- The pre-commit hook. Engineering hygiene matters, but it's not a Best Design or Most Original argument.
- Code beyond the architecture frame in the closing 45 seconds. Code-on-screen for >5s loses general-audience judges.
