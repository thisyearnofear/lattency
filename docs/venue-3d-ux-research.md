# Venue 3D capture — UX elevation research

Companion to `docs/venue-3d-insights.md` (decision layer) and `docs/venue-3d-research.md` (legal/technical diligence). This file answers a narrower question: **the current capture run (checklist → 3 attestations → armed notice) is a consent gate, not a capture product — what does best-in-class look like, and what can a mobile web app actually ship?**

*Compiled 2026-11-09. Sources: 2 Parallel Task-API deep-research runs (`ultra` processor, runs `trun_2505259133864e459d15e148b2b59a42` and `trun_2505259133864e45854b39225a731c5d`), ~20 Tavily searches, targeted doc fetches. Inline URL citations throughout. Where a mechanism is a vendor claim rather than documented behavior, it's flagged.*

---

## 1. Executive verdict

**The capture run isn't "too basic" in its consent spine — it's missing the two product layers that make captures succeed: (a) live capture coaching with a pre-upload quality gate, and (b) a contribution loop that rewards repeat scans.** Every shipping product that works treats capture as a *guided instrument*, not a form. The honest gap for a web app is geometry-backed feedback (LiDAR grids, world-locked AR) — which means we should design a **two-level confidence model**: immediate input-quality guidance in the browser, followed by geometry-backed server validation. Do not fake the second level.

Five elevation moves, ranked by leverage:

1. **Record in-app at controlled bitrate + upload recoverable chunks during capture** — collapses the "300–800MB upload" problem at the source. MediaRecorder honors `videoBitsPerSecond` (defaults: ~2.5Mbps Chrome, ~10Mbps Safari — [addpipe](https://blog.addpipe.com/mediarecorder-video-bitrates)); ~6–8Mbps → ~45–60MB per 60s. Upload math is brutal otherwise: 800MB at 5Mbps upstream = **21 minutes**. Caveat: `timeslice` chunks aren't independently decodable — server must concatenate; alternatively upload selected JPEG keyframes (§7).
2. **A live capture coach with honest labels** — the shipping pattern is coverage feedback tied to *actual geometry* (Polycam's disappearing LiDAR grid, RealityScan's red→green point cloud, Scaniverse's blurry→sharp scene). A browser can't measure surfaces, so show **"views recorded" sector progress + quality flags** (sharpness, pace, exposure, face-in-frame) — never a fake "85% of room scanned" percentage. ([MetaScan coverage ring claim](https://www.metascanpro.com/technology), [RealityScan review docs](https://dev.epicgames.com/documentation/realityscan-mobile/realityscan-review-scan), [Swyvl Polycam walkthrough](https://swyvl.io/blog/how-to-create-gaussian-splats))
3. **Pre-upload quality gate + staged preview** — score sharpness/motion/novelty client-side before accepting the upload (saves GPU on dead captures), then a **bounded pose-registration check** before full training, then a coarse preview splat → final asset. Truthful pipeline states (borrowed from the Parallel synthesis): *Checking capture → Uploading → Aligning views → Building preview → Refining → Ready for review → Published*.
4. **Rescan loop as a first-class state** — Scaniverse "Sites" organize scans per location and support adding targeted scans to fill gaps ([docs](https://www.nianticspatial.com/docs/scaniverse/techniques), [advanced tools](https://www.nianticspatial.com/docs/scaniverse/advanced_tools)); Matterport lets you rescan a failed station instead of restarting ([assisted alignment](https://support.matterport.com/s/article/Assisted-Alignment?language=en_US)). `VenueScan` needs supersede/gap-fill semantics and "retake this segment" must bounce failed captures back to the contributor — not die in `rejected`.
5. **Recognition + missions, not points** — the strongest causal evidence in contribution systems is *meaningful recognition*: a randomized Wikipedia experiment gave **+60% productivity over 90 days** after a peer award ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0034358)). Points/levels have no published retention uplift; trivial rewards for scans actively backfire (Pokémon GO AR-mapping tasks were deleted on sight — [Silph Road](https://www.reddit.com/r/TheSilphRoad/comments/jexad3/new_info_ar_mapping_task)). Design: named credit on the tour, a specific next mission after acceptance, scarce coverage bounties — never token rewards.

**Assumptions this research disproved:**

- *"300–800MB upload is unavoidable"* — false for in-app recording; only true for camera-roll 4K, which should be the fallback path.
- *"On-device preview is impossible on web"* — browser-native splat training exists ([WebDGS](https://github.com/krispy-kenay/WebDGS), [WebSplatter arXiv](https://arxiv.org/html/2602.03207v1)) but needs calibrated poses and discrete-GPU-class hardware — an R&D track, not a launch path. Honest v1: server-side coarse preview.
- *"InstantSplat is the clean fast-preview shortcut"* — **license trap**: InstantSplat's Apache-2.0 core initializes from DUSt3R, which is **CC BY-NC-SA noncommercial** ([InstantSplat LICENSE](https://github.com/NVlabs/InstantSplat/blob/main/LICENSE), [dust3r LICENSE](https://github.com/naver/dust3r/blob/main/LICENSE)); MASt3R is also noncommercial ([LICENSE](https://github.com/naver/mast3r/blob/main/LICENSE)). The whole license-clean-stack discipline applies to preview candidates too.
- *"Self-hosting is the only option"* — **commercial video→splat APIs shipped since late 2025**: Splat3D (beta May 2026, claims 30–60s iPhone video → splat in <10min, presigned-upload API, SPZ/SOG/PLY out — [docs](https://docs.splat-3d.com/quickstart), [launch](https://splat-3d.com/blog/splat3d-is-live)), MakeSplat ([docs](https://makesplat.com/docs)), vid2scene (Enterprise-gated — [docs](https://vid2scene.com/docs)). Self-hosting remains the right default (cost, licensing, data-handling control), but bake-off candidates now exist.
- *"SPZ vs SOG is the format decision"* — the real decision is **master vs delivery artifact**. SPZ is now **v4** (ZSTD, independently compressed attribute streams — but no spatial LOD); Streamed SOG (`lod-meta.json`) and Spark's RAD give true progressive LOD. Keep a full master + poses; emit delivery formats per viewer via SplatTransform (MIT).
- *"Ratified interop doesn't exist"* — **`KHR_gaussian_splatting` is a ratified glTF extension** ([Khronos spec](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md)) — splats are becoming a standards-track asset type, which de-risks the viewer bet.
- *"Consent is a pre-run gate"* — best-in-class treats it as continuous: live face-in-frame warnings, retake prompts, post-capture review. The checklist is necessary but not sufficient.

---

## 2. Best-in-class capture flow — annotated, from shipping products

What each product actually does (documented sources; "not documented" ≠ absent):

| Product | Live coverage feedback | Live quality feedback | AR/visual guidance | Haptics/audio | Review & targeted recovery |
|---|---|---|---|---|---|
| **Scaniverse** | Scene renders blurry→sharp where useful angles captured; newer docs describe live meshing ([techniques](https://www.nianticspatial.com/docs/scaniverse/techniques), [getting started](https://www.nianticspatial.com/en/capture/scaniverse-getting-started)) | Patchy/unstable mesh = poor tracking → "slow down, return to captured features" | Reconstructed mesh itself is the feedback; no documented % heatmap | Not documented | Revisit still-blurry areas; inspect assets for gaps; add targeted scans; process now or later |
| **Polycam** | **LiDAR Space Mode**: blue grid disappears as surfaces scan. **Guided Object**: live point cloud reveals gaps ([Polycam docs](https://learn.poly.cam/hc/en-us)) | Explicit "**Tracking lost: stop moving, let the app relocate**" prompt | Blue surface grid, floor-plan boundaries | **Haptic buzz** confirms auto-capture | Inspect remaining blue dots; photo viewer lets you delete blurry/dup images before processing |
| **RealityScan** (comparator) | Reconstructed point cloud appears in the camera view | Quality color scale **red→green** by coverage ([step-by-step](https://dev.epicgames.com/documentation/realityscan-mobile/RealityScan-Step-by-Step-Guide?lang=en-US), [review scan](https://dev.epicgames.com/documentation/realityscan-mobile/realityscan-review-scan)) | AR overlay + crop region | Not documented | Review point cloud, return and add more pictures, then process |
| **Matterport Capture (phone)** | **2D minimap** of scan stations | Alignment failure → explicit move-closer/retry/rescan ([docs](https://support.matterport.com/s/article/Assisted-Alignment?language=en_US)) | Follow white dots; pink rings show progress | Not documented | Correct failed alignment per-station; mark windows/mirrors; email when processed |
| **Luma** | Loops/layers guided flow; no documented heatmap (tutorial dated Nov 2022) | Not documented | **AR guide** + bounding box + orbit loops ([guide](https://home.swiftxr.io/blog/luma-ai-3d-capture-the-complete-guide-to-scanning-exporting-and-publishing-3d-models-in-2026)) | Not documented | Name → upload |
| **MetaScan/Abound** | "*On-screen coverage ring*… which angles you still need" — vendor claim ([metascanpro](https://www.metascanpro.com/technology)) | Capture controls, not automated warnings | Mini-map, interactive camera views (listing claims) | Not documented | Guided retake of missing angles |

**Two important corrections this surfaces:**

1. **Matterport's trajectory is wrong for us.** Smartphone Matterport guides *stationary rotations* (1–3 spins in place). Splat pipelines want **translated movement** — AWS's splat-capture guidance explicitly warns against stopping and panning from one position. Borrow Matterport's *task structure and recovery UX*, not its motion pattern. Our checklist already says "walk a slow loop" — the coach should detect stationary panning and correct it live.
2. **Coverage feedback in every product is geometry-backed** (LiDAR grid, point cloud, reconstructed mesh). A 2D overlay can approximate "where you've pointed" but not "what's captured" — hence the honest-labeling rule.

**Pipeline-informed capture guidance** (`venue-3d-research.md` §4): slow walkthrough, 3 height levels, avoid mirrors/windows/moving patrons, ~3–6 effective fps after extraction ([Vulkan splat-capture tutorial](https://docs.vulkan.org/samples/latest/samples/complex/render_octomap/Tutorials/capturing-gaussian-splats.html) — "walk uncomfortably slowly, extract every 5–10th frame").

---

## 3. What's replicable in a mobile web app vs needs native

### Replicable (iOS Safari + Android Chrome)

| Capability | Web mechanism | Caveats |
|---|---|---|
| Camera + record | `getUserMedia` + `MediaRecorder` | iOS: MP4/H.264+AAC since iOS 14.3 ([WebKit](https://webkit.org/blog/11353/mediarecorder-api)); **Safari 18.4 added WebM/VP8/VP9**. Resolution via getUserMedia typically ≤1080p — plenty. Always inspect `getCapabilities()`/`getSettings()` for what you actually got. |
| Bitrate control | `videoBitsPerSecond` | Chrome ~2.5Mbps / Safari ~10Mbps defaults ([addpipe](https://blog.addpipe.com/mediarecorder-video-bitrates)). Validate `MediaRecorder.isTypeSupported()`. |
| Live sharpness | Canvas downsample + Laplacian variance | Scene-dependent thresholds — use **relative degradation within the capture**, not a universal cutoff ([PyImageSearch tuning caveat](https://pyimagesearch.com/2015/09/07/blur-detection-with-opencv/), [Revolut JS impl](https://medium.com/revolut/canvas-based-javascript-blur-detection-b92ab1075acf)) |
| Motion/pace cues | `DeviceMotionEvent` | iOS 13+ needs `requestPermission()` from a user gesture ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)). Rotation rate ≠ translation — warn on fast turns, don't infer trajectory. |
| Face-in-frame warning | MediaPipe BlazeFace (WASM, ~3MB) | Real-time on mobile ([Google blog](https://blog.tensorflow.org/2020/03/face-and-hand-tracking-in-browser-with-mediapipe-and-tensorflowjs.html)); run in a **Worker** — synchronous inference blocks UI ([MediaPipe web guidance](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)). Doubles as consent instrument. |
| Coverage approximation | yaw accumulation (DeviceOrientation) + frame-difference/optical-flow novelty | Honest ceiling: *sectors/segments visited*, not surface coverage. Sparse Lucas–Kanade optical flow via OpenCV.js/WASM in a worker is the richer version ([OpenCV.js LK tutorial](https://docs.opencv.org/4.13.0/db/d7f/tutorial_js_lucas_kanade.html)). |
| Screen wake | Screen Wake Lock API | iOS Safari 16.4+ (browser, not installed-PWA per [whatpwacando](https://whatpwacando.today/wake-lock)); can be denied/released — handle lifecycle. |
| Frame extraction | WebCodecs `VideoDecoder`/`VideoFrame` → JPEG | Modern browsers; enables the JPEG-keyframe upload path (§7). |
| Resumable upload | tus (tus-js-client/Uppy) or S3 multipart via Uppy AwsS3 | tus used by Vimeo/Cloudflare/Supabase ([tus.io](https://tus.io)); Uppy defaults to multipart >100MiB, S3 min part 5MiB ([Uppy AWS S3](https://uppy.io/docs/aws-s3)) |
| Haptics | `navigator.vibrate` | **Android only — iOS Safari does not support it.** Pair any buzz with visible text; never the sole channel. `lib/haptics.ts` guard already correct. |

### NOT replicable — the honest gaps

| Capability | Why | Consequence |
|---|---|---|
| World-locked AR overlays | `immersive-ar` WebXR still absent on iOS Safari ([WebKit bug 208988](https://bugs.webkit.org/show_bug.cgi?id=208988)); Android-only enhancement at best | Guidance = 2D overlays (sector ring, arrows, chips) — the Scaniverse "painted surfaces" look is out |
| On-device splat preview | Scaniverse's ~1-min local reconstruction needs the native sensor/GPU stack ([teardown](https://www.reddit.com/r/GaussianSplatting/comments/1mdjscn/how_is_the_scaniverse_app_even_possible)); WebDGS/WebSplatter are research-grade and need poses | Server-side staged preview instead (§7) |
| LiDAR | No browser API anywhere | COLMAP without depth — compensate with denser coverage; iOS LiDAR-dependent features (Polycam Virtual Walkthrough) unreachable |
| Background upload | iOS Safari: no Background Sync, no Background Fetch ([PWA iOS guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)); camera stops when tab backgrounds | Foreground-only uploads: progress + wake lock + "keep this tab open" + reconcile-with-server on return |
| WebNN on-device ML | iOS support disabled-by-default | MediaPipe/WASM or WebGL inference, not WebNN baseline |
| WebGPU | iOS 26 partial only ([caniuse](https://caniuse.com/webgpu)); Chrome Android 12+ on qualifying GPUs | **Viewer baseline = WebGL2** (Spark explicitly targets mobile WebGL2); WebGPU = progressive enhancement |

---

## 4. Capture quality scoring — the pre-upload gate

No vendor publishes a scoring formula — but there are concrete open implementations and clear failure modes. Two-level rule: **hard gates reject broken captures; advisory gates warn without rejecting valid-but-difficult venues.**

| Signal | Implementation | Failure mode | UX/gate |
|---|---|---|---|
| Sharpness | Grayscale Laplacian variance, sampled ~2–4/s, per-tile option | Textureless walls score low naturally; noise inflates | "Hold steadier" on sustained *relative* drop; rank frames in time windows (Postshot-style: blur filter + optical-flow selection — [postshot_script](https://github.com/sensyn-robotics/postshot_script/blob/feature/colmap-integration/README.md)) |
| Exposure/visibility | Histogram for persistently dark/clipped regions | Windows ≠ unusable room | "Point away from the window"; hard-fail only clearly dead stretches |
| View novelty/duplicates | Frame hashes or feature displacement | Moving patrons fake novelty; pure rotation fakes diversity | "Walk a few steps" when effectively stationary — never convert to a coverage % |
| Track continuity | Sparse LK optical flow, track survival | Textureless walls/reflections break tracks | "Slow down / aim at furniture" when tracking degrades |
| Rotation rate | DeviceMotion (opt-in) | Rate ≠ position | Warn on fast turns; never infer a trajectory |
| Face events | BlazeFace per Nth frame | False positives on posters/screens | Live "face in frame" banner + post-capture re-attestation + deface-priority flag server-side |
| Capture integrity | Decoded frame count, timestamps, interruptions | Frozen/corrupt recording hides behind nominal duration | Hard-fail empty/unreadable |
| Task progress | Contributor checkpoints (entrance → seating → counter → return) + timestamped thumbnail strip | Check-ins aren't geometry | "Entrance recorded" labels, weak-interval retake — not "entrance geometry complete" |

**The deeper gate is server-side:** before full training, run a **bounded pose-registration validation** — registered-image fraction, disconnected camera groups, match inliers, view span. AWS flags pose estimation as the common failure point; this is where a bad capture should die, not after an hour of gsplat. Store the client signals on `VenueScan` (`quality_score`, `face_events`, `coverage_sectors`) so the GPU queue can be ordered by expected yield — "instrument accepted scenes, not raw uploads" made mechanical.

---

## 5. Gamification — ranked by strength of evidence for *repeat* contribution

| Rank | Mechanic | Evidence | Fit |
|---|---|---|---|
| 1 | **Meaningful recognition / visible impact** | RCT: Wikipedia barnstar → +60% productivity, less dropout over 90 days ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0034358)); SDT: competence/autonomy/relatedness as the motivational core | "Your capture made this venue explorable", owner thank-yous, named credit on the tour. The strongest evidence — and cheapest to build |
| 2 | **Recurring, useful missions** | Niantic: **10M scanned locations, ~1M fresh scans/week** (Nov 2024 — [Niantic LGM post](https://nianticlabs.com/news/largegeospatialmodel)) proves scale; reward-attributable retention unisolated | Specific next mission after each acceptance ("3 venues left in Shoreditch"); refresh quests for stale splats — pairs with the rescan loop |
| 3 | **Scarcity/demand-linked rewards** | Hivemapper rules explicitly pay more for coverage, freshness, low-saturation areas ([reward docs](https://docs.hivemapper.com/honey-token/earning-honey/reward-types)) | Nimiq bounties attached to *accepted* coverage gaps and justified refreshes — not every upload |
| 4 | **First-to-map territorial claims** | Local Guides pays more for first-to-add ([Google blog](https://blog.google/products-and-platforms/products/earth/more-levels-and-more-way-contribute-local-guides-l)); Fog of World = entire product on explore-to-uncover ([site](https://fogofworld.com/en/)); Mapillary "Complete the Map" scores *unique* miles only ([OSM US](https://openstreetmap.us/news/2025/09/complete-the-map)) | First-capture stamps + historical credit — **but pair with time-bounded stewardship** (Swarm mayorship model: rolling 30-day status — [Foursquare support](https://support.foursquare.com/hc/en-us/articles/21163361393948)) so novelty doesn't dominate over maintenance |
| 5 | **Points/levels/badges** | Local Guides mechanics documented; **no published retention uplift** — pattern, not benchmark | Keep Pioneer→Network Architect as identity layer; make progress reflect *accepted* work |
| 6 | **Leaderboards** | Zooniverse: top 10% do ~79% of work (power law); Mapillary ran global/country/city boards | Keep per-city boards; add **this-week** recency boards so newcomers can place |
| ⚠️ | Trivial rewards for scans | Pokémon GO AR tasks (~10 Pokéballs) → mass deletion + "stop scanning" PSAs ([Silph Road](https://www.reddit.com/r/TheSilphRoad/comments/jexad3/new_info_ar_mapping_task)) | Anti-pattern: insult-level rewards for a 60s+ effort task breed resentment, not volume |
| ⚠️ | One-off events | OSM mapping parties: 31% repeat attendance made 55% of content; **near-zero newcomer retention** ([ICWSM study](https://ojs.aaai.org/index.php/ICWSM/article/download/14416/14265/17934)) | Capture walks only work if each attendee leaves with a specific next task + recognition |
| ⚠️ | Flat point curves | StreetComplete users report diminishing-returns demotivation ([GH discussion](https://github.com/streetcomplete/StreetComplete/discussions/6535)) | Milestone-shaped progression, not linear |

Design synthesis from the Parallel report: the three tensions to balance are **incentive-attached-to-habit vs incentive-creating-habit** (we're the latter — harder), **exploration vs maintenance** (first-scan credit + bounded stewardship), and **owner control vs trusted provenance** (§6).

---

## 6. Viewer/embed + venue-side loop

### Viewer benchmark

| Viewer | Embed/navigation | Annotations & tours | Loading | Fit |
|---|---|---|---|---|
| **SuperSplat** (`@playcanvas/supersplat-viewer`) | Self-contained static viewer, URL/JSON config ([embedding docs](https://developer.playcanvas.com/user-manual/supersplat/viewer/embedding)) | **Native 3D-positioned annotations**: title/HTML body + camera-pose transitions; ordered annotations = guided tour ([annotations docs](https://developer.playcanvas.com/user-manual/supersplat/studio/annotations/)) | Poster param; SOG + Streamed SOG; hosted publishing auto-generates LODs ≥1M Gaussians | **First turnkey candidate** — the annotation/tour system already exists; we don't have to build it |
| **Spark** (World Labs, MIT) | THREE.js/WebGL2 renderer | No built-in authoring — we'd build venue UI around it | **RAD**: LOD trees, arbitrary chunks via HTTP Range requests ([Spark 2.0](https://www.worldlabs.ai/blog/spark-2.0)) | When a custom interaction layer is central; more work |
| **Luma Interactive Scenes** | Advertised embeddable scenes | No dependable authoring contract found; Flythroughs app sunset Jan 2026 ([radiancefields](https://radiancefields.com/luma-ai-to-sunset-flythroughs-on-january-1-2026)) | Vendor streaming claims | Weak infra dependency — historical reference only |
| **Polycam embed** | Copyable embed; rotate/pan/zoom ([docs](https://learn.poly.cam/hc/en-us/articles/28802104162196-How-to-Embed-Your-Polycam-Captures)) | **Virtual Walkthrough**: capture route + frame markers + playback — the best model for "constrained indoor navigation" ([docs](https://learn.poly.cam/hc/en-us/articles/41099758981524-How-to-Use-Virtual-Walkthrough)) | Uses original images, not free-flight | **UX reference**: preserve camera poses → replayable capture-path tour |
| **Matterport Showcase** | Scan-to-scan nav, dollhouse, floorplan, measurement | Mattertags, guided tours, Highlight Reel ([editing overview](https://support.matterport.com/s/article/Overview-of-Matterport-s-Editing-Features)) | Hosted twin product | The owner/visitor *workflow* reference, not a drop-in renderer |

**Recommended**: poster-first embed → SuperSplat viewer behind an "Explore inside" affordance; curated entrance pose + reset; a short ordered tour of *decision-relevant* stops (window seats → quiet corner → meeting area — keyed to `lib/cafe-metadata.ts` vocabulary so a 3D tag and a metadata chip are the same fact). WebGL2 baseline. Instrument *poster impression → explore click → interactive frame → venue action*, not dwell time. Keep camera poses in the manifest — they enable Polycam-Walkthrough-style constrained replay *and* annotation consistency.

### Venue-side claim → enrich → share

Evidence: Lindner Hotels reports **+25% clicks** connecting Matterport tours to Google Business ([vendor case](https://matterport.com/industries/case-studies/lindner-hotels-improves-customer-engagement-and-event-planning-matterport)) — the tour belongs *inside* a discovery→enquiry journey. But **~56% of retailers never claimed their Google Business Profile** ([MediaCaptain stats](https://www.themediacaptain.com/25-google-business-profile-stats)) and a Yelp study found claiming correlated with a **10.3% rating decrease** (owner presence raises scrutiny — [ISR paper](https://pubsonline.informs.org/doi/10.1287/isre.2024.1305)). So: organic claim rates will be low; the workspace must be useful the moment it's found.

**Separate four concepts in the data model** (the marketplaces all do): business verification, contributor attribution, media rights, publication approval. Proposed owner loop:

1. Invite after publish ("Claim this space"), verified separately from accountless contributor identity.
2. Manage: correct facts, suggest entrance pose, request blur/removal, flag obsolete areas → **owner-flagged layout change mints a rescan bounty** — the venue-side refresh loop.
3. Enrich: owner-authored hotspots (seating zones, booking links) — *timestamped and labeled as owner statements vs observed facts*.
4. Distribute: stable tour URL, embed code, QR poster ("scan our space in 3D"), short rendered social clip.
5. Report: explore starts, loads, annotation interactions, outbound actions — with source attribution.
6. Patron remedy inside the viewer: "report my face" blur-request (Street View pattern — [Google blur docs](https://support.google.com/maps/answer/15439776)) — not buried in a policy page.

---

## 7. Upload & pipeline deltas — what changes vs the gsplat+COLMAP+SPZ plan

| Plan assumption | Delta |
|---|---|
| 300–800MB upload | In-app MediaRecorder at 6–8Mbps → ~45–60MB. Camera-roll upload = fallback only, via resumable protocol. |
| Upload is a post-capture phase | Upload *during* capture (chunks or keyframes) or accept foreground upload screen + wake lock. iOS has no background upload — and **resumable ≠ durable**: Uppy Golden Retriever persists files ≤10MiB to IndexedDB; its SW storage is temporary and doesn't survive crashes ([Uppy docs](https://uppy.io/docs/golden-retriever)). Two questions: *which bytes reached the server* (resumable protocol) and *where are the source bytes after the tab dies* (upload-during-capture or reselect-file flow). |
| Video file is the unit | **Keyframe path is viable**: COLMAP needs images, not containers; propose 120–300 adaptive JPEG frames (2–5fps) selected for sharpness/novelty + a frame manifest (timestamps, indices, orientation, camera metadata) — [AWS splat pipeline](https://docs.aws.amazon.com/deadline-cloud/latest/developerguide/tutorial-gsplat-pipeline.html), [Nerfstudio custom data](https://docs.nerf.studio/quickstart/custom_dataset.html). Extract during capture; video stays as fallback until registration succeeds. |
| One-pass training | **Two-stage confidence**: bounded pose-registration validation before expensive training (AWS flags registration as the common failure point), then coarse preview splat → final. Truthful states: *Checking capture → Uploading → Aligning → Building preview → Refining → Ready for review → Published*. |
| SPZ is the publish format | SPZ is now **v4** (ZSTD, per-attribute streams, no spatial LOD — [spz repo](https://github.com/nianticlabs/spz)). Keep it for interchange; **serve Streamed SOG** (`lod-meta.json`, coarse→fine — [PlayCanvas docs](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/streamed-sog)) or **Spark RAD** (Range-request chunked LOD) for the web viewer. SplatTransform (MIT) converts between them — delivery format is replaceable, not a system decision. |
| Terminal scan states | Add supersede/gap-fill semantics (Scaniverse Sites pattern): coverage map per venue, "retake this segment" contributor loop, owner-flagged-layout → rescan bounty. |
| MIT viewer choice | Prefer **SuperSplat viewer** (annotations + camera-pose tours built in) for v1; **Spark** (MIT, WebGL2, RAD streaming) if we need a custom interaction layer. **`KHR_gaussian_splatting` is ratified** — glTF-track interop now exists. |
| Capture contract = video bytes | **Log IMU alongside video**: VIGS-SLAM-class visual-inertial splatting needs RGB+IMU ([project](https://vigs-slam.github.io/)). A web app can timestamp DeviceMotion samples to frame indices — free sensor data now unlocks pose-assisted reconstruction later (a product/privacy decision, not just an algorithm one). |
| Self-host is the only path | Now a **bake-off**, not a given: Splat3D/MakeSplat/vid2scene shipped commercial video→splat APIs (§1). Self-host stays default (cost, privacy control — MakeSplat deletes sources after 7 days; vendor data-handling must clear our consent bar), but evaluate on a shared permissioned test set. |
| Fast-preview via InstantSplat | **License-blocked** (DUSt3R init is NC). Preview candidates: reduced-image COLMAP+gsplat run, NoPoSplat (MIT repo label — verify weights/deps), or vendor API. |

**No change:** gsplat (Apache-2.0) + COLMAP + deface-blur-first + compressed distribution remains the spine. All deltas are additive.

---

## 8. Proposed "capture run v2" — mapped to findings

Five phases; the BRIEF→ATTEST→ARM consent spine stays, the design language stays.

1. **BRIEF** (+2 items): checklist adds "keep the tab open — we hold the screen awake" and "our detector warns if a face enters frame"; the venue's flagged no-film zones render as map chips, not prose. Show the *walking* route (entrance → seating → counter → return) — explicitly correcting the stationary-pan failure mode.
2. **ATTEST** (unchanged attestations) — persisted to a minted **run record** so they bind to the actual media.
3. **ARM** (notice ticket) → now also creates the run session: resumable upload endpoint (tus or presigned multipart), run id, expiry.
4. **RUN — live capture coach** (the core elevation):
   - Camera preview + **12-sector progress ring** (yaw + novelty) labeled *"views recorded"* — not coverage %.
   - Live chips: sharpness meter, pace meter ("slow down" on fast turns), duration ring (45–75s target), **face-in-frame banner** (BlazeFace) — "reframe or stop".
   - Chunks/keyframes stream to the endpoint during filming; wake lock held; leave-attempt → "recording will be lost" guard.
   - Stop → **capture score card**: sectors visited, % sharp frames, face events, motion warnings → green "submit" or "retake segment" (with which interval failed). Face events → consent re-confirmation.
5. **COOKING → PUBLISHED**: truthful pipeline states above; coarse preview splat (~minutes) auto-plays a flythrough = the pay-off moment; final SOG asset + notification. Contributor gets named tour credit + next-mission suggestion + bounty progress. QC fail → "rescan this segment" loop, not `rejected`.

Pay-off moments reuse existing motion tokens: `celebration-stamp` on preview-landed, `TickNumber` for the score card, `GrowBar` for progress.

---

## 9. What to prototype first

Ordered by information-per-effort:

1. **In-app MediaRecorder at fixed bitrate + resumable upload** — proves 800MB→60MB collapse and upload-during-capture on real iOS Safari + Android Chrome. Everything else assumes this.
2. **Live instrument panel** (Laplacian sharpness + DeviceMotion pace + BlazeFace) — proves the coach is feasible without AR and that consent can be continuous.
3. **Sector-ring coverage approximation** — the hardest web-UX claim to validate: does "views recorded" guidance actually improve captures? A/B it on paper prototypes over the camera feed first.
4. **Bounded registration validation + coarse preview** — measures whether "~minutes draft splat" is real on café interiors (textureless walls are the known hard case).
5. **SuperSplat viewer + metadata-keyed annotation tour** — viewer wow + the anchor for the venue-enrich loop.

Deferred: in-browser WebGPU training (watch item — revisit at Phase 3), WebXR assistance (Android-only, iOS gap), native sensor-stack capture (VIGS-SLAM path — decision only if a native recorder ever ships), vendor API bake-off (until pilot data exists to evaluate against).

---

*Appendix: tool runs executed 2026-11-09 — Parallel Task-API `ultra` runs `trun_2505259133864e459d15e148b2b59a42` (capture UX/technical) and `trun_2505259133864e45854b39225a731c5d` (gamification/viewer/venue/deltas); ~20 Tavily searches; doc fetches cited inline.*
