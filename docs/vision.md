# Lattency Vision: Multi-city network → Nimiq Mini App

> A metro map of the best places to get coffee and get online.
> Live in London, Nairobi, and San Francisco.

---

## Why we’re doing this

The original Lattency was built for Nairobi. It was a strong hackathon project. The most valuable thing we could do next was **prove the engine is city-agnostic** by putting three real boards on it — London, Nairobi, and San Francisco — and letting anyone switch between them as first-class network nodes, not fallbacks.

For the Nimiq Mini Apps Competition, that means: a live, multi-city map of laptop-friendly venues, rewarding contributors with NIM, with the model proven across three very different cities.

---

## Product definition

Lattency is a **crypto-incentivized ground-truth network for workspace quality** — and a **physical-world oracle for the agentic era**.

It answers one question: *"Where can I sit down with a coffee and actually work?"*

The answer combines:
- **Verified wifi speed + stability** (download, upload, ping, jitter, loss)
- **Objective workspace metadata** (power, seating, noise, table space, price)
- **NIM bounties** that reward contributors for verifying new or under-mapped venues

In the agentic era, Lattency's dataset becomes even more valuable. AI agents cannot walk into a café and run a speed test. They need a trusted, verified, real-time source of physical-world infrastructure data to make decisions for their human users. Lattency is that source.

We are not building an "AI agent." We are building the **ground-truth layer that agents consume**.

---

## Scope: cafés only is wrong; everything-with-coffee is right

We started with cafés, but the better category is **"anywhere you can get coffee and work"**.

| Venue type | Why it belongs | Example |
|---|---|---|
| Café | Core use case | Ozone Coffee Roasters |
| Coworking | Dedicated workspace | WeWork Old Street |
| Hotel lobby | Quiet, power, wifi | The Hoxton |
| Library | Free, quiet | Idea Store Whitechapel |
| Hybrid | Café + coworking | Uncommon Ground |

The brand stays **Lattency**. The word "café" stays in the story, but the map is of **work stations**.

---

## Metadata: objective, not subjective

We do **not** collect subjective coffee-quality ratings. They are unverifiable, noisy, and gameable.

We do collect:

| Field | Type | Why it matters |
|---|---|---|
| `priceTier` | budget / mid / premium | Helps users match venue to budget |
| `milkOptions` | array | Dietary preference, easy to verify |
| `powerOutlets` | boolean | Critical for laptop work |
| `seating` | bar / tables / lounge / mixed | Ergonomics / expected stay length |
| `noiseLevel` | quiet / moderate / loud | Calls / focus work |
| `tableSpace` | small / standard / large | Can you spread out? |
| `wifiNetwork` | string | Reduces friction |

These are all observable. A new contributor can walk in and fill the form in 60 seconds.

---

## Market: why three cities

Three very different cities prove the engine from day one:

1. **London** — high density of remote workers, cafés + coworking, walkable, builder is there.
2. **Nairobi** — fast-growing remote-work scene, mobile-first, the original board.
3. **San Francisco** — mature tech hub, the stress-test for a third geography.

Adding a fourth city is one entry in the `CITIES` registry — no new code, no new routes. The engine is genuinely city-agnostic.

---

## Nimiq integration: the core loop

The Mini App runs inside Nimiq Pay. The transaction layer is the product, not a bolt-on.

1. **Sponsor funds a bounty in NIM.**
   - Example: *"5 verified tests at quiet coworking spaces in London"*/
2. **Contributor opens the Mini App.**
3. **Contributor finds a venue matching the bounty, runs the in-browser speed test.**
4. **On a verified, non-outlier reading, the bounty pays NIM to the contributor’s Nimiq Pay wallet.**

This is a real transaction inside a real wallet, using real NIM. That is the integration.

---

## Distribution

Distribution is engineered into the product:

- **Contributors** earn NIM and share their per-venue pages.
- **Venues** display tier badges (QR table tents, window stickers) to attract remote workers.
- **Sponsors** promote bounties because they want the data.
- **Nimiq ecosystem** promotes real Mini Apps that generate real transactions.

---

## Success criteria for the competition

| Category | Goal |
|---|---|
| **Design & UX** | Clean, mobile-first, obvious to a new user |
| **Functionality** | Speed test works; NIM bounties pay out |
| **Usefulness** | 30+ venues across 3 cities with verified readings |
| **Marketing** | 50+ unique Nimiq wallets interact with the Mini App |
| **Bonus** | NIM is the default reward token |

---

## Roadmap

### Week 1: Foundation
- Update data model for venue types and workspace metadata ✅
- Seed London, Nairobi, and SF with real venues ✅
- Migrate backend to Base44 (entities + functions + agents + automations) ✅
- Integrate `@nimiq/mini-app-sdk` ✅
- NIM payout flow for completed bounties ✅

### Week 2: Multi-city + UX
- Multi-city dynamic routing (`app/[city]/page.tsx`, SSG) ✅
- Split-flap city switcher, optimistic pins, personal trail ✅
- URL-as-state deep links, first-visit coach ✅
- Self-running product reel on /tour ✅
- NIM payout on verified speed test ✅

### Week 3: Users
- Recruit contributors across all three cities
- Run real speed tests
- Drive Nimiq wallet interactions

### Week 4: Polish + submit
- Demo video
- Submission package (see `docs/base44-submission.md`)
- Community engagement

---

## Agentic strategy

### We are not building an agent
We are building the **ground-truth data layer that agents consume**.

### Why this matters
- AI assistants cannot physically visit cafés.
- They need verified, real-time workspace data to plan human workdays.
- Lattency's dataset is a physical-world oracle.

### What we ship now
- AI concierge agent (Base44 `workspace_concierge`) — reads the whole dataset, answers "where should I work?"
- `generate-venue-summary` — LLM-written editorial one-liners, cached per venue
- City-aware bounty system with automated progress tracking and expiry

### What comes later
- Agent-to-agent bounty negotiation
- LLM plugins for calendar / travel / productivity assistants
- Real-time workspace availability via human contributors

---

## One-liner for the submission form

> Lattency is a metro map of laptop-friendly coffee spots, live in London, Nairobi, and San Francisco. Contributors run verified speed tests and earn NIM from sponsor-funded bounties. It's the first crypto-incentivized ground-truth network for workspace quality, and a physical-world oracle for the agentic era.
