# Nimiq Mini Apps Competition Submission Pitch

## One-liner

> **Lattency** is a metro map of laptop-friendly workspaces, live in London, Nairobi, and San Francisco. Contributors run verified speed tests and earn NIM from sponsor-funded bounties. It's the first crypto-incentivized ground-truth network for workspace quality, and a physical-world oracle for the agentic era.

---

## What it does

Lattency maps cafés, coworking spaces, hotel lobbies, libraries, and hybrid venues as stations on a metro map. The three lines are speed tiers — Express (≥50 Mbps), Local (10–49 Mbps), and Suspended (<10 Mbps).

Anyone in a live city can:

1. Open the Mini App inside Nimiq Pay.
2. Find a nearby workspace with verified wifi and objective metadata.
3. Run an in-browser speed test.
4. Earn NIM when the reading completes a sponsor-funded bounty.

The speed test is the trust mechanism. The NIM reward is the growth mechanism. The map is the product.

---

## The problem it solves

Remote workers and digital nomads waste hours every week searching for a place to work. Existing tools tell you *where* a café is, but not whether you can join a video call there. Lattency answers that with verified, objective data from people who are physically present.

---

## Nimiq integration

Nimiq Pay is not a logo on the page — it is the transaction layer.

- **`@nimiq/mini-app-sdk`** initializes inside the Nimiq Pay WebView and exposes the user's wallet address via `listAccounts()`.
- **Bounties are funded in NIM.** Sponsors stake NIM to incentivise verified readings.
- **Contributors earn NIM.** When a bounty's target is met, the contributor taps **Claim NIM** on the bounty card; `POST /api/bounties/claim` verifies eligibility and executes the payout.
- **Every speed test is a real transaction.** The Mini App generates verified economic activity inside the Nimiq ecosystem.

Supporting NIM earns bonus points under the competition rules.

### How the payout flow works

1. Contributor opens the Mini App in Nimiq Pay.
2. The app calls `init()` and `listAccounts()` to get the wallet address.
3. After a verified speed test, completed bounties show a **Claim NIM** button.
4. The client calls `POST /api/bounties/claim` with `{ bountyId, nimiqAddress }`.
5. The server checks `progress >= target`, marks the bounty `claiming`, executes the payout, and returns a `txHash`.
6. The UI updates to show the bounty as claimed.

The on-chain broadcast is implemented in `lib/nimiq-payout.ts` using `@nimiq/core`. It signs a real basic transaction from a dedicated escrow hot wallet and broadcasts it via the JSON-RPC endpoint configured by `NIMIQ_RPC_URL`. If `NIMIQ_PRIVATE_KEY` is not configured (or `NIMIQ_PAYOUT_MOCK=1`), the function falls back to a mock so development and testing can continue without real funds.

**Environment configuration** (all in `.env.local` / deployment secrets):

| Variable | Purpose |
|---|---|
| `NIMIQ_PRIVATE_KEY` | Hex private key of the escrow hot wallet. Never commit this. |
| `NIMIQ_NETWORK` | `mainnet`, `testnet` (default), or `devnet`. |
| `NIMIQ_NETWORK_ID` | Optional integer override if the default network mapping changes. |
| `NIMIQ_RPC_URL` | JSON-RPC endpoint. Default switches by network. |
| `NIMIQ_PAYOUT_MOCK` | Set to `1` to keep the mock path even when a key is configured. |

### Sponsor dashboard

The `/partners` page now includes a **Sponsor Dashboard** where anyone can:

1. Fill in the bounty details (goal, area, target, reward in NIM, sponsor name/type, bounty type, expiry).
2. Confirm the NIM payment to the escrow address via `nimiq.requestPayment()`.
3. The server creates the bounty and it appears in the public bounty board.

This demonstrates the other side of the Nimiq transaction loop: sponsors paying NIM into the ecosystem to fund contributor rewards.

---

## Agentic differentiation

AI agents cannot walk into a café and run a speed test. They need a trusted, verified, real-time source of physical-world infrastructure data to make decisions for their human users.

Lattency is a **physical-world oracle** for the agentic era. The in-app AI concierge (a Base44-hosted agent) reads the whole dataset and answers questions like:

- *"Where nearby has >50 Mbps, oat milk, and power outlets?"*
- *"Where should I go for a video call right now?"*
- *"Plan a remote-work day around good wifi."*

We are not building an agent. We are building the ground-truth layer that agents consume.

---

## Target audience

- **Contributors:** Remote workers, digital nomads, and students who want to earn NIM for verifying local workspaces.
- **Consumers:** Anyone who needs to find a reliable workspace in a live city.
- **Sponsors:** ISPs, coworking operators, café owners, and property managers who want verified data about workspace quality.

---

## Why three cities

London, Nairobi, and San Francisco each prove a different dimension:

- **London** — builder is there; dense with remote workers; cafés + coworking + hotel lobbies.
- **Nairobi** — fast-growing remote-work scene; mobile-first; the original board.
- **San Francisco** — mature tech hub; stress-test for a third geography.

Adding a fourth city is one entry in the CITIES registry. The engine is genuinely city-agnostic.

---

## Key metrics for the competition

| Goal | Target |
|---|---|
| Verified venues across 3 cities | 30+ |
| Unique Nimiq wallets interacting | 50+ |
| Verified speed tests | 100+ |
| Bounties funded and paid in NIM | 10+ |
| AI/LLM endpoint consumers | 1+ integrations |

---

## What makes it original

Most wifi maps are passive and stale. Lattency is:

- **Crypto-incentivized:** contributors earn NIM, so data stays fresh.
- **Objective:** no subjective reviews, only verifiable facts.
- **Agent-ready:** the dataset is designed to be consumed by AI agents.
- **Local-first:** we own one neighbourhood before expanding.

---

## Submission links

- **Live app:** https://lattency.vercel.app/
- **GitHub:** https://github.com/thisyearnofear/lattency
- **Tour page:** https://lattency.vercel.app/tour

---

## 250-word description
> Lattency is a metro map of laptop-friendly workspaces, live in London, Nairobi, and San Francisco. Venues are stations; the three lines are speed tiers. Inside the Nimiq Pay Mini App, anyone can find a nearby workspace, run a verified speed test, and earn NIM from sponsor-funded bounties.
>
> Existing tools tell you where a café is; Lattency tells you whether you can work there. Every reading is verified by an in-browser speed test (download, upload, ping, jitter, loss) and paired with objective metadata: power outlets, seating, noise level, table space, and price. Contributors earn NIM for reliable data; sponsors fund bounties for under-mapped areas.
>
> In the agentic era, Lattency becomes even more valuable. AI assistants cannot walk into a café and test wifi. They need a trusted physical-world oracle. The in-app AI concierge (a Base44-hosted agent) reads the whole dataset so any assistant can query it.
>
> Three very different cities prove the engine is city-agnostic from day one. Adding a fourth is one registry entry, no new code. The data layer is the real moat, and Nimiq Pay is the rails that makes it work.
