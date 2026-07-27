# Lattency — Submission Package (current)

Everything a judge needs, in one place. Copy-paste ready.

---

## Quick facts

- **Live app:** https://lattency.vercel.app/ (redirects to /london)
- **Repo:** https://github.com/thisyearnofear/lattency
- **Backend:** Base44 (entities, auth, Deno functions, AI agent, automations)
- **Payments:** Nimiq Pay (NIM bounties for verified speed tests)
- **Frontend:** Next.js 16.3 on Vercel (App Router, RSC, ISR)
- **Cities live:** London, Nairobi, San Francisco

---

## One-line pitch

> Lattency turns crowdsourced café wifi speeds into a metro map. Contributors run real speed tests, stations appear on speed-tier lines, and bounties pay out in NIM. Live in three cities on one engine.

---

## Full description (for a long-form submission field)

> **Lattency** is a crowdsourced metro map of café wifi speeds. Cafés, coworking spaces, and hotel lobbies are stations; the three lines are speed tiers — Express (≥50 Mbps, video calls OK), Local (10–49 Mbps, email & browsing), and Suspended (<10 Mbps, avoid for calls).
>
> Anyone can join in 60 seconds: open the map, tap "+ Map a café", run a real in-browser speed test from where you're sitting, and your station appears on the line instantly. The speed test is the trust mechanism — a real round-trip to a Vercel edge can't be faked from a fake IP.
>
> Sponsors (ISPs, café owners, community members) fund bounties in NIM for verified readings. When a contributor's test closes a bounty, the NIM pays out to their Nimiq Pay wallet. Real transactions, real blockchain, real incentives.
>
> The backend is entirely **Base44**: four entities (Cafe, Measurement, Sponsorship, Bounty), seven Deno backend functions, realtime subscriptions that update the map the instant anyone submits a reading anywhere, a Base44 AI agent ("the Oracle") that reads the whole network to answer "where should I work?", built-in LLM integrations for auto-generated venue summaries, and two automations (entity-event bounty progress + scheduled cron expiry). There is no other backend.
>
> The frontend is **Next.js 16.3 on Vercel** with a schematic ↔ geographic map toggle, a split-flap city switcher, optimistic pin drops, arrival animations, tier promotion ceremonies, a personal trail (localStorage, no account needed), URL-as-state deep links (?tier=express, ?hood=hoxton), and a first-visit coach. The newsprint/transit design language (hard offset shadows, square corners, mono uppercase labels, serif-italic editorial voice) is cohesive and deliberate — no rounded corners, no soft shadows, no generic SaaS aesthetic.
>
> Live in **London** (9 stations: Shoreditch, Farringdon, Old Street, London Fields, Spitalfields), **Nairobi** (12 stations: Westlands, Kilimani, CBD, Karen), and **San Francisco** (12 stations: SOMA, Mission, Hayes Valley, Marina, NoPa, Outer Sunset). One engine, every city.

---

## Short fields (if the form separates them)

**What does it do:**
> Maps café wifi speeds like a metro network. Contributors run real speed tests, stations appear on Express / Local / Suspended lines, and sponsor-funded bounties pay out in NIM when readings get verified. Live in London, Nairobi, and San Francisco.

**Why did you build it:**
> Finding a café where you can actually take a video call is a guessing game. Lattency turns scattered anecdotal speed data into a recognizable transit network at a glance — and makes contributing so fast (60 seconds, no account) that the map stays fresh.

**What's the tech:**
> Base44 (entities + Deno functions + AI agent + realtime + automations) as the entire backend. Next.js 16.3 on Vercel for the frontend. Nimiq Pay for NIM bounty payouts. In-browser speed test hitting Vercel edge endpoints. No Postgres, no custom infra.

---

## Architecture (one paragraph)

The frontend is Next.js 16 on Vercel (kept on Vercel for SSR, OG images, ISR, and speed-test endpoints). The entire backend is Base44: data lives in four entities; reads flow through SDK calls and the `list-cafes`/`get-cafe-stats` functions (aggregation + tier classification computed server-side under service role); writes go through the `create-cafe` function (atomic café + first measurement, two-phase with rollback); the map subscribes to `Measurement` for realtime updates; the concierge is a Base44-hosted AI agent with read tools on the dataset; venue summaries use the built-in LLM integration; and two automations keep bounty progress and expiry current with no manual work. A bundled snapshot (`lib/mock-cafes.ts`) is the graceful fallback so the demo never white-screens before Base44 is wired.

---

## Feature checklist

- [x] **Multi-city routing** — dynamic `app/[city]/page.tsx`, SSG via `generateStaticParams`, split-flap city switcher with prefetch
- [x] **Realtime map** — `Measurement.subscribe()` refetches the network live; arrival rings + promotion toasts
- [x] **AI concierge** — Base44 agent reads the dataset, answers "where should I work?"
- [x] **AI venue summaries** — `InvokeLLM` generates editorial one-liners, cached on `Cafe.ai_summary`
- [x] **Optimistic pin drop** — station appears before the API round-trips
- [x] **Personal trail** — contributed stations drawn as a dotted line (localStorage, no account)
- [x] **URL-as-state** — `?tier=express` filters the map, `?hood=hoxton` focuses geographic view
- [x] **In-browser speed test** — download (10 MB blob), upload (3×1 MB), ping/jitter/loss (10 HEAD requests)
- [x] **NIM bounty payouts** — real on-chain transactions via `@nimiq/core`, escrow wallet
- [x] **Rate limiting** — SHA-256 hashed IPs, per-IP-per-café per 10 min
- [x] **Outlier detection** — readings >5× or <0.2× median flagged, never rejected
- [x] **First-visit coach** — dismissible corner ticket, shown once
- [x] **Self-running product reel** — /tour has an animated storyboard of the full loop
- [x] **Automations** — entity-event bounty progress + scheduled cron expiry
- [x] **Row-level security** — per-entity `rls` blocks in Base44

---

## Pre-flight checklist

- [ ] Lattency loads at https://lattency.vercel.app/ → redirects to /london
- [ ] /london, /nairobi, /sf all render with stations
- [ ] /tour shows the animated product-loop reel
- [ ] OG image at /opengraph-image says "Live in 3 cities" (not "brewed in Nairobi")
- [ ] Speed test runs from the contribution form
- [ ] City switcher flips between cities with split-flap animation
- [ ] "Ask the Oracle" button opens the concierge chat
- [ ] Bounties board shows city-specific bounties

---

## Key files

| File | Role |
|---|---|
| `app/[city]/page.tsx` | Dynamic city route (SSG) |
| `app/page.tsx` | Root redirect → /london (carries query params) |
| `components/map-shell.tsx` | Schematic ↔ geographic map, optimistic pins, trail, URL-as-state |
| `components/live-map.tsx` | Realtime wrapper (Measurement.subscribe) |
| `components/loop-storyboard.tsx` | Self-running product reel on /tour |
| `components/onboarding-overlay.tsx` | First-visit coach ticket |
| `components/city-switcher.tsx` | Split-flap multi-city selector |
| `components/map-toast.tsx` | Shared toast system (arrival, promotion) |
| `components/concierge-chat.tsx` | AI oracle drawer |
| `components/cafe-contribution-form.tsx` | 5-step contribution flow + speed test |
| `lib/base44.ts` | SDK client singleton |
| `lib/base44-data.ts` | Data-access layer |
| `lib/cities.ts` | City registry (London, Nairobi, SF) |
| `lib/mock-cafes.ts` | Bundled fallback (33 stations across 3 cities) |
| `lib/bounties.ts` | City-aware bounty logic |
| `lib/map-data.ts` | Tier paths, waypoints, tier helpers |
| `base44/entities/` | Entity schemas |
| `base44/functions/` | 7 Deno backend functions |
| `base44/agents/workspace_concierge.jsonc` | AI agent config |
