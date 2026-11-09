# Venue 3D capture — insights & recommended path

Companion to `docs/venue-3d-research.md` (the cited evidence base). This file is the decision layer: what the research means for Lattency and what we do about it.

## The idea, restated correctly

The original framing — "people in a location take photos that become 3D models" — is wrong about the capture mechanics. Photogrammetry/3D Gaussian splatting needs dense overlapping coverage, which in practice means **one contributor filming a guided 60-second walkthrough** per venue, not a crowd pooling snapshots. The crowd model applies to *validation*, not capture.

The defensible version of the idea: **consent-verified, contributor-captured spatial records of workspaces**, delivered alongside the connectivity data that is already our differentiation.

## What the research confirmed

1. **Technically feasible and cheap.** ~$0.50–3 per scene self-hosted; ~$1k of infra covers ~200 scenes. The binding cost is consented acquisition, not compute.
2. **The crowd model is proven.** Niantic shipped 50k+ crowdsourced splats (*Into the Scaniverse*) — the incentive loop works.
3. **Venue-funded capture is the proven payer.** Matterport charges ~$238–325 per café-sized space plus hosting. A free tour is a real venue-acquisition hook.
4. **The lane is open.** Niantic restricts private spaces on its map; nobody owns consent-verified interiors + connectivity data.

## What the research disproved

1. **"Capture first, ask venues later" fails.** Germany enforces interior photography rights (*Sanssouci*, BGH V ZR 45/10); US/UK architectural-photo exemptions don't cover private interiors; Kenya DPA s.37 expressly bars commercial use of personal data without consent — and Nairobi is a live city. Consent-first is a hard requirement.
2. **Patrons are the real liability, not property.** A splat encodes facial *geometry* — Illinois BIPA territory ($1k–5k/violation, private right of action). Blur-before-reconstruction is mandatory; venues themselves have no automatic takedown right (though we should build verified-owner veto anyway — it's the industry norm and the trust-safe default).
3. **The obvious open-source stack is a license trap.** Inria `gaussian-splatting` and NVIDIA `instant-ngp` are non-commercial; OpenDroneMap is AGPL. The clean stack: **gsplat (Apache-2.0) + COLMAP + MIT viewers (Spark/SuperSplat) + SPZ compression** (~90% smaller than PLY, mobile-viable).
4. **Don't rent the hosted pipeline.** Luma's capture API is dead; Polycam's is Enterprise-gated; Scaniverse Pro feeds Niantic's map. Self-hosting is cheaper, license-clean, and doesn't train a competitor.
5. **Platform liability is real.** Because Lattency *produces* the splat (not merely hosts uploads), §230/DSA-style intermediary shields may not apply to the generated model. Contributor warranties must be paired with consent checkpoints + pre-reconstruction anonymisation. Flagged: needs counsel before launch.

## The strategic frame

This is not a pivot to "3D venue marketplace." It's **ground-truth spatial+connectivity intelligence for workspaces** — the same agent-consumable thesis as `/api/llm`, extended one dimension. The splat is one input into venue intelligence (alongside layout metadata, outlet positions, predicted busyness); venue marketing tours are the monetization surface, not the product.

## Next steps — phased

**Phase 0 — legal spine (before any code)**
- Draft the contributor consent checkpoint (filmer affirms venue permission + no identifiable patrons or consent obtained).
- Draft venue claim/veto flow (verified owner can flag any scan for review/takedown — industry norm, cheap to build on existing claim patterns).
- Get counsel sign-off on: patron anonymisation sufficiency (blur vs. rescan), BIPA exposure, Kenya DPA s.37, intermediary-shield question.

**Phase 1 — capture infrastructure (~skeleton, behind feature flag)**
- Real file storage (Base64 entity photos were already flagged as needing this — now it's forced).
- Upload → moderation queue → `deface` blur + audio strip → gsplat/COLMAP job → SPZ output → object storage.
- New bounty kind: `venue-capture` — one claim per venue, distinct from measurement bounties; requires venue-consent attestation in submission.
- Schema: `VenueScan` entity (venue_id, contributor_id, consent attestation, status: captured/processing/published/rejected, splat_url, takedown_requested).

**Phase 2 — pilot (10–20 venues, one neighbourhood)**
- Manually recruit opted-in venues (Shoreditch or Nairobi — verify local consent norms first).
- Embed a viewer (MIT-licensed splat player) on the venue detail page behind a "3D tour" affordance — keep newsprint frame, don't redesign the card around it.
- Instrument: tour-view rate, venue-selection conversion vs. control, capture-bounty completion rate, venue claim rate.

**Phase 3 — decision gate**
- If tours move venue selection and venues claim profiles: productionize (self-hosted pipeline on rented GPU, viewer on detail pages, venue-funded capture tier on /partners).
- If tours admire but don't convert: kill the feature, keep the venue-consent/claim infrastructure (it's independently useful), and redirect effort to time-of-day prediction and seat availability — the higher-confidence scaling axes.

## Guardrails (non-negotiable)

- No scan published without: venue consent attestation, blur verification, owner-veto path live.
- No non-commercial-licensed code in the pipeline (gsplat + COLMAP only).
- No payment reactivation entanglement — capture bounties launch unpaid-or-credit while `bountyPaymentsEnabled()` stays false until the funding-verification path ships.
- 3D is additive to the workspace-finder journey — it must not displace tier/freshness/provenance as the headline on any surface.

## Capture run v2 — elevation findings (docs/venue-3d-ux-research.md, committed 33bda67)

Five moves ranked by impact:

1. **Record in-app at controlled bitrate, upload during capture.** MediaRecorder ~6–8Mbps → ~45–60MB per 60s run. iOS has no background upload — chunked upload-during-capture (or JPEG keyframes at 2–5fps + manifest) is the architecture, not a resumable spinner.
2. **Live capture coach, honestly labeled.** Geometry-backed coverage is native-only; browsers get sector progress ("views recorded"), Laplacian sharpness warnings, DeviceMotion pace hints, and BlazeFace face-in-frame warnings — consent becomes a live control, not a checkbox. Never a fake "85% scanned."
3. **Pre-upload quality gate + staged pipeline.** Client-side signals hard-gate broken captures; bounded pose-registration validation before gsplat; coarse preview splat → final with truthful states (Aligning → Building preview → Refining → Published).
4. **Rescan/supersede is first-class.** Gap-fill and "retake this segment" semantics (Scaniverse Sites model) — `VenueScan` needs them instead of terminal `rejected`.
5. **Recognition over points.** Named tour credit + specific next mission + scarce coverage bounties (Wikipedia RCT +60%/90d); trivial scan rewards backfire (Pokémon GO mass deletions).

Assumptions corrected:

- "Self-host only" is stale — Splat3D/MakeSplat/vid2scene now ship commercial video→splat APIs (bake-off vs gsplat self-host, self-host stays default).
- InstantSplat is non-commercial via DUSt3R init — fast preview needs another path.
- iOS WebXR/AR is a dead end — guidance is 2D overlays only.
- SPZ alone isn't enough — serve streamed SOG/RAD for progressive delivery; `KHR_gaussian_splatting` is ratified glTF.
- Matterport's stationary-rotation UX is wrong for splatting — copy its task/recovery UX, not its motion.
- Owner-claim is uphill (~56% GBP unclaimed; claiming correlated with lower ratings on Yelp) — the venue workspace must be immediately useful.

Schema deltas required for v2: `quality_score`, `coverage_sectors`, `face_events`, supersede/rescan semantics on `VenueScan`.
