# Adaptive UX principles for Lattency

Decision-layer doc — the "why" behind what we build. Companion evidence: `docs/venue-3d-ux-research.md` (gamification RCTs, capture UX), `docs/venue-3d-insights.md` (provenance/privacy posture).

## The core thesis

> **Adapt the asks, not the chrome.**

Adaptive interfaces fail when the *layout* moves — users can't build spatial memory on a shifting surface. They succeed when the stable interface asks a *different, better question* of each user based on who they are, where they are, and what the network needs. Lattency's adaptation lives entirely in the ask layer: the map, nav, typography, and transit grammar never move; the card asking you to act changes continuously.

This resolves the classic adaptivity/usability paradox and matches our honest-labeling posture: a stable frame with a live agenda.

## The contribution ladder (the product's real shape)

Every rung has a time cost and a *visible* enrichment. The UI's job is to put the lowest unclaimed rung in front of the right person at the right moment — never to advertise rung 6 to someone at rung 0.

| Rung | Action | Time | What it enriches | Trust level |
|---|---|---|---|---|
| 0 | Browse the map | 0 | — | — |
| 1 | Test my wifi | ~12s | Personal context, edge latency baseline | self-reported |
| 2 | One fact | ~10s | One missing field on a venue (outlets? noise now? open?) | corroborated by count |
| 3 | One photo | ~20s | Venue card gets a face | moderated |
| 4 | Check-in (proximity) | ~15s | Presence corroboration signal | browser-located |
| 5 | Speed reading at venue | ~60s | Median metrics, freshness, tier confidence | browser-auto |
| 6 | Map a new café | ~60s | New station + first reading | community-reported |
| 7 | Capture run (3D) | ~3min | Spatial record, tour | consented + blurred |

Design rule: **a user should always see a doable next step.** If rung 5 is too much right now, rung 2 or 3 should be visible in the same breath — "can't test? one fact still moves this station."

## Primitives

1. **Progressive disclosure by state.** The UI literally grows with contribution depth. First visit: one hero ask (test my wifi). After first contribution: fact/photo asks appear. After ~3 contributions: bounty board, capture runs. The *content* of asks escalates; the *frame* does not.
2. **Scarcity-driven asks.** The strongest ask is a specific gap, not "contribute." "This station has speed but no photo." "Stale 14 days — one retest refreshes it." "No upload reading — yours would be the first." The ask names what's missing, why it matters, and the visible payoff. This is derived per-venue from fields we already compute (`photoUrl`, `lastReadingAt`, `measurementCount`, upload presence, scan status).
3. **Honest proof states.** Every surface already carries dataSource provenance; asks must inherit it — a "photo needed" card is corroboration-seeking, not verification. Never let convenience copy slide into "verified."
4. **Session → identity bridging.** The anonymous `contrib-` id already persists the trail; enrichment receipts show rank progress on `/me` only after contribution exists — the profile page is a reward surface, not a signup wall.
5. **Permission at the moment of use.** Geolocation on gesture (shipped), camera inside the RUN step (shipped), motion hints opt-in (shipped). The adaptive extension: asks *filter themselves* by granted capability — a denied-camera session sees fact asks instead of photo asks instead of error states.
6. **Consequence feedback.** Every action returns an enrichment receipt: "your photo is now this station's face", "your reading pushed freshness from stale → live". The network visibly improves because of you — this is the meaningful-recognition effect the research says beats points (Wikipedia RCT: recognition drove +60% sustained productivity; trivial rewards backfired).
7. **Ambient legibility.** State readable at a glance — tier colour, freshness, source label — so adaptive asks land on an already-comprehensible map.

## Modalities (what adapts to what)

- **State-adaptive:** contributor depth (first-time → returning → crew), their own trail (which venues they've touched — don't re-ask for what they already gave).
- **Context-adaptive:** time-of-day (shipped: "this morning"), proximity (near-you nudge exists — extend to per-venue asks when a station is within ~150m), device capability (camera/motion permission grants shape which rungs are offered).
- **Data-adaptive:** the network's own gaps — per-venue "needs" derived server-side and ranked (missing photo > stale reading > missing upload > no scan). This is the organizing primitive: *what the map needs from you right now.*
- **Skill-adaptive:** asks escalate only after success on the prior rung — a user who completes two fact-asks gets offered a photo; capture runs stay behind crew/attestation gates regardless.

## The "next best action" engine

Mechanics of the ask layer, kept deliberately boring:

- **Per-venue needs derivation** — pure function `venueNeeds(cafe)` → ordered list: `["photo", "freshness", "upload", "outlets", "scan"]`. Server-computable from station fields already returned by `/api/network`.
- **Ask queue** — rank needs by (a) proximity to the user when located, (b) scarcity weight (photo/staleness outrank enrichment-of-rich venues), (c) prior asks dismissed/contributed in-session.
- **Ask card anatomy** — one card, one rung: `{time cost} · {the gap} · {the payoff}`. E.g. *"20s · this station has no photo · yours becomes its face."* Dismissible, never blocking, max 1–2 visible.
- **Receipt on completion** — the diff callout pattern already exists (tier change after a reading); generalize it: every action resolves into "what you just filled."
- **Open loops** — the notification inbox already surfaces stale stations; asks are the session-side twin of that system.

## Anti-patterns (things that look adaptive but rot)

- **Moving-target chrome** — layout that changes between sessions; kills learnability. Our answer: stable frame, adaptive ask layer only.
- **Fake progress** — "85% scanned" style bars the backend can't verify. Already banned in the capture coach; same rule for contribution progress — show *counts of things done*, never invented percentages.
- **Point inflation** — generic "+10 for contribution" everywhere. Rewards stay scarce and named (bounties, first-scan claims, rank tiers).
- **Permission-first flows** — asking geo/camera before context. Already fixed; keep it that way.
- **Over-personalization** — hiding surfaces "because they didn't click last time." Dismissals decay; nothing is permanently hidden except completed asks.
- **Adaptive copy drift** — different users seeing different *claims* about the data. Provenance wording stays constant even as asks vary.

## What exists vs. the gap

**Already built:** contribution rungs 1–7 all exist as flows; anonymous identity + rank ladder; near-you nudge (gesture-gated); stale-station notifications; enrichment receipts on measurement success (diff callout, celebration); capability-gated capture coach; provenance labels everywhere.

**The gap — and it's the whole adaptive layer:** asks today are static and venue-agnostic ("Map a café", "Run a speed test"). Nothing computes *which* venue needs *which* rung from *this* user *right now*. `venueNeeds` + the ask queue + fact/photo micro-contributions (rungs 2–3 as standalone asks rather than fields inside a big form) is the missing product.

## Implementation order (proposed)

1. ✅ `lib/venue-needs.ts` — pure need derivation + tests (no UI yet). **Shipped.**
2. ✅ Ask cards on the venue drawer/detail — needs-driven, one rung each. **Shipped** (`components/venue-ask-card.tsx`); receipts on completion still pending.
3. ✅ Standalone fact + photo contribution endpoints (reuse photo pipeline from café creation; consent line for "no identifiable people"). **Shipped** — `POST /api/venues/[id]/facts` + `POST /api/venues/[id]/photos` → `venue-fact` / `venue-photo` gateway actions; ask-card CTAs open `components/venue-fact-sheet.tsx` / `components/venue-photo-sheet.tsx`.
4. ✅ Session-context ask ranking (proximity when located; dismissal decay in localStorage). **Shipped** — `rankNeedsByProximity` + `components/nearby-ask-strip.tsx` (chips open the map drawer); dismissals decay (7-day TTL) and gate which need each chip surfaces.
5. Depth-gated ask escalation (unlock rungs by prior contributions). *Pending.*

## Ask surfaces (shipped)

- `components/venue-ask-card.tsx` renders **one** card — the next most-scarce un-answered need from `nextAsk()` — on `CafeDetail` (map + directory drawer) and `CafePage` (`/cafes/[slug]`), placed below the DataSourceNote/provenance line, never above the tier headline.
- Dismissal: `lattency:ask-dismissed:{cafeId}:{need}` in localStorage, 7-day TTL (`lib/ask-dismissals.ts`). Expired dismissals resurface the ask; nothing is permanently hidden.
- CTAs route to the existing contribution affordance — the drawer's `contribute` tab when mounted, else the `#contribute` section. The scan ask links to `/capture/{slug}` and only renders when `NEXT_PUBLIC_VENUE_CAPTURE_ENABLED=1`, `venueCaptureUiCityAllowed(city)`, and `/api/venue-scans` confirms no published scan (fetched lazily, only when scan is the surfaced need).
- `components/nearby-ask-strip.tsx` is the session-level surface — a slim "THE LINE NEEDS" strip below the map chrome on the city page, visible only after the user grants location via "Find me" (it never prompts itself). Up to 3 chips — `{venue} · {distance} · {time cost} · {need verb}` from `rankNeedsByProximity` (≤1.5km, nearest first, scarcity ties, capped at 5 lib-side) — each opening the venue's map drawer where the matching ask card waits. Scan asks never surface here: the strip can't confirm scan state, so rung 7 stays on the venue surfaces that verify first. Dismissed needs fall through to the venue's next gap rather than hiding it.
- Needs order (scarcity): photo → freshness (>14d) → upload (readings but no up-leg) → facts (<2 confirmed) → scan.

## Success signals

- Rung 1→2 conversion (do speed testers take a second action?)
- Ask-to-completion rate per rung (is the ladder honest about effort?)
- Repeat-contribution rate at 7d
- Percentage of venues with photo + fresh reading + ≥3 readings (coverage health)
- Zero regression in data-quality signals (auto/manual split, outlier rate)
