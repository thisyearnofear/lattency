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

## Claims and corroboration

Nothing on the board is trusted on submission. Every field is a **claim**, and every claim carries a corroboration count built by later contributors. That stance has two tiers:

**Tier 1 — observable facts.** The core of the record, collected today:

**Tier 2 — anchored subjective claims.** Not 5-star scales — gameable and meaningless — but structured statements a stranger can confirm or deny: *"quiet enough for calls"*, *"they don't mind laptops after 6pm"*, *"wifi drops during lunch rush"*. Shown as **"corroborated by N"**, never averaged into a score. A lone claim earns nothing and surfaces nothing — reward is deferred to corroboration (see the contribution hypothesis).

Tier 1 fields we collect:

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

The old posture — *no subjective ratings* — was really "no unverifiable claims." Corroboration is the stronger position: subjectivity is earned, not excluded.

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

## The contribution hypothesis

The open question is not whether the map is useful — it is whether contribution is **ambient** enough to reach density. Working hypothesis: *contribution should find the contributor, not the reverse.*

1. **Ambient offers.** With location permission, the app gently offers a speed test wherever the user is — "you're somewhere we don't have a reading for." One tap, no form first. The test *is* the contribution; venue metadata comes after, or from the next person.
2. **Kudos before cash.** A reading that proves useful — first at a venue, corroborates a stale one, closes a bounty — earns visible reputation: rank, line colour on `/me`, leaderboard position. Kudos is the always-on reward; NIM is the occasional spike.
3. **Venue-funded kickbacks.** When venue organisers pay for verified information about their place, a share flows back to the contributors who built that venue's record — early readings earn more than late ones.
4. **Diminishing returns per venue.** Reward weight decays with a venue's verification count. A fifth reading at a mapped café earns less than a first reading at an unmapped one — reward weight chases the frontier, not the pin.
5. **Corroboration as trust.** Reviews and metadata are not trusted on submission; they are *substantiated* when later contributors confirm them. Each new verification is simultaneously a reward event for the verifier and an audit of everyone before them.
6. **Deferred reward kills the fake review.** A solo claim — venue or subjective — earns nothing until independent contributors corroborate it. A sock puppet's claim sits inert forever; only claims that survive contact with strangers pay out.

**Known attack surface:** once venue organisers pay, corroboration itself becomes the target — astroturfed venues, contributor rings validating each other's fiction. Mitigations that fit today's architecture: weight corroboration by the corroborator's substantiated history, keep IP-hash + rate-limiting as the friction floor, and count *independent identity clusters* rather than raw numbers.

In one sentence: *the network becomes meaningful when contribution is ambient, reputation accrues through corroboration, and reward weight chases the unverified.*

This is a hypothesis, not a shipped feature — the pieces below move it from pull-based (open the form) to push-based (the app notices an unmeasured place).

---

## Near-term priorities

Carried over from review — ordered by what changes the first-run impression:

1. **De-clutter first paint.** One lead card on the map; queue the bounty nudge, coach card, and concierge behind scroll or dismissal.
2. **Cold-start reads as opportunity, not absence.** Empty states and the bounty board lead with "map this area" — the current copy is right, the placement should lead.
3. **One showreel moment.** The `CinematicMap` line ride is the seed; a whole-network self-draw sequence on `/tour` gives the design crowd their screenshot.
4. **Ambient contribution v1.** Passive location check → gentle "run a test here?" nudge when the user is at/near an unmeasured or stale venue. Prerequisite for the hypothesis above.
5. **Ship `pnpm base44:deploy`** — `Community.submitted_by` is local-only until the entity update lands.

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
