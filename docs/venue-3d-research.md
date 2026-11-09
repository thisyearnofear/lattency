# Diligence Report: Crowd-Sourced 3D Capture of Cafés & Coworking Venues for Lattency

*Research-only findings. Not legal advice — items flagged NEEDS-LAWYER require counsel sign-off before any launch.*
*Compiled 2026-11-09. Findings marked **CONFIRMED** (primary/authoritative source), **CONTESTED** (uncertain or split authority), or **UNRESOLVED** (insufficient evidence / needs counsel).*

---

## 1. Executive summary — verdict per assumption

**Verdict: technically feasible today at ~$0.50–3 per scene, but only lawful as a *consent-first* product.** The model "any user walks in and splats any café" fails on patron privacy in EU/UK/DE/FR/KE/IL and creates venue-relations landmines; the model "contributor requests venue opt-in, captures off-peak, pipeline blurs every face before reconstruction, venue can claim and veto" is defensible in every jurisdiction examined.

| Assumption | Verdict |
|---|---|
| Scanning an interior without venue consent is lawful | **CONTESTED.** No statute bans it in US/UK, but venue's licence-to-enter can prohibit capture (contract/trespass), and Germany/France personality + property-image doctrines add risk. Consent is cheap insurance and the industry norm. |
| Faces in splats are just "photos" | **FAILS.** Identifiable faces are personal data under GDPR/UK GDPR/Kenya DPA; a splat encoding face geometry is biometric-adjacent under Illinois BIPA (private right of action, $1k–5k/violation). Face-blur before reconstruction is a hard requirement, not a nice-to-have. |
| Venue can force takedown of a 3D model | **CONTESTED.** No general property right in one's interior image (US/UK; France expressly rejected property image rights absent "abnormal disturbance"), but takedown is the industry norm (Street View opt-out) — offer it regardless. |
| Off-the-shelf hosted API can process contributor uploads | **WEAK.** Luma's capture API is officially "no longer actively supported"; Polycam *does* have a Reconstruction API but it's Enterprise-gated, prepaid credits, ~25 jobs/day default — a procurement negotiation, not a commodity API; Scaniverse cloud routes into Niantic's map. Self-hosting `gsplat` (Apache-2.0) + COLMAP is the dependable path. |
| Open-source stack permits commercial use | **MIXED — the trap.** Viewers are MIT (Spark, SuperSplat, GaussianSplats3D, SPZ). Trainers are not: Inria's reference 3DGS and NVIDIA instant-ngp are **non-commercial research licenses**; OpenDroneMap is **AGPL-3.0**. Use `gsplat` (Apache-2.0) or license Inria. |
| Crowdsourced 3D venue maps are unproven | **DISPROVEN as novel.** Niantic's *Into the Scaniverse* already runs a crowdsourced global splat map (50k+ splats, Quest/WebXR). Differentiation must be interior Wi-Fi/venue context, not "splat map" itself. |

---

## 2. Legal findings by jurisdiction

### 2.1 Is scanning a private interior without consent lawful?

**United States / UK — CONFIRMED (with caveats).** No statute prohibits photographing or scanning a privately owned commercial interior while lawfully present. However, entry is a *licence*: a venue that prohibits photography can revoke permission, making continued capture trespass, and can assert breach of (posted/contractual) house rules. Publication afterwards is broadly lawful — there is no US/UK property right in images of one's premises ([Photography and the law — Wikipedia survey](https://en.wikipedia.org/wiki/Photography_and_the_law); for interiors vs. the architectural-works public-place exception see [Justia: photos of buildings/architecture](https://www.justia.com/intellectual-property/copyright/photos-of-buildings-and-architecture)). Trade dress protects distinctive décor against *confusing commercial use*, not depiction in a review/map context ([Two Pesos v. Taco Cabana, 505 U.S. 763 (1992)](https://supreme.justia.com/cases/federal/us/505/763/)) — **NEEDS-LAWYER** for edge cases (franchise décor replication claims).

**France — CONFIRMED.** Property owners hold *no exclusive right over the image of their property*; claims require an "abnormal disturbance" (Cour de cassation, 1re civ., *Hôtel de Girancourt*, 4 May 2004). But that does not authorize entry against admission conditions, and *personal* image rights (Code civil art. 9) are strong — bystander faces are the real exposure. The French panorama exception (CPI L.122-5) covers specified public-way works, natural-person creators, and noncommercial use — it is not an interior-capture clearance.

**Germany — CONFIRMED, highest-risk EU market.** *Hausrecht* lets the venue set conditions, and German courts enforce them: in the *Sanssouci* litigation (BGH V ZR 45/10) the Federal Court of Justice sided with a palace foundation over commercially exploited photographs taken **on its controlled premises** — i.e., images captured inside a venue that restricts photography can be actionable even where the same subject shot from a public way would not be. *Museumsfotos* (BGH I ZR 104/17, Reiss-Engelhorn-Museum v. Wikimedia) confirmed venue photography rules bind publication of interior images. §22 KUG makes publishing a person's likeness without consent tortious unless a §23 exception applies (persons "as accessory to a locality") — café patrons as "accessory" is **CONTESTED**, so blur regardless. UrhG §59's panorama privilege covers only exteriors seen from public ways, streets, or squares — **no interior clearance**. The 2010 Street View fight showed exterior capture was *legal* (BGH 2010) yet politically costly: ~244,000 household opt-outs ([BBC News](https://www.bbc.com/news/technology/11595495); [Wikipedia: Street View privacy concerns](https://en.wikipedia.org/wiki/Google_Street_View_privacy_concerns)).

**US/UK architectural exceptions do not cover interiors — CONFIRMED.** 17 U.S.C. §120(a) permits pictorial representations of a constructed architectural work only where the building is "located in, or ordinarily visible from, a public place"; UK CDPA s.62 likewise covers works *permanently situated in a public place or premises open to the public* for specified works — neither is a private-interior reconstruction licence, and whether a navigable splat is even a qualifying "representation" under s.62 is **CONTESTED**. Interior artworks (murals, sculpture, bespoke design elements) are separately protected — CDPA s.17 counts 2D→3D copying; the venue operator may not even own those copyrights.

### 2.2 Patron/bystander privacy — the hard requirement

- **GDPR / UK GDPR — CONFIRMED.** Identifiable faces in images/video are "personal data" (Art. 4(1), [GDPR text](https://gdpr-info.eu/art-4-gdpr/)). The household/personal exemption (Art. 2(2)(c)) does **not** cover publishing to an unlimited audience (CJEU *Lindqvist*, C-101/01; *Ryneš*, C-212/13 on CCTV). EDPB [Guidelines 3/2019 on video devices](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32019-processing-personal-data-through-video_en) treat systematic capture as processing needing an Art. 6 basis — legitimate interest is arguable for a map feature, but anonymisation (irreversible blur) is the recommended mitigation and is what regulators accepted for Street View.
- **Illinois BIPA — CONFIRMED as risk.** "Scan of face geometry" is a biometric identifier ([740 ILCS 14](https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004&ChapterID=57)); photographs are excluded, but *derived* face geometry is covered, and litigants are actively testing the photograph-exception boundary ([The Firewall analysis](https://www.thefirewall-blog.com/2019/12/technology-defendants-continue-to-test-whether-the-illinois-bipa-law-can-cope-with-modern-facial-recognition-technology/); [Lysinski BIPA rules](https://lysinski.com/practices/ai-law/facial-recognition-law-illinois)). A splat literally encodes facial *geometry* — squarely in the grey zone with a private right of action and statutory damages. **Blur before reconstruction is non-negotiable.**
- **California CCPA/CPRA — CONFIRMED.** Biometric information is "personal information"; a consumer-facing publisher must disclose collection and honor deletion. Less severe than BIPA (private action mainly for data breaches) but reinforces the anonymise-first design.
- **Kenya DPA 2019 — CONFIRMED, stricter than it looks.** Images of identifiable people are personal data, and **s.37 expressly prohibits commercial use of personal data** unless express-consent or written-law conditions are met — an EU-style "legitimate interests" analysis does **not** import cleanly. In *Wigot Gardens* the ODPC ordered **KES 250,000 compensation** where a venue marketed with an individual's image and couldn't produce the signed consent — precedent that undocumented assurances fail ([EY report](https://taxnews.ey.com/news/2025-2192-kenya-data-protection-commissioner-reiterates-employers-must-secure-employees-explicit-consent-to-use-their-images-commercially); [Njogu & Associates](https://njoguassociates.com/lights-camera-consent-data-protection-and-the-commercial-use-of-your-image-in-kenya); [ODPC Handbook](https://www.odpc.go.ke/wp-content/uploads/2024/02/PERSONAL-DATA-PROTECTION-HANDBOOK.pdf)). DPA applies extraterritorially to processing of data subjects located in Kenya; overseas transfers need separate safeguards. Secondary sources cite fines up to ~KES 5M / % of turnover — **verify penalty schedule with counsel (UNRESOLVED).**

### 2.3 Venue takedown rights

**CONTESTED → default to yes.** No jurisdiction examined grants a venue an automatic statutory right to remove a truthful 3D model of its interior. But: (a) Street View's opt-out blur regime is the industry standard and regulators expect *some* remedy; (b) a venue that can show capture breached posted rules has claims against the *contributor* (contract/trespass) that often reach the platform practically; (c) France's "abnormal disturbance" and Germany's *Hausrecht* give soft hooks. **Product rule: verified-venue-owner takedown/claim flow from day one** — cheap, and converts objectors into owners.

### 2.4 Contributor vs platform liability — **CONTESTED**

Critical analytical split surfaced by the deep research: **the input video and the generated model must be assessed separately.** A platform *hosts* the contributor's upload but *actively produces* the splat — intermediary protection for the former does not automatically extend to the latter, especially where the platform's capture instructions shape the content (*Roommates.com* "developer" carve-out is the relevant US doctrine).

- **US:** CDA §230 covers most publisher-type liability for third-party content, but expressly excludes "intellectual property" claims; circuits split on whether that exception reaches state-law IP/right-of-publicity claims (9th Cir. *Doe v. Friendfinder*: §230(e)(2) = federal IP only → state publicity claims still barred; other circuits less clear). DMCA §512 provides a separate conditional copyright safe harbor — register an agent. **NEEDS-LAWYER:** whether platform-generated models qualify for either.
- **EU:** DSA Arts. 6/16 hosting protection + notice obligations apply if you act on notice expeditiously — build the notice-and-action loop into the model viewer.
- **UK:** e-Commerce Reg. 19 conditional hosting protection — same knowledge/expeditious-action analysis.
- **Kenya:** DPA duties apply directly to controllers/processors — no US-style intermediary immunity.
- **Terms benchmarking (CONFIRMED):** Google Maps/Local Guides put responsibility on the contributor ("respect privacy… avoid identifiable images") while Google runs automated blurring and reserves removal rights ([policy](https://support.google.com/contributionpolicy/answer/7422880?hl=en)); Matterport Capture Services On-Demand requires the ordering customer to warrant access authorization — the commissioned-capture model documents the permission checkpoint that open crowdsourcing lacks. **Emulate the checkpoint.**

### 2.5 Who owns the splat? — **CONTESTED / NEEDS-LAWYER**

No universal rule establishes that "the uploader owns the splat," that the platform does, or that both are joint authors. Layer-by-layer:

| Layer | Assessment |
|---|---|
| Contributor video | **CONTESTED** — creative choices may support copyright; may belong to an employer/commissioner, not the uploader |
| Automated faithful reconstruction | **CONTESTED** — mechanical measurement may supply no protectable authorship (US *Thaler v. Perlmutter* reaffirms the human-authorship requirement; Bridgeman v. Corel analog for faithful copies); UK CDPA s.9(3)/s.178 computer-generated-works rule assigns to whoever made "necessary arrangements" — contested whether that's contributor or platform |
| Human-edited model | **CONTESTED** — editing choices can be protectable without covering underlying facts/third-party works |
| Corpus of venue models | **CONTESTED** — EU/UK sui generis database right requires *qualifying investment in obtaining/verifying/presenting* data; generating the data itself doesn't count (*Football Dataco*, *British Horseracing Board* lines) — a reconstruction pipeline alone may not create database right |
| Scene's own architecture/artworks | **CONFIRMED separate** — contributor licence cannot clear rights the venue or artist holds |

**Safe position via TOS:** contributor affirms lawful access + permission + ownership/rights in footage; grants a licence expressly covering upload, frame extraction, reconstruction into splats/meshes/NeRFs, modification/redaction, hosting, streaming, public display, sublicensing to processors — plus deletion/takedown mechanics. A perpetual copyright licence does **not** make personal-data processing lawful indefinitely — keep the two grants separate.

---

## 3. Technical options matrix

### 3.1 Reconstruction approaches

| Approach | Quality (interior) | Input | Compute/scene | Maturity | License/commercial path |
|---|---|---|---|---|---|
| **3D Gaussian Splatting** | Best-in-class photorealism, real-time render ≥30fps@1080p on consumer HW ([Kerbl et al. 2023, DOI 10.1145/3592433](https://doi.org/10.1145/3592433)) | 1–3 min video or 30–200 stills + COLMAP poses | ~10–60 min GPU (train) — see survey [ACM Comput. Surv., DOI 10.1145/3807511](https://doi.org/10.1145/3807511) | Mainstream 2025–26 | Trainer: `gsplat` **Apache-2.0** ✅ vs Inria reference impl. **non-commercial** ❌ |
| **NeRF** | Equal quality, but classical NeRF is hours-to-train / slow-render ([Mildenhall et al., ECCV 2020, DOI 10.1007/978-3-030-58452-8_24](https://doi.org/10.1007/978-3-030-58452-8_24)); Instant-NGP fixes speed ([Müller et al., DOI 10.1145/3528223.3530127](https://doi.org/10.1145/3528223.3530127)) | Same | Instant-NGP: seconds–minutes | Superseded by GS for web viewing | instant-ngp code = **NVIDIA Source License, non-commercial** ❌ ([LICENSE.txt](https://raw.githubusercontent.com/NVlabs/instant-ngp/master/LICENSE.txt)) |
| **Classical photogrammetry (COLMAP/ODM, Metashape, RealityScan)** | Metric meshes; worse "walk-through" feel than splats | 50–500 stills; prefers stills over video | Hours on CPU/GPU | 10+ yrs mature | COLMAP BSD ✅; ODM/WebODM **AGPL-3.0** ⚠️ network-copyleft; Metashape paid; RealityScan **free < $1M revenue** |

### 3.2 Hosted / commercial services

| Service | Fit for crowd pipeline? | Pricing (official where available) | Notes |
|---|---|---|---|
| **Luma AI** | ❌ unsupported | Official capture SDK states the capture API is **"no longer actively supported"** ([lumaapi-python](https://github.com/lumalabs/lumaapi-python)); pricing page is generative-video credits ([lumalabs.ai/api](https://lumalabs.ai/api), [radiancefields](https://radiancefields.com/platforms/luma-ai)) | Cautionary tale: hosted capture APIs get deprioritised — own the pipeline |
| **Polycam — Content API** | ⚠️ export-only | Basic $150/yr or $30/mo; Business $400/yr/user; Enterprise $1,200/yr/user, 3-seat min ([poly.cam/pricing](https://poly.cam/pricing)) | [Content API](https://poly.cam/docs/api) manages/exports your *own* captures — supports "venue scans in Polycam, we import" but not our upload flow |
| **Polycam — Reconstruction API** | ⚠️ viable but gated | Enterprise-approved only, prepaid API credits; defaults **25 jobs/rolling 24h, 2 concurrent, failed jobs count** ([docs](https://poly.cam/docs/api/reconstruction)) | Accepts `session.zip`, async. Real white-label path **after** contract negotiation on throughput + redistribution rights |
| **Scaniverse (Niantic Spatial)** | ⚠️ | Official tiers: Free 20k credits/mo (5 seats, mobile capture, SPZ/PLY/FBX export); Plus $20/mo or $200/yr (40k, adds 360° splats); Pro $50/mo or $500/yr (105k, **commercial rights**); Enterprise custom w/ API ([nianticspatial.com/pricing](https://www.nianticspatial.com/pricing)) | 20k credits ≈ ~10 min mobile-scan activation ([FAQ](https://www.nianticspatial.com/faq/scaniverse-personal)). On-device personal processing is free but **non-commercial**; map policy = public places only |
| **KIRI Engine** | ⚠️ | REST API for task creation/retrieval exists ([docs.kiriengine.app](https://docs.kiriengine.app/)); tariffs **UNVERIFIED** | Parallel evaluation candidate, not a committed backend |
| **RealityScan (Epic)** | ⚠️ desktop-class | Free <$1M annual revenue ([realityscan.com](https://www.realityscan.com/news/realityscan-20-new-release-brings-powerful-new-features-to-a-rebranded-realitycapture)); hosted-processing terms unverified | Photogrammetry meshes, not splats; heavy UX |
| **3DVista** | ⚠️ presentation layer | One-time licence, unlimited tours, self-host or vendor hosting — **tours die for the day when daily bandwidth allowance exhausts** ([3dvista.com/en/products/hosting](https://www.3dvista.com/en/products/hosting)) | Tour authoring ≠ splat backend; availability risk under viral load |
| **Matterport** | ❌ closed ecosystem | See §5 — no open ingestion of third-party splats confirmed | Merchant-funded capture precedent only |
| **Self-host gsplat + COLMAP** | ✅ recommended | GPU spot ~$0.40–1.50/hr → **~$0.50–3 per scene** all-in (train 10–60 min) | Full control, clean licenses, scales linearly; the dependable path |

### 3.3 Formats, sizes, streaming

- **PLY:** ~236 bytes/Gaussian uncompressed → 1M splats ≈ **236 MB**; 4M ≈ ~1 GB ([Scaniverse's own figures](https://dev.scaniverse.com/news/spz-gaussian-splat-open-source-file-format)). Unusable for direct delivery.
- **SPZ** (Niantic, MIT, [github.com/nianticlabs/spz](https://github.com/nianticlabs/spz)): ~64 bytes/point, ~90% smaller than PLY; small café-scale interiors measured at **~1–3 MB** ([ar-code examples](https://ar-code.com/blog/download-free-gaussian-splat-3d-models-for-ar-and-3d-visualization-spz-fomat)); realistic room-scale target 5–25 MB.
- **SOG** (PlayCanvas, open-sourced): official example **4M Gaussians: 1 GB PLY → 42 MB SOG**; ~2–3× better than compressed PLY ([PlayCanvas blog](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting), [SOG docs](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog)). SuperSplat generates **LOD bundles for ≥1M-Gaussian scenes** — progressive streaming, lowest level first.
- **Mobile runtime budget (CONFIRMED):** SuperSplat documents **1M Gaussians mobile/XR in Performance Mode, 2M off** ([streaming docs](https://developer.playcanvas.com/user-manual/supersplat/streaming/)). Keep masters at full density but publish a constrained derivative — small download ≠ small GPU memory.
- Format comparison: [Swyvl format guide](https://swyvl.io/blog/gaussian-splat-formats-ply-spz-ksplat).
- **Cost model (illustrative, $0.01/GB egress):** 25 MB scene → ~$0.0004/mo storage, $0.25 per 1,000 full views, $2.50 per 10,000. Storage is noise; egress is linear; processing dominates.

### 3.4 Viewers (all confirmed licenses)

| Viewer | License | Notes |
|---|---|---|
| [Spark](https://github.com/sparkjsdev/spark) (World Labs, three.js) | **MIT** | Newest, production-oriented, PLY/SPZ/SOG/KSPLAT |
| [PlayCanvas / SuperSplat](https://github.com/playcanvas/supersplat) | **MIT** | Editing + SOG + WebGPU path; engine MIT |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | **MIT** | Mature three.js viewer (less active) |
| [antimatter15/splat](https://github.com/antimatter15/splat) | **MIT** | OG WebGL viewer |
| three.js (native splat support landing) | MIT | Per [platform survey](https://ar-go.co/blog/gaussian-splatting-platforms) |

### 3.5 Privacy pipeline (open-source, pre-publish)

- [`deface` (ORB-HD, MIT)](https://github.com/ORB-HD/deface) — per-frame face detection + blur on video; run server-side on uploaded footage **before** reconstruction so the splat is born anonymised (avoids trying to edit Gaussians post-hoc).
- YOLOv8-face / RetinaFace + OpenCV equivalents for plates/screens/logos.
- Academic validation that splats leak sensitive content (faces, plates, documents, screens): [PrinGS — Privacy Preservation in Gaussian Splatting (arXiv, DOI 10.48550/arxiv.2610.36168)](https://doi.org/10.48550/arxiv.2610.36168); [Privacy-Preserving 3D Gaussian Splatting, IEEE GEM 2024, DOI 10.1109/GEM61861.2024.10585594](https://doi.org/10.1109/gem61861.2024.10585594); [S²NeRF, ACM CCS 2024, DOI 10.1145/3658644.3690185](https://doi.org/10.1145/3658644.3690185).
- Google's own practice: automated face/plate blur + on-request extra blur — the regulator-accepted template ([Maps UGC policy](https://support.google.com/contributionpolicy/answer/7422880?hl=en)).

---

## 4. Capture workflow that actually works

**Input that yields usable interiors:** a slow **walkthrough/orbit video 60–120 s** (Scaniverse-style) or **30–200 stills** (Polycam photo mode); iPhone Pro **LiDAR** helps low-texture walls but isn't required for splats. Guidance patterns proven by Luma/Scaniverse: keep the subject centred, move at walking speed, capture three height levels (knee/chest/overhead for tables), avoid sudden exposure changes.

**Known failure modes (CONFIRMED across tools):**
- Mirrors, windows, glossy table tops → floaters/artifacts (reflections break multi-view consistency — inherent to NVS, see [3DGS paper](https://doi.org/10.1145/3592433) discussion).
- Moving patrons → ghost splats — **another** reason to capture near-empty (off-peak consent windows) *and* blur.
- Textureless white walls, repetitive tile, mixed lighting.
- Under-sampled coverage → "swiss cheese" splat; needs an in-app coverage heat/preview before submit (Scaniverse does on-device review).

**Recommended pipeline:** contributor video → server-side `deface` blur pass → COLMAP pose extraction → `gsplat` train (spot GPU) → SPZ/SOG package → MIT viewer embed. Human spot-QC on flagged venues.

---

## 5. Monetisation & landscape

- **Matterport (official price list, Oct 2026):** Professional space-ladder — **10 active spaces $108/mo or $1,080/yr ($90/mo eff.)**; 20→$150/mo; 30→$198; 50→$294; 100→$516; 150→$698 ($5,160–7,020/yr); Enterprise custom ([price list](https://support.matterport.com/s/article/Matterport-Price-List?language=en_US); corroborated by [PricingSaaS repricing note](https://pricingsaas.com/companies/matterport/diffs/2026W42)). Recurring $3.90–9/active-space/month — the recurring *hosting* cost a venue-funded model must also beat.
- **Venue-funded capture precedent (CONFIRMED):** Matterport Capture Services On-Demand publishes **$238–325 for 1–3,000 sq ft**, $412–812 for 3–10k, $937–1,750 for 10–30k sq ft, hosting subscription extra ([go.matterport.com/Capture-Service](https://go.matterport.com/Capture-Service)) → a café ≈ **$346–433 first-year cost incl. hosting**. This is the only *directly priced* capture payer model found: the merchant buys a marketing asset. Test venue-funded ("verified interior") before assuming contributors or consumers pay.
- **Consumer capture subscriptions:** Scaniverse Pro $50/mo (commercial rights), Polycam $30/mo — contributors already pay for tools; Lattency's wedge is capture-as-contribution (free, tied to the Wi-Fi-testing mission) + venue-funded verification.
- **Direct competitor (CONFIRMED):** Niantic's crowdsourced splat map — *Into the Scaniverse* ([Voices of VR](https://voicesofvr.com/1525-niantics-into-the-scaniverse-maps-over-50k-gaussian-splats-from-around-the-world-on-quest-and-webxr); [Niantic on crowdsourcing splats](https://nianticlabs.com/news/splats-change-everything)). Focused on outdoor POIs/XR; its map policy accepts **public places only — no private residences or restricted areas** ([personal FAQ](https://www.nianticspatial.com/faq/scaniverse-personal)), which leaves the consent-verified *interior* niche open but shows the capture+map pipeline is a solved problem for a well-funded rival.
- **Booking-adjacent:** Peerspace-style listings use photos/Matterport links as conversion assets; HeadBox markets an "Immersive Tours"/Conversion Suite (payer/pricing unverified). No venue-booking platform confirmed to offer crowd-splats — open lane.

## 6. Counter-evidence

1. **Street View Germany** — capture was *legal* (BGH 2010) yet ~244k opt-outs + political backlash stalled coverage for a decade. Lesson: legality ≠ social license; consent + visible opt-out beats "lawful but creepy". ([BBC](https://www.bbc.com/news/technology-11595495), [Wikipedia](https://en.wikipedia.org/wiki/Google_Street_View_privacy_concerns))
2. **Mapillary** — proved crowd street imagery + server-side face/plate blur works at scale; still ended as an acqui-asset to Meta (2020) rather than a durable business. Lesson: the blur pipeline is table stakes; the business must be the *context* (here: workability/Wi-Fi), not the imagery. ([Wikipedia](https://en.wikipedia.org/wiki/Mapillary))
3. **Hivemapper** — crypto-incentivised dashcam mapping shows contributor-funded capture economics are real but incentive design dominates; they also built automated face/plate anonymisation.
4. **Google Indoor Maps / Business View** — runs on **venue-owner partnership**, not open crowdsourcing; Trusted-photographer programme required photographer to hold venue authorisation. Validates consent-first for interiors specifically.
5. **Luma's capture sunset** — the free hosted reconstruction everyone built demos on is officially "no longer actively supported" per its own SDK ([lumaapi-python](https://github.com/lumalabs/lumaapi-python)); integration artifacts outlive the commercial proposition. Lesson: own the reconstruction pipeline and keep portable exports.
6. **Scaniverse's own map excludes private/restricted places** — even the market-leading crowdsourced splat map restricts contribution scope rather than claiming every space is fair game ([personal FAQ](https://www.nianticspatial.com/faq/scaniverse-personal)). A commercial *interior* product needs a stronger permission model than the incumbent.
7. **Inria/NVIDIA license traps** — the two most-starred trainers are research-only; shipping them commercially is the classic OSS diligence failure.

---

## 7. Recommended pilot design with guardrails

1. **Consent-gated launch:** pilot with 10–20 venues that opt in via the existing bounty/contribution flow ("claim your interior splat" — bounty-funded). Venue signs a one-page digital consent granting capture + publication + revocable-at-will takedown.
2. **Off-peak capture windows:** capture scheduling nudged to near-empty hours; in-app capture coach enforcing the orbit pattern; product rejects bathrooms, back offices, payment screens, and confidential-material areas as capture scope (policy, not just guidance).
3. **Blur-first pipeline (mandatory):** all uploads pass `deface` + screen/logo detector server-side before training — anonymise the *input*, not just the viewer (deep research confirmed viewer-only blur is inadequate: alternate viewpoints, downloads, and model data can still reveal the person). **Strip audio on ingest** (US two-party-consent states + GDPR capture-of-conversations is a separate risk surface). Never retain facial templates or recognition embeddings — scene geometry only. Raw footage retained ≤72 h for re-processing, then deleted.
4. **License-clean stack:** `gsplat` (Apache-2.0) + COLMAP + Spark/SuperSplat viewer (MIT). **Do not** touch Inria gaussian-splatting or instant-ngp code in the commercial path; AGPL ODM only if isolated as a separate service or avoided.
5. **Contributor TOS:** contributor warrants venue permission + no identifiable third parties without consent; grants Lattency a perpetual worldwide licence to the model; indemnity for breach (pattern after Google's UGC policy).
6. **Venue controls:** verified-claim flow → co-owner badge, edit/approve before publish, one-click takedown, and a blur-request tool for patrons ("report my face" — mirror of Street View's remedy).
7. **Jurisdiction phasing:** pilot in UK/Kenya (venue-consented, blurred) is lowest-friction; treat Germany/France/Illinois as "consent + blur mandatory" regardless; geofence feature flags if needed.
8. **Asset strategy:** keep a full-density master per venue, publish a constrained-LOD derivative (≤1–2M Gaussians mobile budget); keep all source rights portable — vendor exits (Luma) are a when, not an if.
9. **Cost guardrail:** budget ~$1–3 GPU + ~$0.01 serving per scene; a 200-venue pilot ≈ **< $1,000 infra total**. The real cost is *acquisition*: consented, accepted, accurate scenes — instrument "accepted scenes", not raw uploads.

## 8. Open questions for counsel

1. Does a splat's encoded facial geometry constitute a "scan of face geometry" under BIPA if any face survives blurring? (Residual-risk analysis for the blur pipeline's false-negative rate.)
2. Venue consent scope: does staff consent suffice vs. owner; what signage satisfies patron notice in DE/FR/KE?
3. TOS enforceability of the contributor warranty + licence across UK/EU/KE consumer-law regimes (consumer contributors may not be able to waive certain protections).
4. Copyright/database-right claim strategy for the model corpus in EU/UK (register as database? licence terms to prevent competitor scraping — cf. ConcealGS watermarking research, [DOI 10.1109/ICASSP49660.2025.10890299](https://doi.org/10.1109/icassp49660.2025.10890299)).
5. §230 coverage of state-law publicity claims if a patron sues over a surviving face (circuit-split exposure by venue location), and whether platform-generated models qualify for §230/§512 protection at all given the platform *produces* the model (*Roommates.com* developer analysis).
6. Trade-dress risk for chain cafés (a faithful splat of a distinctive branded interior — display vs. confusing use).
7. Audio: if any recording includes conversations, which state/country consent regimes apply (two-party consent) — moot if audio is stripped on ingest.
8. Whether a DPIA is triggered (systematic capture + public disclosure of interior imagery at scale) and what Art. 13/14 notice mechanics look like for incidental patrons we can't identify to notify.
9. Germany specifically: whether venue consent language must mirror *Sanssouci*-style house-rule enforcement, and whether KUG §23 "accessory" doctrine has any usable scope for blurred patrons.

---

*Appendix: all tool runs (2 Parallel Task-API deep-research runs, 10+ Tavily searches, 3 science-MCP literature queries, GitHub license API checks) executed 2026-11-09; sources cited inline above.*
