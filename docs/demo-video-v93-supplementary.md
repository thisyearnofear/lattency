# Supplementary clip: v9.3 update demo (60–90 seconds)

This is the **second** video, not a replacement for the submitted one. Goal: show the work that landed between v9 (submitted) and v9.3 — the contribution flow, the bounty board, the contributor dashboard — without re-explaining the product, the Aurora stack, or the cinematic.

Target length: **60 seconds** (sweet spot for retention), hard cap **90 seconds**.

---

## Pre-flight (5 minutes before record)

1. **Sign in once on your recording account** so `/me` has data to show. If you haven't, run through the sample-data contribution flow once — that creates a café + reading attributed to your user.
2. **Warm Aurora**: visit `https://lattency.vercel.app/` and let it load. First cold-start is 15–30 seconds; you don't want that on tape.
3. **Open three tabs in order** so cmd-tab walks the demo cleanly:
   - Tab 1: `https://lattency.vercel.app/` (logged in)
   - Tab 2: `https://lattency.vercel.app/me`
   - Tab 3: `https://lattency.vercel.app/partners`
4. **Browser at 1440×900**, dev tools closed, bookmarks bar hidden, address bar visible.
5. **OBS / QuickTime**: 1080p, mouse-clicks muted, no system notifications.

---

## Recording script

Three scenes, ~20 seconds each.

### 0:00 — 0:08 · Frame the update (Tab 1, top of homepage)

**On screen:** Homepage at scroll 0. Cursor hovers near the top-nav `+ Map a café` button but doesn't click yet.

**Say:**
> Quick v9.3 update on top of what shipped in the main video — open contribution, sponsor tiles, and a contributor dashboard. Aurora, Vercel, same stack.

---

### 0:08 — 0:38 · The contribution flow (the headline beat)

**On screen:**
1. Click `+ Map a café` in the top nav.
2. Modal opens on step 1 (Location).
3. Click `Try with sample data →` (the secondary button under the divider).
4. Modal jumps to step 4 (Speed test). Click `Run speed test`.
5. **Let the test actually run.** The phase chips advance Ping → Download → Upload, the live readout shows real Mbps numbers ticking up, the skeleton tiles convert to the four result stats. This is ~12–15 seconds of live numbers — it's the strongest proof in the entire clip.
6. When the test finishes, click `Continue`.
7. On step 5 (Photo), the SVG placeholder card is already populated. Click `Submit`.
8. Loading state, then the router pushes to `/cafes/<slug>`. New café page renders.

**Say (pacing to the action):**
> Click Map a café. Skip the geolocation with sample data so you can see the flow without leaving your desk. Run a real speed test — the browser actually downloads against a Vercel edge, uploads against an API route, and the server records which edge served the test. You can't fake this round-trip from a fake IP, which is what makes the listing trustworthy. Submit, and we land on the new café's page with your reading at the top of the Last-brewed-here ticker. Single Postgres transaction, materialized view refreshed concurrently after commit.

---

### 0:38 — 0:55 · Monetization + dashboard

**On screen:**
1. Hit back to the homepage. Scroll past the directory to the **Coffee bounties** section.
2. Pan slowly across the cards. Linger 2 seconds on the Safaricom Fibre bounty ("3 oat-milk cafés in Kilimani") and the Savanna Coffee Lounge bounty ("Be the 10th verified speed test").
3. Cmd-tab to Tab 2 (`/me`).
4. Show the contributor dashboard: stat band (Readings · Cafés added · Coffees earned), the Readings list, the Cafés-added list.

**Say:**
> Two new sections show how the product makes money. ISPs sponsor speed badges in the neighbourhoods they serve. Café owners stake coffees for verified contributions. Community members back-fill the map. Once you're signed in, your contributions roll up at `/me` — readings, cafés you've added, coffees earned when the payout rail ships.

---

### 0:55 — 1:00 · Close (Tab 3, `/partners` page)

**On screen:** Cut to `/partners`. Hold on the hero ("Where your wifi meets your customers"). Don't scroll.

**Say:**
> Full pitch on `/partners`. Same Aurora, same edge.

End on the masthead. Cut.

---

## Production tips

- **Don't talk over the speed test.** Let the numbers tick up in silence for ~5 seconds in the middle of the speedtest beat — the live readout is the whole point.
- **Mouse pace:** moving the cursor to the button slightly before you say its name reads as confident, not over-rehearsed.
- **No code on screen.** This clip is for the prize-judging gestalt, not the technical deep-dive. The repo + the main video already cover the stack.
- **Trim aggressively in post.** If the speed test takes 15 seconds, that's fine — keep it. But trim any pre-click hover delays and any "Submit" → "loading" wait that exceeds 1 second.

## What to skip

- The roast vocabulary, the cinematic at `/tour`, the schematic ↔ geographic toggle, the world-map finale, the Aurora console screenshot, the migration history — all covered in the main video.
- Don't introduce yourself or the product. The viewer is already a judge who has seen submission #1.
- Don't mention "Vercel Hobby cron limitation" or other shipping-detail asides — keep it product-facing.

## Posting checklist

- [ ] Upload as **unlisted** YouTube (matches the main video's posting status).
- [ ] Title: `Lattency v9.3 update — open contribution + bounties + sign-in (60s)`.
- [ ] Description: one line — "Supplementary 60-second clip showing the v9.3 update on top of [main submission video link]. Built for the #H0Hackathon."
- [ ] **Update README** — add a single line near the top under the existing live link: `**v9.3 update demo (60s):** <youtube unlisted link>`.
- [ ] **Update Devpost submission description body** — add one line at the end: `Supplementary v9.3 update clip (60s, additive to the submission video above): <youtube unlisted link>`. Do NOT replace the original video link.
- [ ] If you re-recorded after the deadline, leave a timestamp note in the README so judges know the clip is additive context, not the canonical demo.
