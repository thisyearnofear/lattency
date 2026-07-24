# Lattency Vision: Shoreditch → Nimiq Mini App

> A metro map of the best places to get coffee and get online.
> Starting in Shoreditch, London.

---

## Why we’re doing this

The original Lattency was built for Nairobi. It was a strong hackathon project, but the builder is in London. The most valuable thing we can do is **solve our own problem** in the place where we actually live, work, and can recruit users by hand.

For the Nimiq Mini Apps Competition, that means: build the definitive map of Shoreditch’s laptop-friendly venues, reward contributors with NIM, and prove the model works before expanding.

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

| Venue type | Why it belongs | Example in Shoreditch |
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

## Market: why Shoreditch

Shoreditch is ideal for v1 because:

1. **High density of remote workers** — tech, media, freelancers.
2. **Mix of cafés and coworking spaces** — lets us test the expanded venue taxonomy immediately.
3. **Walkable** — a contributor can cover 10 venues in an afternoon.
4. **Builder is there** — we can do Paul Graham-style unscalable things: hand-recruit venues, run tests ourselves, talk to users.

After Shoreditch, the next stops are Hoxton, Old Street, Dalston, then the rest of London. The engine is city-agnostic.

---

## Nimiq integration: the core loop

The Mini App runs inside Nimiq Pay. The transaction layer is the product, not a bolt-on.

1. **Sponsor funds a bounty in NIM.**
   - Example: *"5 verified tests at quiet coworking spaces in Shoreditch"*
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
| **Usefulness** | 20+ Shoreditch venues with verified readings |
| **Marketing** | 50+ unique Nimiq wallets interact with the Mini App |
| **Bonus** | NIM is the default reward token |

---

## Roadmap

### Week 1: Foundation
- Update data model for venue types and workspace metadata ✅
- Seed Shoreditch with 6–10 real venues ✅
- Expose `/api/shoreditch/llm` as a physical-world oracle for agents ✅
- Scaffold the Automated Bounty Agent ✅
- Integrate `@nimiq/mini-app-sdk` ✅
- NIM payout flow for completed bounties ✅

### Week 2: Nimiq loop
- Sponsor-funded bounties ✅
- Sponsor dashboard at /partners to create + fund bounties in NIM ✅
- NIM payout on verified speed test ✅
- Mobile-first Mini App polish
- Replace mock payout (`lib/nimiq-payout.ts`) with real on-chain broadcast using a secure signer / escrow wallet ✅

### Week 3: Users
- Recruit contributors in Shoreditch
- Run real speed tests
- Drive Nimiq wallet interactions

### Week 4: Polish + submit
- Demo video
- Submission package (see `docs/nimiq-pitch.md`)
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
- `/api/shoreditch/llm` — LLM-readable verified workspace data
- `scripts/bounty-agent.ts` — identifies gaps and suggests/deploys NIM bounties

### What comes later
- Agent-to-agent bounty negotiation
- LLM plugins for calendar / travel / productivity assistants
- Real-time workspace availability via human contributors

---

## One-liner for the submission form

> Lattency is a metro map of Shoreditch’s laptop-friendly coffee spots. Contributors run verified speed tests and earn NIM from sponsor-funded bounties. It’s the first crypto-incentivized ground-truth network for workspace quality — starting with one London neighbourhood, built to map every city next.
