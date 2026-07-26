# Base44 Dev Build-Off — Submission Package

Everything the submission form asks for, copy-paste ready. This is a **fresh
submission for the Base44 Build-Off** (not the earlier Vercel/AWS hackathon —
that package lives in `submission.md`).

---

## Form fields

| Field | Value |
|---|---|
| **Project title** | Lattency |
| **One-line pitch** | A live, AI-guided metro map of verified workspace wifi, where contributors earn crypto for ground-truth speed tests and an AI concierge reads the whole network to answer "where should I work?" |
| **Surface type** | Web app |
| **Live URL** | https://lattency.vercel.app/ |
| **GitHub repo** | https://github.com/thisyearnofear/lattency |
| **Demo video URL** | (record from `base44-demo-video.md`, ~2:30) |
| **Agentic IDE used** | Claude Code (Factory Droid) |
| **Base44 App ID** | (fill after `base44 create`/`link`) |
| **Social post** | (required — tag @base44 on X/LinkedIn; reuse the one-line pitch + video) |

---

## Project write-up (the scored "documentation" field)

> **Lattency** is a metro map of a city's laptop-friendly workspaces. Venues are
> stations; the three lines are speed tiers — Express (≥50 Mbps), Local (10–49),
> and Suspended (<10). Anyone can run an in-browser speed test; contributors who
> close a sponsor-funded bounty earn NIM on the Nimiq blockchain.
>
> **Why Base44.** The product is a real-time, multi-sided network: contributors
> write readings, an AI reads the whole dataset, sponsors fund bounties, and
> everyone watches the map change live. That needs a database, auth, serverless
> logic, realtime, AI, and scheduled jobs — the exact stack Base44 ships as one
> managed backend. We run the Next.js frontend on Vercel and point it entirely
> at Base44 via the SDK; there is no other backend.
>
> **What's novel.** Most wifi maps are passive and stale. Lattency is (1)
> crypto-incentivized, so data stays fresh; (2) objective, only verifiable speed
> facts, no star ratings; and (3) agent-ready — a Base44 AI agent consumes the
> verified dataset to answer "where should I work right now?" In the agentic era,
> Lattency is the physical-world oracle that AI assistants query because they
> can't walk into a café and test the wifi themselves.

---

## Backend features checklist (the primary judging lever)

Tick **every** box. Most entries will tick 2–3; this is where we win.

- [x] **Database / Entities** — `Cafe`, `Measurement`, `Sponsorship`, `Bounty`
      schemas in `base44/entities/`, row-level security rules included.
- [x] **Authentication** — Base44 auth module wired via `lib/base44-auth.ts`
      (session, sign-in/out), gated so the app degrades to anonymous mode.
- [x] **Backend Functions** — seven Deno functions under `base44/functions/`:
      `list-cafes`, `get-cafes-near`, `get-cafe-stats`, `create-cafe`,
      `generate-venue-summary`, `update-bounty-progress`, `expire-bounties`.
- [x] **Realtime** — `entities.Measurement.subscribe()` drives a live map
      (`hooks/use-realtime-cafes.ts` + `components/live-map.tsx`); the network
      refreshes the instant anyone submits a reading, anywhere.
- [x] **AI Agents** — `base44/agents/workspace_concierge.jsonc`, a concierge
      with read tools on `Cafe`/`Measurement` and function tools, surfaced as a
      full in-app chat panel (`components/concierge-chat.tsx`).
- [x] **Built-in Integrations** — `generate-venue-summary` calls
      `integrations.Core.InvokeLLM` to write a one-line editorial review of each
      venue from its verified stats (`components/ai-venue-summary.tsx`).
- [x] **Automations** — two `function.jsonc` automations: an **entity-event**
      trigger that bumps bounty progress on every new measurement, and a
      **scheduled cron** job that expires stale bounties daily.
- [x] **Row-level / field-level security** — per-entity `rls` blocks.

### Feature → file map (for the write-up or a judge who asks)

| Feature | Where |
|---|---|
| Entities | `base44/entities/{Cafe,Measurement,Sponsorship,Bounty}.json` |
| Auth | `lib/base44-auth.ts`, `lib/base44.ts` |
| Functions | `base44/functions/*/entry.ts` |
| Realtime | `hooks/use-realtime-cafes.ts`, `components/live-map.tsx` |
| AI agent | `base44/agents/workspace_concierge.jsonc`, `components/concierge-chat.tsx` |
| Integrations (LLM) | `base44/functions/generate-venue-summary/entry.ts` |
| Automations | `base44/functions/update-bounty-progress/function.jsonc`, `base44/functions/expire-bounties/function.jsonc` |

---

## Architecture (one paragraph)

The frontend is **Next.js 16 on Vercel** (kept on Vercel because Base44 site
hosting is SPA-only and we use server components + API routes). The entire
backend is Base44: data lives in four entities; reads flow through SDK calls and
the `list-cafes`/`get-cafe-stats` functions (aggregation + tier classification
computed server-side under service role); writes go through the `create-cafe`
function (atomic café + first measurement, two-phase with rollback) and direct
`Measurement.create`; the map subscribes to `Measurement` for realtime; the
concierge is a Base44-hosted agent; venue summaries use the built-in LLM
integration; and two automations keep bounty progress and expiry current with no
manual work. A bundled snapshot (`lib/mock-cafes.ts`) is the graceful fallback so
the demo never white-screens before Base44 is wired.

---

## The three-sentence differentiator (if a judge skims)

1. We used the **widest** slice of the Base44 backend of any entry — entities,
   auth, functions, realtime, an AI agent, built-in LLM integrations, **and** two
   automations.
2. The AI agent isn't a demo bolt-on; it's the product thesis — a
   physical-world oracle that reads verified ground-truth data to tell you where
   to work.
3. It's a genuine multi-sided network with a crypto payout rail (Nimiq), so the
   "realtime + AI + automations" all have something real to act on.

---

## Required social post (draft)

> Built **Lattency** for the @base44 Dev Build-Off — a live metro map of
> verified workspace wifi. Contributors run speed tests and earn crypto; the map
> updates in realtime; and a Base44 AI agent reads the whole network to answer
> "where should I work right now?" One backend: entities, auth, functions,
> realtime, an AI agent, built-in LLM integrations, and automations.
>
> Live: https://lattency.vercel.app/
> (video below)
